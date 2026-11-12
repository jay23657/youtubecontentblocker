# YouTube Content & Keyword Blocker

A sleek, lightweight, production-ready **Manifest V3** browser extension that blocks specific YouTube videos, channels, shorts, and recommendations based on user-defined keywords, titles, and categories.

Built specifically for YouTube's modern Single Page Application (SPA) architecture with zero performance degradation.

---

## Features

- **Keyword & Title Filtering**: Instantly hides video cards if their titles contain user-specified keywords (case-insensitive substring match).
- **Category Filtering**: Filter out entire content genres like **Gaming**, **Music**, **News & Politics**, **Entertainment**, and **Sports**.
- **Dedicated YouTube Shorts Blocker**: Cleanly eliminates Shorts shelves (`ytd-reel-shelf-renderer`) and individual Shorts thumbnails across your home feed and search results.
- **Watch Page Player Shield**: If navigating directly to a blocked video or category on `/watch`, the extension pauses playback and displays an unobtrusive block banner with an optional temporary bypass.
- **Dynamic SPA MutationObserver**: Tracks infinite scrolling and dynamic view changes smoothly using a debounced observer and `requestAnimationFrame`.
- **Instant Synchronization**: Preferences persist across tabs and browser restarts using `chrome.storage.sync`.
- **Polished Dark UI**: Native-feeling popup with a master switch, live blocked counter, keyword tag management, and category toggles.

---

## Project Structure

```text
youtube-content-blocker/
├── .gitignore             # Git ignore configuration
├── README.md              # Documentation and install guide
├── manifest.json          # Manifest V3 extension configuration
├── icons/                 # Extension icon assets (tracked in git)
│   ├── icon16.png
│   ├── icon48.png
│   └── icon128.png
├── popup/                 # Extension popup interface
│   ├── popup.html
│   ├── popup.css
│   └── popup.js
└── scripts/               # Core extension scripts
    ├── background.js      # Service worker (lifecycle & dynamic badge)
    └── content.js         # DOM blocker and mutation observer
```

---

## How to Install

### Google Chrome & Chromium-based Browsers (Brave, Opera, Vivaldi)

1. Clone or download this repository to your local computer:
   ```bash
   git clone https://github.com/<your-username>/youtube-content-blocker.git
   ```
2. Open Chrome and navigate to the Extensions management page:
   ```text
   chrome://extensions
   ```
3. Enable **Developer mode** using the toggle in the upper-right corner.
4. Click the **Load unpacked** button in the top-left toolbar.
5. Select the project folder containing `manifest.json`.
6. The extension is now installed and active! Pin it to your browser toolbar for quick access.

### Microsoft Edge

1. Navigate to:
   ```text
   edge://extensions
   ```
2. Enable **Developer mode** in the left sidebar.
3. Click **Load unpacked** and select the extension directory.

---

## How to Use

1. Click the **YT Blocker** icon in your browser toolbar to open the popup.
2. **Master Switch**: Toggle blocking on or off anytime.
3. **Keyword Manager**:
   - Type any keyword, topic, or phrase (e.g. `spoiler`, `clickbait`, `reaction`, `vlog`) and click **Add** (or press <kbd>Enter</kbd>).
   - Click the `×` on any keyword badge to remove it.
4. **Category Toggles**: Check the boxes for any category you want hidden (e.g., *Shorts*, *Gaming*, *News*).
5. Open or refresh [YouTube](https://www.youtube.com) to see unwanted content filtered out seamlessly.

---

## Permissions Breakdown

| Permission | Purpose |
|---|---|
| `storage` | Saves your custom blocklist, category selections, and preferences to `chrome.storage.sync`. |
| `scripting` | Enables programmatic DOM access for dynamic style and script injection. |
| `*://*.youtube.com/*` | Restricts content script execution strictly to YouTube domains for privacy and security. |

---

## License

MIT License. Feel free to modify and distribute.
