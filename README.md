<div align="center">

# Sentinel

**Browse with total confidence.**

A local-first browser extension that detects and blocks scam sites in real time, explains *why* a site is dangerous, and keeps your data on your device.

[![License: MIT](https://img.shields.io/badge/license-MIT-blue.svg)](LICENSE)
![Manifest V3](https://img.shields.io/badge/Manifest-V3-green)
![TypeScript](https://img.shields.io/badge/TypeScript-strict-3178c6)
![Browsers](https://img.shields.io/badge/browsers-Chrome%20%7C%20Edge%20%7C%20Firefox-orange)
![Built at](https://img.shields.io/badge/built%20at-Indy%20Init%20'26-purple)

</div>

---

## Table of Contents

- [Why Sentinel](#why-sentinel)
- [Features](#features)
- [How Detection Works](#how-detection-works)
- [Architecture](#architecture)
- [Repository Layout](#repository-layout)
- [Getting Started](#getting-started)
- [Usage](#usage)
- [Configuration](#configuration)
- [Testing](#testing)
- [Privacy and Permissions Model](#privacy-and-permissions-model)
- [Threat Model](#threat-model)
- [Roadmap](#roadmap)
- [Contributing](#contributing)
- [Security](#security)
- [License](#license)
- [Acknowledgments](#acknowledgments)

---

## Why Sentinel

Scam pages do most of their damage in the first few hours of their life, before traditional blocklists have ever heard of them. A fake invoice portal, a counterfeit shop, or a "your computer is infected" page can be live, collect victims, and disappear before a reputation database catches up.

The people most exposed are often the least equipped to spot the signs: kids, older adults, and anyone rushing through a checkout. Existing tools tend to fail them in one of three ways. They only know about *yesterday's* scams, they send your browsing history to a server, or they throw up a cryptic warning that nobody understands.

Sentinel is built to fix all three:

1. **Real-time.** It analyzes the page you are actually on, so brand-new scams are caught even when no blocklist has them yet.
2. **Private.** Analysis happens on your device. Page content, form values, and full URLs are never uploaded by default.
3. **Understandable.** Every warning explains the specific reason in plain language, written at roughly a 6th-grade reading level.

It acts at the exact moments that matter: right before you **pay, log in, upload, or download**.

---

## Features

### Protection Engine

| Feature | What it does |
| --- | --- |
| **Whole-Page Blocking** | Replaces high-risk pages with a full "Blocked" interstitial that explains the reasons and offers a safe way back. |
| **Sketchy-Element Highlighting** | Outlines risky elements on the page (fake download buttons, off-domain login forms, scareware dialogs) and attaches a tooltip describing the risk. |
| **Download Scanning** | Pauses risky downloads such as `.exe`, `.msi`, `.apk`, or remote-access tools and asks for confirmation before they proceed. |
| **Transaction Scanning** | Warns you before you enter card, bank, or crypto details on a site that looks risky. |
| **Upload and Personal-Info Guard** | Warns you before you upload files or type sensitive data (SSNs, card numbers, seed phrases) on untrusted sites. Detection is pattern-based, runs locally, and nothing is stored. |
| **Scareware Lock Breaker** | Escapes fake "your computer is locked" pages by exiting fullscreen, muting audio, and stopping alert loops so you can close the tab. |
| **Link Checker** | Right-click any link and check it before you open it. |
| **Ad Removal / Covering (optional)** | Hides or greys out ads and malvertising, which are a common delivery route for scams. |

### Frontend and UI

| Feature | What it does |
| --- | --- |
| **Aggressiveness Slider** | A continuous slider from **Chill** to **Paranoid** that tunes the warn and block thresholds. No technical knowledge required. |
| **Settings Dashboard** | Master toggles, threat counters, allowlist and blocklist management, and log export. |
| **Presets for Everyone** | **Children** (Paranoid plus PIN lock), **Older Adults** (Strict plus large text), and **Power Users** (full control). |
| **Plain-Language Explanations** | All warnings are written to be understood by a wide audience, at about a 6th-grade reading level. |
| **Popup** | A quick status view for the current site with one-click actions. |

---

## How Detection Works

No single trick catches every scam. A legitimate site can have a young domain, and a scam can have a valid TLS certificate. Sentinel therefore combines several **independent signal families** and only acts when enough of them agree.

| Signal family | Question it answers | Example signals |
| --- | --- | --- |
| **Reputation** | Is this already known to be bad? | Threat-feed matches, Safe Browsing lookups via hash prefix |
| **Identity / Impersonation** | Is this pretending to be someone else? | Brand names in the page that do not match the domain, lookalike or homoglyph domains |
| **Domain Trust** | Does the domain look established? | Domain age (RDAP), suspicious TLDs, odd subdomain structures |
| **Page Intent** | What is this page trying to get me to do? | Credential or payment forms, forms posting to a different domain, fake download buttons |
| **Pressure Language** | Is it trying to rush or frighten me? | Countdown timers, "act now" copy, fake virus or lock warnings |
| **Hostile Behavior** | Is the page acting maliciously? | Fullscreen traps, `alert()` loops, forced redirects, audio autoplay |
| **Local AI** | Does the page read like a scam overall? | On-device model run in an offscreen document |

### From signals to a verdict

1. The content script and background worker collect signals from each family.
2. The risk engine combines them into a single score.
3. The **aggressiveness slider** sets the thresholds for *warn* and *block*.
4. The policy layer applies your allowlist, blocklist, and preset rules.
5. The result is an action: allow, highlight, warn, or block, along with the human-readable reasons that triggered it.

Requiring several signals to agree keeps false positives low while still catching scams that have never been seen before.

---

## Architecture

Sentinel is a **Manifest V3** extension built with [WXT](https://wxt.dev/) (Vite-based) and **TypeScript**. One codebase targets Chrome, Edge, and Firefox.

```
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

### Components

**Content script.** Runs inside the page. It reads DOM and form signals, installs behavior hooks (for fullscreen, alert loops, and redirects), draws the highlight overlay, and runs the local PII detector. It never sends raw page content out of the browser.

**Background service worker (event page on Firefox).** The brain of the extension. It hosts the risk engine, URL and domain analysis, the policy layer (slider and lists), download interception, declarative net request (DNR) rules, and the local AI model through an offscreen document. It also owns storage for settings, lists, the activity log, and caches.

**UI surfaces.** The popup, the settings dashboard, the full-page "Blocked" interstitial, and the in-page overlays and tooltips.

**Optional cloud.** Everything here is opt-in or limited to non-sensitive data:

- A **threat-feed builder** that runs in CI, pulls public feeds such as PhishTank and OpenPhish, then signs and publishes the resulting lists.
- A **reputation proxy** for Safe Browsing lookups and RDAP domain-age checks, which receives only hash prefixes and domains.
- **Opt-in services** such as a bring-your-own-key LLM, community reports, and a trusted-contact feature.

### Design principles

- **Local first.** The extension must be fully useful with the cloud turned off.
- **Defense in depth.** Many weak signals beat one strong signal.
- **Explain everything.** If Sentinel acts, it tells you why.
- **Least privilege.** Request only the permissions each feature needs.
- **No remote code.** All detection logic ships inside the extension package.

---

## Repository Layout

```
sentinel/
├── apps/
│   └── extension/      # The browser extension (WXT + TypeScript)
├── docs/               # Project documentation
├── site/               # Project website (deployed with Vercel, see vercel.json)
├── LICENSE             # MIT
├── package-lock.json
├── vercel.json
└── README.md
```

---

## Getting Started

### Prerequisites

- [Node.js](https://nodejs.org/) v18 or higher
- `npm` or `pnpm`
- A supported browser: Chrome, Edge, or Firefox

### Installation

```bash
# 1. Clone the repository
git clone https://github.com/k4urman/sentinel.git
cd sentinel

# 2. Install dependencies
npm install

# 3. Start the dev server (WXT handles the build and hot reload)
npm run dev
```

### Loading the extension

**Chrome / Edge**

1. Open `chrome://extensions/` (or `edge://extensions/`).
2. Turn on **Developer mode**.
3. Click **Load unpacked**.
4. Select the `.output/chrome-mv3` folder.

**Firefox**

1. Open `about:debugging#/runtime/this-firefox`.
2. Click **Load Temporary Add-on**.
3. Select the `manifest.json` file inside `.output/firefox-mv2`.

Temporary add-ons in Firefox are removed when the browser closes, so reload it after each restart during development.

---

## Usage

### First run

1. Click the Sentinel icon to open the popup.
2. Pick a **preset** (Children, Older Adults, or Power User) or leave the default.
3. Adjust the **aggressiveness slider** to taste. Start in the middle and move toward Paranoid if you want more caution.

### Everyday behavior

- **Browse normally.** Sentinel stays quiet on safe sites.
- **On a risky page,** you will see highlighted elements, a warning, or a full block screen, always with the reasons listed.
- **Before a download,** you will be asked to confirm if the file type or source looks risky.
- **Before entering sensitive data,** you will be warned if the site is untrusted.
- **To check a link,** right-click it and choose Sentinel's link check.

### If a block is wrong

Use the interstitial to proceed once, or add the site to your **allowlist** in the dashboard. Allowlist and blocklist entries are managed in settings and can be exported.

---

## Configuration

| Setting | Description |
| --- | --- |
| **Master toggle** | Turns all protection on or off. |
| **Aggressiveness** | Slider from Chill to Paranoid. Controls warn and block thresholds. |
| **Presets** | Children (Paranoid plus PIN lock), Older Adults (Strict plus large text), Power User. |
| **Allowlist / Blocklist** | Sites you always trust or always block. |
| **Ad covering** | Optionally hide or grey out ads and malvertising. |
| **Incognito behavior** | Protection stays on, but nothing is logged. |
| **Activity log** | View threat counters and recent actions, and export them. |
| **Optional cloud services** | Opt-in features such as BYO-key LLM, community reports, and trusted contact. |

---

## Testing

| Command | Purpose |
| --- | --- |
| `npm run test` | Unit tests with Vitest |
| `npm run test:e2e` | End-to-end tests with Playwright |
| `npm run lint` | ESLint plus `web-ext lint` |

Run the full set before opening a pull request.

---

## Privacy and Permissions Model

Sentinel follows one rule: **free, open source, local-first.**

- **Local by default.** No page content, form values, or full URLs leave your device. Reputation lookups send only hash prefixes.
- **PII is never stored.** Personal data you type (such as an SSN or card number) is matched by pattern in the page and discarded immediately.
- **Incognito mode.** If enabled, protection still runs but nothing is logged.
- **No remote code.** All detection logic is bundled with the extension. Threat lists are cryptographically signed and verified before use.
- **Opt-in extras.** Anything that goes beyond hash prefixes and domains, such as a BYO-key LLM or community reports, is off until you turn it on.

### What leaves your device

| Data | Sent by default? | Notes |
| --- | --- | --- |
| Page content | No | Never sent by default |
| Form values and typed data | No | Pattern-matched locally, then discarded |
| Full URLs | No | Not sent by default |
| Hash prefixes and domains | Yes (limited) | Used for reputation and domain-age lookups only |
| Opt-in service data | Only if enabled | BYO-key LLM, community reports, trusted contact |

---

## Threat Model

**Sentinel is designed to help with:**

- Phishing and credential-harvesting pages
- Brand impersonation and lookalike domains
- Fake storefronts and payment scams
- Scareware and fake tech-support pages
- Malicious or deceptive downloads
- Accidental oversharing of sensitive data on untrusted sites

**Sentinel does not replace:**

- Antivirus or endpoint protection
- Operating-system updates and good password hygiene
- Multi-factor authentication
- Your own judgment

No detector is perfect. Sentinel can miss a scam or flag a legitimate site, which is why it explains its reasoning and lets you override it.

---

## Roadmap

- [ ] Published store listings for Chrome, Edge, and Firefox
- [ ] Expanded local-AI classification
- [ ] Community reporting and shared allowlists
- [ ] Trusted-contact alerts for family members
- [ ] Localization beyond English
- [ ] Expanded signal families and tuned default thresholds

---

## Contributing

Contributions are welcome. A good workflow:

1. Fork the repository and create a feature branch.
2. Make your change, keeping detection logic explainable (every new signal needs a plain-language reason).
3. Add or update tests.
4. Run `npm run lint`, `npm run test`, and `npm run test:e2e`.
5. Open a pull request describing what changed and why.

When adding a detection signal, please keep these in mind:

- It should work **locally** without sending page content anywhere.
- It should contribute to a score rather than decide a verdict alone.
- It should come with a **user-facing explanation** a non-technical person can follow.

---


## License

Released under the [MIT License](LICENSE).

---

## Built as part of the **Indy Init '26** hackathon.
