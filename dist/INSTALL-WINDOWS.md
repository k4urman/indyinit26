# Install Sentinel on Windows (no build tools)

You only need the `sentinel-chrome.zip` file in this folder. No Node.js, no coding.

## Download the zip

On GitHub, open `dist/sentinel-chrome.zip` on the `so-far-product` branch, then click
**Download raw file** (the download icon, top-right of the file view). Save it to your Desktop.

## Unzip it

Right-click `sentinel-chrome.zip` → **Extract All…** → Extract. You'll get a folder named
`sentinel-chrome` containing `manifest.json`, `background.js`, etc. Remember where it is —
**don't delete it**; Chrome loads the extension from this folder, not from the zip.

## Load it in Chrome (or Edge — same steps)

1. Open `chrome://extensions` (Edge: `edge://extensions`).
2. Turn on **Developer mode** (top-right toggle).
3. Click **Load unpacked**.
4. Select the unzipped **`sentinel-chrome`** folder (the one with `manifest.json` inside).
5. Pin Sentinel: click the puzzle-piece icon in the toolbar, then the pin next to Sentinel.

That's it — it's now a real, running extension.

## Try it

- Click the Sentinel icon → paste `paypa1.com` into **Check a link** → it's flagged as a fake PayPal.
- Right-click any link on a page → **Check this link for scams**.
- Open **Settings** (from the popup) and move the protection slider.
- Browse normally — a red block page or a warning sheet appears on anything risky.

The full fake-scam demo (fake Chase, USPS, virus alert, etc.) needs the dev setup on a
computer with Node.js — see `docs/HANDOFF.md`. The steps above are enough to show the real,
installed product.

## Notes

- Keep the unzipped folder; deleting it removes the extension.
- "Developer mode" is just how you install an extension that isn't from the Web Store yet.
  Publishing to the Chrome Web Store (so it installs with one click) needs a developer
  account — see `docs/HANDOFF.md`.
- Firefox: use `sentinel-firefox.zip` instead — `about:debugging#/runtime/this-firefox` →
  **Load Temporary Add-on** → pick any file inside the unzipped folder.
