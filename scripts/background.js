/**
 * Background Service Worker (Manifest V3)
 * Manages default extension state, sync storage initialization,
 * and dynamic action badge updates based on blocked items.
 */

// Default configuration settings
const DEFAULT_PREFERENCES = {
  enabled: true,
  keywords: ["clickbait", "spoiler", "reaction"],
  categories: {
    gaming: false,
    music: false,
    news: false,
    entertainment: false,
    sports: false,
    shorts: true // Frequently requested to block Shorts
  },
  stats: {
    totalBlocked: 0
  }
};

// Initialize settings on first installation
chrome.runtime.onInstalled.addListener(async (details) => {
  if (details.reason === "install") {
    const existing = await chrome.storage.sync.get(["enabled", "keywords", "categories", "stats"]);
    const initialConfig = {
      enabled: existing.enabled !== undefined ? existing.enabled : DEFAULT_PREFERENCES.enabled,
      keywords: existing.keywords || DEFAULT_PREFERENCES.keywords,
      categories: existing.categories || DEFAULT_PREFERENCES.categories,
      stats: existing.stats || DEFAULT_PREFERENCES.stats
    };

    await chrome.storage.sync.set(initialConfig);
    console.log("[YT Blocker Background] Default preferences initialized:", initialConfig);
  }
});

// Update badge text based on state and blocked counts per tab
chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
  if (message.type === "UPDATE_BLOCKED_COUNT" && sender.tab?.id) {
    const count = message.count || 0;
    const tabId = sender.tab.id;

    chrome.storage.sync.get(["enabled"], (data) => {
      const isEnabled = data.enabled !== false;
      if (!isEnabled) {
        chrome.action.setBadgeText({ tabId, text: "OFF" });
        chrome.action.setBadgeBackgroundColor({ tabId, color: "#71717a" }); // Gray
      } else if (count > 0) {
        chrome.action.setBadgeText({ tabId, text: count > 99 ? "99+" : String(count) });
        chrome.action.setBadgeBackgroundColor({ tabId, color: "#dc2626" }); // Red
      } else {
        chrome.action.setBadgeText({ tabId, text: "" });
      }
    });

    sendResponse({ received: true });
  }

  // Allow asynchronous response if needed
  return true;
});

// Listen for storage changes to update badge immediately if extension is toggled on/off
chrome.storage.onChanged.addListener((changes, areaName) => {
  if (areaName === "sync" && changes.enabled !== undefined) {
    const isEnabled = changes.enabled.newValue;
    chrome.tabs.query({ active: true, currentWindow: true }, (tabs) => {
      if (tabs[0]?.id) {
        if (!isEnabled) {
          chrome.action.setBadgeText({ tabId: tabs[0].id, text: "OFF" });
          chrome.action.setBadgeBackgroundColor({ tabId: tabs[0].id, color: "#71717a" });
        } else {
          chrome.action.setBadgeText({ tabId: tabs[0].id, text: "" });
        }
      }
    });
  }
});
