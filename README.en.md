# Manga Viewer for X v0.6.0

A Chrome extension that opens a vertical-stitching viewer for manga when you click an image on X (formerly Twitter). An unofficial tool, not affiliated with X Corp.

[日本語の README](README.md)

## Install / update
1. Unzip to a folder (replace the folder if you have an older version).
2. Open `chrome://extensions/` in Chrome and turn on "Developer mode" (top right).
3. Click "Load unpacked" and select the folder.
   - Updating from v0.3.0: the reload button (↻) on the extension card is enough. Updating from v0.2.0 (X Manga Viewer): remove the old version first, then load again (the name and background script changed).
4. Reload your x.com tabs.

## Usage
- Click an image in a tweet to open the viewer.
- Images from the same author's thread (consecutive replies) are stitched vertically in posting order.
  - Opened on a tweet page (/status/...): that page's thread is loaded.
  - Opened from the timeline, search, lists, etc.: the viewer stays open while the page moves to the tweet page in the background and loads the thread. Closing it returns you to where you were.
- Middle-click / Ctrl(⌘)+click: opens the tweet page in a new tab, and the viewer opens when that tab is shown (add Shift to open it in the foreground).
- Shift+click (new window) and Alt+click behave as usual.
- Always the best quality (name=orig); falls back to 4096x4096 → large on failure.
- The toolbar at the top right is transparent until you move the mouse over it, so it does not get in the way of reading. While transparent, clicks at that spot go to the toolbar, so click-to-advance does not work there. Keyboard shortcuts (1–6, +/-, 0, Esc, ...) work even while it is transparent.

| Action | Result |
|---|---|
| Wheel / ↑ ↓ / Space | Scroll |
| Ctrl+wheel | Zoom (around the cursor) |
| Click image / → / j / n | Next image |
| Shift+click / ← / k / p | Previous image |
| 1–6 | View mode (button order: Equal / Scale / Width / Height / Auto / Orig) |
| + / - / 0 | Zoom in / out / reset |
| Esc / q / click on the margin | Close |

## Settings
Open `chrome://extensions/` → "Details" of this extension → "Extension options" (or right-click the extension icon → "Options"). Changes are saved automatically and also apply to open x.com tabs.
- **View mode on open**: "Last used mode" (default; starts with the mode you last picked in the viewer) or a fixed mode.
- **Base width**: base width for Equal / Scale modes (30–100%, default 75%).
- "Reset to defaults" restores both.

## View modes
| Mode | Idea | Width of each image |
|---|---|---|
| Equal | Read a series at the same width; the scale differs per image (default) | Base width |
| Scale | Assume a series is drawn at the same resolution and use one scale for all images | Scale that gives the first image the base width × each image's width |
| Width | Fit to the screen width | Screen width |
| Height | One image fits the screen vertically | Screen height × aspect ratio (up to the screen width) |
| Auto | Tall images fit the width, wide ones fit the screen | Never enlarged beyond the original size |
| Orig | Image pixels as they are | Image width |

- The base width is a share of the screen width (default 75%). Change it in the settings (30–100%). To resize on the spot, use the toolbar's ＋/− or Ctrl+wheel zoom (it returns to 100% when you switch modes).
- In Scale mode, differences in image size (spreads, small inserts) are shown as they are. Images wider than the first one can exceed the base width and scroll horizontally.
- The first (reference) image of Scale mode is loaded first. Until it loads, another loaded image is used instead, and unloaded images are assumed to have the same pixel width as the reference (corrected after loading).
- The ＋/− zoom multiplies the width above in every mode.

## Language
The UI follows the browser's display language automatically (Japanese / English; English for any other language). Strings live in `_locales/<language>/messages.json`; to add a language, add a folder there.

## Security and privacy design
- Only the `storage` permission (no `tabs` permission, no host permissions; it cannot read other tabs' URLs or contents).
- Nothing is sent anywhere. Images are loaded from `https://pbs.twimg.com/media/...`, the same place X itself loads them from.
- Only `pbs.twimg.com/media/<alphanumeric>` image URLs are allowed, and URLs are rebuilt after validation.
- The background script only opens a new tab on middle-click and hands that tab the number of the image to open. The hand-off uses `chrome.storage.session` (cleared when the browser closes) and is deleted once read. Every received value is format-checked before use.
- The viewer is built inside a closed Shadow DOM (X's page cannot read its DOM). Which images are loaded can still be observed by the page, as with any image load.
- While the viewer is open, focus is kept inside it and synthetic key/click events from the page are ignored (so buttons on the X page behind it are not pressed by mistake).
- Images behind a sensitive-content warning (blur / overlay) are not hijacked on click and are not included in the thread. Images off-screen cannot be judged, so they are held back until they come into view.
- Settings (view mode, mode on open, base width) are saved in chrome.storage (x.com's localStorage is not used).
- Automatic thread loading takes about 35 seconds at most, and stops when it reaches a recommendation section such as "Discover more".
- Auto loading actually scrolls the page, so X records impressions as it does for normal browsing.

## Limitations
- Opened from an image inside a quote tweet or a profile's media tab, only that tweet's images are shown.
- Replies behind "Show more replies" are not loaded.
- Sensitive-content and recommendation-section detection are estimates that depend on X's page structure.
- In Scale mode, if one image fails to load at the best quality and shows at a lower quality, it is displayed smaller.
- It may stop working if X's DOM structure changes.

## License
[MIT License](LICENSE). Free to use, with no warranty.

## About
This extension was built with the help of Claude (Anthropic). It is an unofficial tool, not affiliated with X Corp., provided without warranty. It may stop working when X's page structure changes.
