/**
 * Popup Controller (popup.js)
 * Manages user interactions, keyword additions/removals, category toggles,
 * master switch, and syncs immediately with chrome.storage.sync.
 */

document.addEventListener("DOMContentLoaded", () => {
  // DOM Elements
  const masterToggle = document.getElementById("masterToggle");
  const statusBadge = document.getElementById("statusBadge");
  const keywordForm = document.getElementById("keywordForm");
  const keywordInput = document.getElementById("keywordInput");
  const keywordsList = document.getElementById("keywordsList");
  const keywordCount = document.getElementById("keywordCount");
  const pageBlockedCount = document.getElementById("pageBlockedCount");
  const activeFilterCount = document.getElementById("activeFilterCount");
  const resetBtn = document.getElementById("resetBtn");

  const categoryCheckboxes = document.querySelectorAll(".checkbox-card input[data-category]");

  // In-memory state representation
  let state = {
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

  /**
   * Load stored preferences from chrome.storage.sync
   */
  async function loadSettings() {
    try {
      const data = await chrome.storage.sync.get(["enabled", "keywords", "categories"]);
      if (data.enabled !== undefined) state.enabled = data.enabled;
      if (Array.isArray(data.keywords)) state.keywords = data.keywords;
      if (data.categories) state.categories = { ...state.categories, ...data.categories };

      renderUI();
      queryActiveTabStats();
    } catch (err) {
      console.error("[YT Blocker Popup] Error loading settings:", err);
    }
  }

  /**
   * Persist current state to chrome.storage.sync
   */
  async function saveSettings() {
    try {
      await chrome.storage.sync.set({
        enabled: state.enabled,
        keywords: state.keywords,
        categories: state.categories
      });
      renderSummaryStats();
    } catch (err) {
      console.error("[YT Blocker Popup] Error saving settings:", err);
    }
  }

  /**
   * Render all components
   */
  function renderUI() {
    // 1. Master Toggle & Status Badge
    masterToggle.checked = state.enabled;
    if (state.enabled) {
      statusBadge.textContent = "Active";
      statusBadge.classList.remove("disabled");
    } else {
      statusBadge.textContent = "Paused";
      statusBadge.classList.add("disabled");
    }

    // 2. Keyword Chips
    renderKeywords();

    // 3. Category Checkboxes
    categoryCheckboxes.forEach((checkbox) => {
      const catKey = checkbox.dataset.category;
      checkbox.checked = Boolean(state.categories[catKey]);
    });

    renderSummaryStats();
  }

  /**
   * Render keyword tags into the UI
   */
  function renderKeywords() {
    keywordsList.innerHTML = "";

    if (state.keywords.length === 0) {
      keywordsList.innerHTML = `<span class="empty-keywords-msg">No keywords added yet. Add keywords above to block videos.</span>`;
      keywordCount.textContent = "0 keywords";
      return;
    }

    keywordCount.textContent = `${state.keywords.length} keyword${state.keywords.length > 1 ? "s" : ""}`;

    state.keywords.forEach((keyword, index) => {
      const tag = document.createElement("span");
      tag.className = "keyword-tag";

      const text = document.createElement("span");
      text.className = "keyword-text";
      text.textContent = keyword;
      text.title = keyword;

      const removeBtn = document.createElement("button");
      removeBtn.className = "remove-tag-btn";
      removeBtn.innerHTML = "&times;";
      removeBtn.setAttribute("aria-label", `Remove ${keyword}`);
      removeBtn.addEventListener("click", () => {
        removeKeyword(index);
      });

      tag.appendChild(text);
      tag.appendChild(removeBtn);
      keywordsList.appendChild(tag);
    });
  }

  /**
   * Calculate and display active filter count
   */
  function renderSummaryStats() {
    const activeCategories = Object.values(state.categories).filter(Boolean).length;
    const totalFilters = state.keywords.length + activeCategories;
    activeFilterCount.textContent = state.enabled ? totalFilters : "0";
  }

  /**
   * Add new keyword from input
   */
  function addKeyword(rawText) {
    const text = rawText.trim();
    if (!text) return;

    // Avoid duplicates (case-insensitive check)
    const exists = state.keywords.some((k) => k.toLowerCase() === text.toLowerCase());
    if (!exists) {
      state.keywords.push(text);
      saveSettings();
      renderKeywords();
    }

    keywordInput.value = "";
    keywordInput.focus();
  }

  /**
   * Remove keyword by index
   */
  function removeKeyword(index) {
    state.keywords.splice(index, 1);
    saveSettings();
    renderKeywords();
  }

  /**
   * Query the currently active YouTube tab for real-time blocked counter
   */
  function queryActiveTabStats() {
    chrome.tabs.query({ active: true, currentWindow: true }, (tabs) => {
      const activeTab = tabs[0];
      if (activeTab?.id && activeTab.url && activeTab.url.includes("youtube.com")) {
        chrome.tabs.sendMessage(activeTab.id, { type: "GET_PAGE_STATS" }, (response) => {
          if (chrome.runtime.lastError || !response) {
            pageBlockedCount.textContent = "0";
            return;
          }
          pageBlockedCount.textContent = response.blockedOnPage || "0";
        });
      } else {
        pageBlockedCount.textContent = "-";
      }
    });
  }

  // --- EVENT LISTENERS ---

  // Master Toggle Change
  masterToggle.addEventListener("change", (e) => {
    state.enabled = e.target.checked;
    if (state.enabled) {
      statusBadge.textContent = "Active";
      statusBadge.classList.remove("disabled");
    } else {
      statusBadge.textContent = "Paused";
      statusBadge.classList.add("disabled");
    }
    saveSettings();
  });

  // Keyword Form Submit
  keywordForm.addEventListener("submit", (e) => {
    e.preventDefault();
    addKeyword(keywordInput.value);
  });

  // Category Checkbox Change
  categoryCheckboxes.forEach((checkbox) => {
    checkbox.addEventListener("change", (e) => {
      const catKey = e.target.dataset.category;
      state.categories[catKey] = e.target.checked;
      saveSettings();
    });
  });

  // Reset to Defaults Button
  resetBtn.addEventListener("click", () => {
    if (confirm("Reset blocklist and categories to defaults?")) {
      state = {
        enabled: true,
        keywords: ["clickbait", "spoiler", "reaction"],
        categories: {
          gaming: false,
          music: false,
          news: false,
          entertainment: false,
          sports: false,
          shorts: true
        }
      };
      saveSettings();
      renderUI();
    }
  });

  // Initial load
  loadSettings();
});
