# Frontend agent brief

You build everything the user sees. Another agent builds the detection engine
("backend"). You meet at one file: `src/shared/contract.ts`. Read it first; it
defines settings, verdicts, events, messages and the in-page UI interface you
implement. Don't change it on your own — propose changes to the backend owner.

## Product in one paragraph

A free, open-source browser extension that stops scams at the moment of harm:
before someone types a password into a fake bank page, pays a "$1.99 USPS fee",
calls the number on a fake virus alert, or installs remote-control software.
Users are mostly older adults and children, plus the family who set it up for
them. Everything runs on the device. The product name is undecided — use
`BRAND` from the contract everywhere, never a hard-coded name.

## Stack and layout

- WXT (MV3) + TypeScript + React, `srcDir: 'src'`. Build Chrome and Edge; Firefox if it's cheap.
- No remote code, no CDN fonts or scripts, no analytics. Bundle everything.
- No UI library that phones home. Plain CSS or CSS modules are fine; keep the bundle small.

| Path | Owner |
| --- | --- |
| `src/entrypoints/popup/` | you |
| `src/entrypoints/options/` (settings page) | you |
| `src/entrypoints/blocked/` (full-page block, `blocked.html?id=…`) | you |
| `src/ui/inpage/` (implements `InPageUI`) | you |
| `src/ui/strings.ts` (all user-facing copy) | you |
| `src/shared/contract.ts` | shared |
| `src/entrypoints/background.ts`, `*.content.ts`, `src/engine/` | backend |

## Screens

### 1. Popup (whiteboard: left/right split)

- Top: master on/off switch, and the current site's status from `getTabStatus`
  (Safe / Not checked yet / Be careful / Dangerous), with its reasons.
- Left column: "N threats stopped" (`stats.blocked`), the aggressiveness slider,
  link to full settings.
- Right column: recent blocked sites/elements with reasons (from `events`).
- "Check a link" box: paste a URL → `checkUrl` → show the verdict. Do not open the link.
- Per-site buttons: "I trust this site" (`setList allow`), "Block this site" (`setList block`),
  "Report scam" (`reportScam`, then offer https://reportfraud.ftc.gov/).
- Fits in 380×600. If 2 columns don't fit, stack them.

### 2. Settings page

- Master on/off.
- Aggressiveness slider, 5 stops, Chill → Paranoid. Show `LEVELS[level].label` and
  `.description` under it. Next to it, the per-guard toggles from `GUARDS`
  (download, transaction, upload, personal info, page blocking, highlighting).
- Threat counter and full history list (domain, time, what we did, reasons),
  with "Clear history" (`clearHistory`) and a retention selector (`historyDays`).
- Allowlist and blocklist editors (add, remove; validate as domain names).
- "Private / incognito windows": an extension can't switch this on itself. Call
  `getIncognitoAccess`; if not allowed, explain the steps and add a button that opens
  `chrome://extensions/?id=<chrome.runtime.id>` via `chrome.tabs.create`.
- Ads (`off` / `cover` / `remove`): build the control but keep it hidden behind a
  flag until the backend says it's supported.
- Optional "Set up for someone else" view: a locked-down mode (level 4+, guards on)
  for a family member's browser. Nice to have; no PIN/password storage.

### 3. Blocked page (`blocked.html?id=…`)

- `getBlocked` → render the verdict. Big title from `reasons[0].title`, the rest below.
- Primary button: "Take me to safety" → `safeAlternative.url` if present, else the
  new-tab page. Make it the default, largest, focused button.
- Secondary: "Continue anyway" → only if `canContinue`. Disabled for 3 seconds with a
  visible countdown, then `continueAnyway` and navigate to the returned `url`.
- "This site is safe" (`reportMistake`) as a small text link.

### 4. In-page UI (`src/ui/inpage/`, implements `InPageUI`)

Export a single factory, e.g. `createInPageUI(): InPageUI`. The backend calls it
from the content script; you don't wire up detection.

- `showBanner`: slim strip at the top of the page, dismissible.
- `gate`: centered modal over a dimmed page. Buttons map to `GateChoice`:
  "Go back" (primary, focused) → `back`; "Continue" (3 s delay) → `continue`;
  "I trust this site" → `trust`. Tailor the heading to the `GateAction` and use the
  verdict's reasons for the body. E.g. a `download` gate whose reason is a remote-control
  tool: "Did someone on the phone tell you to install this?"
- `highlight`: outline + small badge on the element; hovering/tapping shows `reason.title`.
- `scarewareRescue`: full-viewport calm screen: "This is a fake warning. Your
  computer is fine. Microsoft and Apple never show phone numbers in alerts. Do not call."
  One button: close the tab / go to safety.

Hard requirements for in-page UI — a scam page will try to hide or fake it:
- Render inside a **closed** Shadow DOM on a host element with max z-index and
  `all: initial` styles; never rely on page CSS. Inline all CSS.
- If the page removes the host or changes its style, re-attach it (MutationObserver).
- Don't put the real UI in an iframe that the page can cover; don't use `alert()`.
- No user data in any DOM attribute the page can read.

## Design rules (older adults and kids)

- Base text 18px, buttons at least 48px tall, high contrast (WCAG AA minimum, aim AAA for body text).
- Plain words. No "phishing", "malware", "domain", "SSL". Say "fake website", "harmful
  file", "web address". Reading level around grade 6. All copy lives in `strings.ts`.
- One obvious safe action per screen. Danger isn't shown by colour alone — use icon + words.
- Calm, not alarming: no flashing, no sirens, no all-caps. We're the opposite of the scare page.
- Show *why*, never a numeric score.
- Keyboard and screen-reader usable; respect `prefers-reduced-motion` and dark mode.

## Working without the backend

The engine won't be ready when you start. Build against a mock:

- `src/ui/dev/mock-background.ts`: answers every `Request` type with fixture data
  (a Chase lookalike, a fake USPS fee page, a scareware page, a safe site).
- A dev page that renders each `InPageUI` method on demand, for screenshots and the demo.

## Done means

- Popup, settings, blocked page and all four in-page components work against the
  mock and type-check against `contract.ts`.
- Settings persist and update live in other open views via `chrome.storage.onChanged`.
- Screenshots of each screen at 200% zoom still look right.
- No network requests from any UI surface (check DevTools).
