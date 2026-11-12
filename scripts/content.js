/**
 * Content Script (content.js)
 * Production-ready DOM blocker for YouTube.
 * Handles SPA navigation, dynamic element mutations, keyword filtering,
 * Shorts blocking, and watch-page category detection.
 */

(() => {
  "use strict";

  // Prevent multiple injections in the same frame
  if (window.__YT_CONTENT_BLOCKER_INITIALIZED__) {
    return;
  }
  window.__YT_CONTENT_BLOCKER_INITIALIZED__ = true;

  // Local copy of user settings
  let settings = {
    enabled: true,
    keywords: [],
    categories: {
      gaming: false,
      music: false,
      news: false,
      entertainment: false,
      sports: false,
      shorts: true
    }
  };

  // State tracking
  let blockedCountOnPage = 0;
  let isSweepScheduled = false;
  let observer = null;

  // Custom CSS injection to ensure reliable blocking without layout flickering
  const STYLE_ID = "yt-content-blocker-style";
  function injectBlockerStyles() {
    if (document.getElementById(STYLE_ID)) return;
    const style = document.createElement("style");
    style.id = STYLE_ID;
    style.textContent = `
      .yt-blocked-item {
        display: none !important;
      }
      #yt-blocker-watch-overlay {
        position: absolute;
        top: 0;
        left: 0;
        width: 100%;
        height: 100%;
        background: rgba(15, 15, 15, 0.96);
        z-index: 9999;
        display: flex;
        flex-direction: column;
        align-items: center;
        justify-content: center;
        color: #ffffff;
        font-family: 'Roboto', -apple-system, BlinkMacSystemFont, sans-serif;
        text-align: center;
        padding: 24px;
        box-sizing: border-box;
      }
      #yt-blocker-watch-overlay .overlay-icon {
        width: 64px;
        height: 64px;
        margin-bottom: 16px;
        fill: #ff4e4e;
      }
      #yt-blocker-watch-overlay h2 {
        font-size: 22px;
        font-weight: 600;
        margin: 0 0 8px 0;
      }
      #yt-blocker-watch-overlay p {
        font-size: 14px;
        color: #aaaaaa;
        max-width: 420px;
        margin: 0 0 20px 0;
        line-height: 1.5;
      }
      #yt-blocker-watch-overlay .bypass-btn {
        background: #272727;
        color: #fff;
        border: 1px solid #3f3f3f;
        padding: 8px 18px;
        font-size: 13px;
        border-radius: 18px;
        cursor: pointer;
        transition: background 0.2s;
      }
      #yt-blocker-watch-overlay .bypass-btn:hover {
        background: #3f3f3f;
      }
    `;
    (document.head || document.documentElement).appendChild(style);
  }

  /**
   * Target selectors for YouTube's custom web components:
   * - ytd-rich-item-renderer: Home & Subscriptions grid videos / shorts
   * - ytd-video-renderer: Standard video search results
   * - ytd-compact-video-renderer: Sidebar / Up Next recommended videos on watch page
   * - ytd-grid-video-renderer: Channel videos grid
   * - ytd-reel-shelf-renderer / ytd-rich-shelf-renderer: Shorts shelves
   * - ytd-reel-item-renderer: Individual shorts items in grids
   */
  const VIDEO_CONTAINER_SELECTORS = [
    "ytd-rich-item-renderer",
    "ytd-video-renderer",
    "ytd-compact-video-renderer",
    "ytd-grid-video-renderer",
    "ytd-reel-item-renderer"
  ].join(",");

  const SHORTS_SHELF_SELECTORS = [
    "ytd-reel-shelf-renderer",
    "ytd-rich-shelf-renderer[is-shorts]",
    "ytd-rich-section-renderer:has(ytd-reel-shelf-renderer)"
  ].join(",");

  /**
   * Helper to extract clean video title from YouTube custom element.
   * YouTube dynamically wraps titles in #video-title (either an <a> or a <yt-formatted-string>).
   */
  function extractVideoTitle(container) {
    // 1. Direct title element inside video card
    const titleEl = container.querySelector("#video-title, #video-title-link, a#video-title");
    if (titleEl) {
      const text = titleEl.getAttribute("title") || 
                   titleEl.getAttribute("aria-label") || 
                   titleEl.textContent;
      if (text && text.trim()) return text.trim();
    }

    // 2. Fallback for shorts cards (which often use #reel-item-title or span inside ytd-reel-item-renderer)
    const reelTitleEl = container.querySelector("#reel-item-title, .yt-core-attributed-string, h3");
    if (reelTitleEl && reelTitleEl.textContent.trim()) {
      return reelTitleEl.textContent.trim();
    }

    return "";
  }

  /**
   * Helper to extract channel name or metadata text from card
   */
  function extractChannelName(container) {
    const channelEl = container.querySelector("#channel-name, ytd-channel-name, #byline, .ytd-channel-name");
    return channelEl ? channelEl.textContent.trim().toLowerCase() : "";
  }

  /**
   * Helper to check if an element is a YouTube Short
   */
  function isShortsElement(container) {
    if (container.tagName.toLowerCase() === "ytd-reel-item-renderer") return true;
    if (container.hasAttribute("is-shorts")) return true;

    // Check link targets
    const link = container.querySelector('a[href*="/shorts/"]');
    if (link) return true;

    return false;
  }

  /**
   * Check if a title or string matches any blocked keyword.
   * Substring matching is case-insensitive.
   */
  function matchesBlockedKeyword(text) {
    if (!text || !settings.keywords || settings.keywords.length === 0) return null;
    const lower = text.toLowerCase();
    for (const kw of settings.keywords) {
      const trimmed = kw.trim().toLowerCase();
      if (trimmed.length > 0 && lower.includes(trimmed)) {
        return kw;
      }
    }
    return null;
  }

  /**
   * Category heuristics for thumbnail feed cards:
   * Since YouTube does not embed detailed genre tags on raw homepage thumbnail cards,
   * we examine badges, topic chips, channel name patterns, and links.
   */
  function matchesBlockedCategory(container, title, channel) {
    if (!settings.categories) return null;

    // 1. Shorts Category Check
    if (settings.categories.shorts && isShortsElement(container)) {
      return "Shorts";
    }

    // 2. Badges and tags check (e.g., YouTube badges showing category or verified topics)
    const badgeElements = container.querySelectorAll("ytd-badge-supported-renderer, .badge, [aria-label]");
    const combinedBadges = Array.from(badgeElements)
      .map(el => (el.getAttribute("aria-label") || el.textContent || "").toLowerCase())
      .join(" ");

    const textToScan = `${title.toLowerCase()} ${channel.toLowerCase()} ${combinedBadges}`;

    if (settings.categories.gaming) {
      if (textToScan.includes("gameplay") || 
          textToScan.includes("walkthrough") || 
          textToScan.includes("esports") || 
          combinedBadges.includes("gaming")) {
        return "Gaming";
      }
    }

    if (settings.categories.music) {
      if (combinedBadges.includes("music") || 
          combinedBadges.includes("official music video") || 
          textToScan.includes("official music video") ||
          textToScan.includes("vevo")) {
        return "Music";
      }
    }

    if (settings.categories.news) {
      if (combinedBadges.includes("news") || 
          textToScan.includes("breaking news") || 
          textToScan.includes("live news")) {
        return "News";
      }
    }

    if (settings.categories.sports) {
      if (combinedBadges.includes("sports") || 
          textToScan.includes("highlights") && (textToScan.includes("fc") || textToScan.includes("nba") || textToScan.includes("nfl") || textToScan.includes("fifa"))) {
        return "Sports";
      }
    }

    return null;
  }

  /**
   * Inspect and filter a single video container
   */
  function processVideoContainer(container) {
    // If extension is disabled, ensure unblocked
    if (!settings.enabled) {
      if (container.classList.contains("yt-blocked-item")) {
        container.classList.remove("yt-blocked-item");
      }
      return false;
    }

    const title = extractVideoTitle(container);
    const channel = extractChannelName(container);

    // If title is not yet populated by YouTube client rendering, keep for next observer pass
    if (!title && !isShortsElement(container)) {
      return false;
    }

    // 1. Keyword check
    const matchedKeyword = matchesBlockedKeyword(title);
    if (matchedKeyword) {
      blockElement(container, `Keyword: "${matchedKeyword}"`);
      return true;
    }

    // 2. Category check
    const matchedCategory = matchesBlockedCategory(container, title, channel);
    if (matchedCategory) {
      blockElement(container, `Category: "${matchedCategory}"`);
      return true;
    }

    // Element is clean: if it was previously blocked, unhide it
    if (container.classList.contains("yt-blocked-item")) {
      container.classList.remove("yt-blocked-item");
      delete container.dataset.ytBlockedReason;
      blockedCountOnPage = Math.max(0, blockedCountOnPage - 1);
    }

    return false;
  }

  /**
   * Applies the blocked state to an element
   */
  function blockElement(element, reason) {
    if (!element.classList.contains("yt-blocked-item")) {
      element.classList.add("yt-blocked-item");
      element.dataset.ytBlockedReason = reason;
      blockedCountOnPage++;
    }
  }

  /**
   * Filter Shorts Shelves (sections containing horizontal reels of shorts)
   */
  function filterShortsShelves() {
    if (!settings.enabled) return;

    if (settings.categories?.shorts) {
      const shelves = document.querySelectorAll(SHORTS_SHELF_SELECTORS);
      shelves.forEach(shelf => {
        if (!shelf.classList.contains("yt-blocked-item")) {
          shelf.classList.add("yt-blocked-item");
          shelf.dataset.ytBlockedReason = "Category: Shorts Shelf";
          blockedCountOnPage++;
        }
      });
    } else {
      // If Shorts category was unblocked, restore shelves
      const blockedShelves = document.querySelectorAll(`${SHORTS_SHELF_SELECTORS}.yt-blocked-item`);
      blockedShelves.forEach(shelf => {
        shelf.classList.remove("yt-blocked-item");
      });
    }
  }

  /**
   * Active Video Watch Page Inspection (/watch)
   * When user navigates directly or clicks on a video, we inspect:
   * 1. The page <meta itemprop="genre"> tag (YouTube embeds the true category here)
   * 2. The h1 video title element
   * 3. ytInitialPlayerResponse metadata
   * If blocked: pause video & show blocked overlay banner
   */
  function checkCurrentWatchPage() {
    if (!settings.enabled || !window.location.pathname.startsWith("/watch")) {
      removeWatchPageOverlay();
      return;
    }

    // Check if user has explicitly bypassed this video in this tab session
    if (window.__YT_WATCH_BYPASSED__ === window.location.href) {
      return;
    }

    // 1. Scrape category from YouTube DOM meta tags
    let category = "";
    const genreMeta = document.querySelector('meta[itemprop="genre"]');
    if (genreMeta && genreMeta.content) {
      category = genreMeta.content.trim();
    }

    // 2. Extract active watch page title
    let title = "";
    const titleEl = document.querySelector("h1.ytd-watch-metadata yt-formatted-string, #title h1 yt-formatted-string");
    if (titleEl) {
      title = titleEl.textContent.trim();
    } else {
      title = document.title.replace(/- YouTube$/i, "").trim();
    }

    let blockReason = null;

    // Check keyword match on watch title
    const matchedKw = matchesBlockedKeyword(title);
    if (matchedKw) {
      blockReason = `Matches blocked keyword: "${matchedKw}"`;
    }

    // Check category match
    if (!blockReason && category && settings.categories) {
      const catLower = category.toLowerCase();
      if (settings.categories.gaming && catLower.includes("gaming")) blockReason = "Category: Gaming";
      else if (settings.categories.music && catLower.includes("music")) blockReason = "Category: Music";
      else if (settings.categories.news && (catLower.includes("news") || catLower.includes("politics"))) blockReason = "Category: News & Politics";
      else if (settings.categories.entertainment && catLower.includes("entertainment")) blockReason = "Category: Entertainment";
      else if (settings.categories.sports && catLower.includes("sports")) blockReason = "Category: Sports";
    }

    // If blocked: pause playback and show overlay
    if (blockReason) {
      enforceWatchPageBlock(blockReason);
    } else {
      removeWatchPageOverlay();
    }
  }

  /**
   * Enforces player blocking on /watch
   */
  function enforceWatchPageBlock(reason) {
    const video = document.querySelector("video");
    if (video) {
      video.pause();
    }

    const playerContainer = document.querySelector("#player-container, #player, #ytd-player");
    if (!playerContainer) return;

    let overlay = document.getElementById("yt-blocker-watch-overlay");
    if (!overlay) {
      overlay = document.createElement("div");
      overlay.id = "yt-blocker-watch-overlay";
      overlay.innerHTML = `
        <svg class="overlay-icon" viewBox="0 0 24 24">
          <path d="M12 2C6.48 2 2 6.48 2 12s4.48 10 10 10 10-4.48 10-10S17.52 2 12 2zm1 15h-2v-2h2v2zm0-4h-2V7h2v6z"/>
        </svg>
        <h2>Content Blocked</h2>
        <p id="yt-blocker-overlay-reason">${escapeHTML(reason)}</p>
        <button class="bypass-btn" id="yt-blocker-bypass-btn">Watch Anyway (Bypass for this tab)</button>
      `;

      playerContainer.style.position = "relative";
      playerContainer.appendChild(overlay);

      const bypassBtn = overlay.querySelector("#yt-blocker-bypass-btn");
      bypassBtn.addEventListener("click", () => {
        window.__YT_WATCH_BYPASSED__ = window.location.href;
        removeWatchPageOverlay();
        const v = document.querySelector("video");
        if (v) v.play();
      });
    } else {
      const reasonEl = overlay.querySelector("#yt-blocker-overlay-reason");
      if (reasonEl) reasonEl.textContent = reason;
    }
  }

  function removeWatchPageOverlay() {
    const overlay = document.getElementById("yt-blocker-watch-overlay");
    if (overlay) overlay.remove();
  }

  function escapeHTML(str) {
    return str.replace(/[&<>'"]/g, 
      tag => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', "'": '&#39;', '"': '&quot;' }[tag] || tag)
    );
  }

  /**
   * Core sweep function: Scans visible DOM containers.
   * Debounced and optimized to prevent browser main-thread jank.
   */
  function runFilterSweep() {
    isSweepScheduled = false;

    if (!settings.enabled) {
      // Unhide all previously blocked items when disabled
      document.querySelectorAll(".yt-blocked-item").forEach(el => {
        el.classList.remove("yt-blocked-item");
      });
      removeWatchPageOverlay();
      blockedCountOnPage = 0;
      notifyBadgeCount();
      return;
    }

    // Filter Shorts shelves if enabled
    filterShortsShelves();

    // Query all video containers currently mounted in DOM
    const containers = document.querySelectorAll(VIDEO_CONTAINER_SELECTORS);
    containers.forEach(container => {
      processVideoContainer(container);
    });

    // Handle watch page specifics
    checkCurrentWatchPage();

    notifyBadgeCount();
  }

  /**
   * Schedules a sweep using requestAnimationFrame and debounce.
   * This is critical for YouTube SPA scrolling performance.
   */
  function scheduleFilterSweep() {
    if (isSweepScheduled) return;
    isSweepScheduled = true;
    requestAnimationFrame(() => {
      setTimeout(runFilterSweep, 60);
    });
  }

  /**
   * Sends the current blocked items count to background script
   */
  function notifyBadgeCount() {
    try {
      chrome.runtime.sendMessage({
        type: "UPDATE_BLOCKED_COUNT",
        count: blockedCountOnPage
      }).catch(() => {
        // Background worker might be idle or context invalidated
      });
    } catch {
      // Ignore extension context invalidated errors during reload
    }
  }

  /**
   * Setup MutationObserver to watch DOM injections:
   * Since YouTube is an SPA that streams data and appends custom elements
   * to infinite scrolling containers, we observe childList changes on document.body.
   */
  function setupMutationObserver() {
    if (observer) observer.disconnect();

    observer = new MutationObserver((mutations) => {
      let shouldSweep = false;

      for (const mutation of mutations) {
        if (mutation.type === "childList" && mutation.addedNodes.length > 0) {
          // Check if any added node is a relevant YouTube element or container
          for (let i = 0; i < mutation.addedNodes.length; i++) {
            const node = mutation.addedNodes[i];
            if (node.nodeType === Node.ELEMENT_NODE) {
              const elName = node.tagName.toLowerCase();
              if (elName.startsWith("ytd-") || node.querySelector?.("ytd-rich-item-renderer, ytd-video-renderer, ytd-compact-video-renderer")) {
                shouldSweep = true;
                break;
              }
            }
          }
        }
        if (shouldSweep) break;
      }

      if (shouldSweep) {
        scheduleFilterSweep();
      }
    });

    observer.observe(document.body || document.documentElement, {
      childList: true,
      subtree: true
    });
  }

  /**
   * Listen for YouTube's native SPA navigation events:
   * 'yt-navigate-finish' fires whenever YouTube changes pages without full reload.
   */
  window.addEventListener("yt-navigate-finish", () => {
    scheduleFilterSweep();
  });

  // Handle popstate for back/forward browser buttons
  window.addEventListener("popstate", () => {
    scheduleFilterSweep();
  });

  /**
   * Listen for real-time setting updates from popup or sync storage
   */
  chrome.storage.onChanged.addListener((changes, areaName) => {
    if (areaName === "sync") {
      if (changes.enabled) settings.enabled = changes.enabled.newValue;
      if (changes.keywords) settings.keywords = changes.keywords.newValue;
      if (changes.categories) settings.categories = changes.categories.newValue;

      // Re-run filter immediately upon configuration change
      scheduleFilterSweep();
    }
  });

  /**
   * Listen for direct messages from popup (e.g. stats request)
   */
  chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
    if (message.type === "GET_PAGE_STATS") {
      sendResponse({
        blockedOnPage: blockedCountOnPage,
        enabled: settings.enabled
      });
    }
    return true;
  });

  /**
   * Initialize script
   */
  async function init() {
    injectBlockerStyles();

    try {
      const stored = await chrome.storage.sync.get(["enabled", "keywords", "categories"]);
      if (stored.enabled !== undefined) settings.enabled = stored.enabled;
      if (stored.keywords) settings.keywords = stored.keywords;
      if (stored.categories) settings.categories = stored.categories;
    } catch (err) {
      console.warn("[YT Blocker] Could not read sync settings:", err);
    }

    setupMutationObserver();
    scheduleFilterSweep();
  }

  // Start when DOM is ready
  if (document.readyState === "loading") {
    document.addEventListener("DOMContentLoaded", init);
  } else {
    init();
  }
})();
