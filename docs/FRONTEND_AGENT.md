# Frontend agent brief

You build everything the user sees. Another agent builds the detection engine
("backend"). Read [`plan.md`](plan.md) for the product, then
`apps/extension/src/shared/contract.ts`: it defines settings, the slider stops,
presets, verdicts, the block log, messages and the in-page UI you implement.
Don't change it on your own — propose changes to the backend owner.

## Product in one paragraph

ScamShield is a free, open-source browser extension (Chrome, Edge, Firefox) that
stops scams at the moment of harm: before someone types a password into a fake
bank page, pays a "$1.99 USPS fee", calls the number on a fake virus alert, or
installs remote-control software. Users are children, older adults and young
adults, plus the family who set it up for them. Everything runs on the device.
The name is a working name — use `BRAND` from the contract, never a hard-coded string.

## Stack and layout

- WXT (MV3) + TypeScript strict + React (Preact if the bundle gets heavy),
  Tailwind, Radix UI primitives for the slider, switches and dialogs (plan.md §5).
- In-page UI must not use Tailwind's global stylesheet: inline its CSS into the shadow root.
- No remote code, no CDN fonts or scripts, no analytics. Bundle everything.
- Use `browser.*` (WXT's `browser` import), not `chrome.*`, so Firefox works.

| Path (under `apps/extension/`) | Owner |
| --- | --- |
| `entrypoints/popup/` | you |
| `entrypoints/dashboard/` (settings + blocked log) | you |
| `entrypoints/blocked/` (full-page block, `blocked.html?id=…`) | you |
| `src/ui/` (shared components) and `src/ui/inpage/` (implements `InPageUI`) | you |
| `src/ui/strings.ts` (all user-facing copy, ready for `browser.i18n`) | you |
| `src/shared/contract.ts` | shared |
| `entrypoints/background.ts`, `content.ts`, `main-world.content.ts`, `src/engine/`, `src/detectors/`, `src/storage/` | backend |

## Screens

### 1. Popup (toolbar click)

- Current site's status from `getTabStatus`: Safe / Not checked yet / Be careful /
  Dangerous, with up to 3 reasons. In a private window, say nothing is being saved.
- Master on/off switch.
- "Trust this site" (`setList allow`), "Block this site" (`setList block`),
  "Report scam" (`reportScam`, then offer https://reportfraud.ftc.gov/).
- "Check a link" box: paste a URL → `checkUrl` → show the verdict. Never open the link.
- "Threats stopped today" and a link to the dashboard.
- Fits in 380×600.

### 2. Dashboard (two columns, from the whiteboard sketch)

Left column:
- Aggressiveness slider, Chill → Paranoid, stored as 0–100. Snap to the 4 `STOPS`
  (Chill, Balanced, Strict, Paranoid) and show the stop's `label` and `description`.
  Don't offer in-between positions in the UI; they're hard to reason about.
- Master on/off.
- Threats stopped: today and all time, by category (`stats`).
- Category checkboxes from `CATEGORIES`: Downloads, Payments, Uploads, Personal details.
- Preset picker from `PRESETS` (Child / Standard / Power user). Picking one sets the
  slider; moving the slider afterwards keeps the preset label but shows "customised".
  Offer an "Older adult" shortcut: Strict + large text.
- Parent PIN (Child preset): `setPin` / `checkPin`. When a PIN is set, every settings
  control is read-only until `checkPin` succeeds; unlock lasts until the tab closes.
  Never store the PIN yourself.
- Ads: Off / Cover / Remove. Build it, keep it hidden behind a flag (Phase 2).
- Private windows: an extension can't allow itself to run there. Show the `incognito`
  setting; if `getIncognitoAccess` says not allowed, explain the steps per browser and,
  on Chrome/Edge, add a button that opens `chrome://extensions/?id=<runtime.id>`.
- Allowlist and blocklist manager: add, remove, note; validate patterns
  (`example.com` or `*.example.com`); import/export as JSON.

Right column:
- Blocked sites/widgets list from `getLog`, paged with `before`: domain, time,
  category, action taken, reasons, and an "Undo / trust this site" button
  (`reportMistake`). Filters: page / download / transaction / upload / personal info.
- Export (`exportLog` JSON or CSV, then save the returned text) and Clear (`clearLog`, with confirm).
- Log retention (`historyDays`).

Under ~800px wide, stack the columns.

### 3. Blocked page (`blocked.html?id=…`)

- `getBlocked` → render the verdict. Big title from `reasons[0].title`, the rest below.
- Primary button: "Take me to safety" → `safeAlternative.url` if present (label it,
  e.g. "Go to the real chase.com"), else the new-tab page. Largest, focused by default.
- Secondary: "Continue anyway", only if `canContinue`. Disabled for 3 seconds with a
  visible countdown, then `continueAnyway` and navigate to the returned `url`.
- "This site is safe" (`reportMistake`) as a small text link.

### 4. In-page UI (`src/ui/inpage/`, implements `InPageUI`)

Export a single factory, `createInPageUI(): InPageUI`. The backend calls it from the
content script; you don't wire up detection. A placeholder implementation already exists at
`src/ui/inpage/index.ts` so the engine can be tested; replace the whole file. Never navigate
or message the background from in-page UI: return the user's choice and the engine acts on it.

- `showBanner`: slim strip at the top of the page, dismissible.
- `gate`: centered modal over a dimmed page. "Go back" (primary, focused) → `back`;
  "Continue" (3 s delay) → `continue`; "I trust this site" → `trust`. Tailor the heading
  to the `GateAction` and use the reasons for the body. E.g. a `download` gate whose
  reason is a remote-control tool: "Did someone on the phone tell you to install this?"
- `highlight`: outline + small badge on the element; hover/tap shows `reason.title`.
- `scarewareRescue`: full-viewport calm screen: "This is a fake warning. Your computer
  is fine. Microsoft and Apple never show phone numbers in alerts. Do not call."
  One button: go to safety, which resolves the returned promise (the engine does the navigation).
- `blockOverlay`: same content and buttons as the blocked page, as a full-viewport
  overlay (used when the page is judged after it has loaded). Share the component.

Hard requirements — a scam page will try to hide or fake our UI:
- Render inside a **closed** Shadow DOM on a host element with max z-index and
  `all: initial`; never rely on page CSS. Inline all CSS.
- If the page removes the host or changes its style, re-attach it (MutationObserver).
- Don't use `alert()` or an iframe the page can cover.
- Escape every string you render; reasons contain text taken from the page.
- No user data in any DOM attribute the page can read.

## Design rules (children, older adults)

- Base text 18px, buttons at least 48px tall, WCAG 2.2 AA contrast minimum.
- Plain words. No "phishing", "malware", "domain", "SSL". Say "fake website", "harmful
  file", "web address". Reading level around grade 6. All copy lives in `strings.ts`.
- One obvious safe action per screen. Danger isn't shown by colour alone — icon + words.
- Calm, not alarming: no flashing, no sirens, no all-caps.
- Show *why*, never the numeric `score`.
- Keyboard and screen-reader usable; respect `prefers-reduced-motion` and dark mode;
  large-text mode for the Older adult shortcut.

## Working without the backend

The engine won't be ready when you start. Build against a mock:

- `src/ui/dev/mock-background.ts`: answers every `Request` type with fixture data
  (a Chase lookalike, a fake USPS fee page, a scareware page, a fake crypto deposit,
  a safe site), and a fake log of ~50 events for the dashboard.
- A dev page that renders each `InPageUI` method on demand, for screenshots and the demo.

## Done means (Phase 1)

- Popup, dashboard, blocked page and all five in-page components work against the
  mock and type-check against `contract.ts`.
- Works when loaded unpacked in Chrome, Edge and Firefox.
- Settings persist and update live in other open views via `storage.onChanged`.
- Screens still look right at 200% zoom and at 380px wide.
- No network requests from any UI surface (check DevTools).
