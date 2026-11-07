# Sentinel

**Browse with total confidence.**

Sentinel is a cross-browser extension (Chrome, Edge, Firefox) that detects and blocks scam sites in real time, explains *why* a site is dangerous, and keeps all your data on your device. 

Scam pages do their damage in the first few hours, before traditional blocklists know they exist. Sentinel gives every user a free, private, real-time second opinion at the exact moment they're about to pay, log in, upload, or download.

## Features

### Protection Engine (The "App / Logic")
*   **Whole-Page Blocking:** Replaces high-risk pages with a full "Blocked" interstitial.
*   **Sketchy-Element Highlighting:** Outlines risky elements (fake download buttons, off-domain login forms, scareware dialogs) with tooltips explaining the risk.
*   **Download Scanning:** Pauses risky downloads (like `.exe`, `.msi`, `.apk`, or remote-access tools) and asks for confirmation.
*   **Transaction Scanning:** Warns you before entering card, bank, or crypto details on risky sites.
*   **Upload & Personal-Info Guard:** Warns you before uploading files or typing sensitive data (SSNs, cards, seed phrases) on untrusted sites. *Detected locally, never stored.*
*   **Scareware Lock Breaker:** Escapes fake "your computer is locked" pages by exiting fullscreen, muting audio, and killing alert loops.
*   **Link Checker:** Right-click context menu to check any link before opening it.
*   **Ad Removal / Covering (Optional):** Hide or grey-out ads and malvertising.

### Frontend & UI
*   **Aggressiveness Slider:** A continuous slider from **Chill** to **Paranoid** that adjusts sensitivity (warn/block thresholds) without needing technical knowledge.
*   **Settings Dashboard:** Manage master toggles, view threat counters, manage whitelists/blocklists, and export logs.
*   **Presets for Everyone:** Tailored settings for **Children** (Paranoid + PIN lock), **Older Adults** (Strict + large text), and **Power Users**.
*   **Plain-Language Explanations:** All warnings are written at a ~6th-grade reading level.

---

## Architecture

Sentinel is built as a Manifest V3 extension using **WXT** (Vite-based) and TypeScript, allowing a single codebase to target Chrome, Edge, and Firefox.

```text
+------------------------------ Browser extension (MV3) ------------------------------+
| Content script                 Background (SW / event page)              UI         |
|                                                                                     |
|  * DOM & form signals  <---->  * Risk engine (scoring)                 * Popup      |
|  * Behavior hooks              * URL / domain analysis                 * Dashboard  |
|  * Highlight overlay   <---->  * Policy (slider, lists)                * Interstitial|
|  * PII detector                * Downloads / DNR rules                 * Overlays   |
|                                * Local AI (offscreen doc)                           |
|                                * Storage: settings, lists, log, caches              |
+---------------------------------------|---------------------------------------------+
                                        | (only hash prefixes / domains,
                                        |  never page content by default)
+---------------------------------------v---------------------------------------------+
| Optional cloud                                                                      |
|                                                                                     |
|  * Threat-feed builder (CI)      * Reputation proxy          * Opt-in services      |
|    - pulls PhishTank/OpenPhish     - Safe Browsing v4/v5       - BYO-key LLM        |
|    - signs & publishes lists       - RDAP domain age           - community reports  |
|                                                                - trusted contact    |
+-------------------------------------------------------------------------------------+
```

### How Detection Works
No single trick catches every scam. Sentinel combines independent signal families (Reputation, Identity/Impersonation, Domain Trust, Page Intent, Pressure Language, Hostile Behavior, and Local AI). A page must trip several signals to be blocked, keeping false positives low while catching brand-new scams.

## Getting Started (Local Development)

### Prerequisites
*   [Node.js](https://nodejs.org/) (v18 or higher)
*   `npm` or `pnpm`

### Installation
1. Clone the repository:
   ```bash
   git clone https://github.com/your-org/sentinel.git
   cd sentinel
   ```
2. Install dependencies:
   ```bash
   npm install
   ```
3. Start the development server (WXT will handle the build):
   ```bash
   npm run dev
   ```

### Loading the Extension
*   **Chrome / Edge:** Go to `chrome://extensions/`, enable "Developer mode", click "Load unpacked", and select the `.output/chrome-mv3` folder.
*   **Firefox:** Go to `about:debugging#/runtime/this-firefox`, click "Load Temporary Add-on", and select the `manifest.json` file inside `.output/firefox-mv2`.

### Running Tests
*   **Unit Tests:** `npm run test` (Vitest)
*   **E2E Tests:** `npm run test:e2e` (Playwright)
*   **Linting:** `npm run lint` (ESLint + `web-ext lint`)

---

## Privacy & Permissions Model

Sentinel is built on the principle of **"Free, open source, local-first."**
*   **Local by Default:** No page content, form values, or full URLs leave your device. Reputation lookups send only hash prefixes.
*   **PII is Never Stored:** Typed personal data is detected by pattern only and is immediately discarded.
*   **Incognito Mode:** If enabled, protection runs but *nothing* is logged.
*   **No Remote Code:** All detection logic is bundled. Threat lists are cryptographically signed and verified.
