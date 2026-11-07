# Sentinel — handoff

Everything below reflects the `so-far-product` branch (a snapshot of `feat/engine`).
If you're a new agent picking this up: read this file, then `docs/plan.md` (the team's
spec) and `apps/extension/src/shared/contract.ts` (the UI↔engine interface).

## What this is

**Sentinel** — a free, on-device browser extension (Chrome/Edge/Firefox, Manifest V3)
that catches scams by what a page *does* (impersonating a bank, rushing you, locking the
screen, collecting a card/password/recovery phrase, copying a shell command) and stops you
at the risky moment with a plain-language warning. Tagline: **"Browse with total confidence."**

All of it lives in **`apps/extension/`**. Stack: WXT + TypeScript (strict) + React 19.

## Status: what works

- **Detection engine** (`src/detectors`, `src/engine`): lookalike/brand-impersonation domains,
  known-bad list (bloom filter of ~389k phishing hosts + Tranco top-10k allowlist), fake
  login/payment/seed forms, scareware, investment, fake shops, gift-card imposters, ClickFix
  clipboard attacks, remote-access downloads. Pure scoring, unit-tested.
- **Background worker** (`entrypoints/background.ts`): navigation blocking, per-tab verdict
  cache, badge, downloads pause, link checker (context menu + popup), Dexie log, stats,
  PBKDF2 parent PIN, injects into already-open tabs on install.
- **In-page UI** (`src/ui/inpage/index.ts`): alert sheet, pause gate, element highlight,
  scareware rescue, floating notifications. Closed Shadow DOM, re-attaches if removed.
- **Popup, blocked page, settings** (`entrypoints/{popup,blocked,options}`): React, system/
  Apple-style look, follows OS light/dark.
- **Demo** (`tests/demo`, `tests/fixtures`): a product landing page + realistic fake scam
  pages served locally under fake hostnames.
- **Packaging**: `npm run zip` → installable `.output/*.zip` for Chrome and Firefox.
- **Tests**: 36 unit (`npm test`), 24 end-to-end in real Chromium (`npm run e2e`).

## Commands (run inside `apps/extension/`)

```bash
npm install
npm run build          # .output/chrome-mv3
npm run build:all      # chrome + firefox + edge
npm run zip            # installable .output/*.zip (chrome + firefox + sources)
npm test               # 36 unit tests (vitest)
npm run compile        # tsc --noEmit
npm run e2e            # 24 end-to-end checks in real Chromium
npm run demo           # live demo window (loads the extension + fake scam pages)
npm run demo:serve     # serve just the fake pages (for your own Chrome)
npm run lists          # rebuild the bundled reputation data (needs network)
npm run eval -- <openphish.txt> <phishing-db.txt> <tranco.zip>   # URL-only metrics
```

## Install as a real extension

```bash
npm install && npm run zip
```
- **Chrome/Edge/Brave**: `chrome://extensions` → Developer mode → Load unpacked → `.output/chrome-mv3`.
- **Firefox**: `about:debugging#/runtime/this-firefox` → Load Temporary Add-on → `.output/firefox-mv3/manifest.json`.
- Publishing needs developer accounts (Chrome Web Store: one-time $5; Firefox AMO: free). The zips are store-ready; the sources zip is for Mozilla's review.

## The interface (don't break this)

`src/shared/contract.ts` is the single file the UI and engine both compile against:
settings, the 4-stop slider, presets, `Verdict`/`Reason` (no numeric score is ever shown
to users), the block log, every runtime message, and the `InPageUI` interface. Change it
only deliberately — both sides depend on it.

Engine-internal messages (content ↔ background) are in `src/engine/messages.ts` and
`src/engine/main-world-protocol.ts`, separate from the contract.

## How the engine flows

```
main-world.content.ts   page's own JS world: sees fullscreen/keyboard-lock/alert-loops/
        │ private MessageChannel   wallet calls / clipboard shell commands
content.ts              collects page signals, applies verdicts, pauses risky actions
        │ runtime messages
background.ts           known-bad redirect, scoring host, downloads, log, badge
        └─ engine/analyse.ts → detectors/domain.ts + engine/scoring.ts → engine/policy.ts
```
- `scoring.ts`: weighted signals + combination floors (e.g. impersonation + password form ⇒ ≥85). Pure, tested.
- `policy.ts`: the slider's 4 stops → warn/block thresholds; which actions pause; Child/Paranoid hard-block.
- Reputation data in `public/lists/` (bloom filter + Tranco), built by `scripts/build-lists.ts`.
- **Privacy**: nothing leaves the device. Typed values are pattern-checked in memory
  (card via Luhn, SSN, BIP39 phrase — not email/phone/DOB) and never stored or sent.

## Decisions already locked in (from plan.md + the user)

- Name **Sentinel** (working name, set in `BRAND` in the contract).
- Personal-info guard: SSN/card/passport/recovery-phrase only, on risky pages.
- Allow/block lists stay in `storage.local` (no cloud sync).
- The numeric risk score is never shown to users — reasons only.
- Parent PIN is a speed bump, not a hard lock (real lockdown would be `storage.managed`, Phase 4).
- No cloud services in the MVP: detection is fully local, explanations are written sentences (no LLM).

## Known gaps / next steps

1. **`main` does NOT have this work.** It's all on `feat/engine` / `so-far-product`. PR #3
   was merged into the `docs/align-with-plan` branch, not `main`. Decide the merge path.
2. **Firefox never hand-tested.** It builds and passes `web-ext lint`, but load it in Firefox
   by hand once (`about:debugging`) and click through the demo.
3. **Settings page** got a palette swap, not the full redesign the popup/blocked page got.
4. **Not built** (Phase 2+ in plan.md): ad blocking (`ads` setting is stubbed/hidden),
   trusted-contact alerts, Safe Browsing API, on-device AI, RDAP domain-age, the automated
   signed threat-list pipeline. The `cloud.reputation` setting is a stub.
5. **URLhaus** retired its free feed; `scripts/build-lists.ts` uses OpenPhish's community
   mirror + Phishing.Database (MIT) + Tranco instead.
6. **`hardBlock`** (Child/Paranoid: no "Continue") is wired through `gate`/`blockOverlay` via
   `GateOptions.allowContinue`; double-check the UX end to end if you touch it.

## Environment quirks (important for an agent in a sandbox)

- **npm cache**: if `.npm` is read-only, set `npm_config_cache=$TMPDIR/npm-cache`.
- **`npm run lists`**: needs `NODE_USE_ENV_PROXY=1` for Node's fetch to use a proxy, and
  network to `raw.githubusercontent.com` and `tranco-list.eu`.
- **`npm run e2e` / `npm run demo`**: branded Chrome 137+ ignores `--load-extension`, so they
  use Playwright's Chromium. Install it once: `npx playwright-core install chromium` (set
  `PLAYWRIGHT_BROWSERS_PATH` if your home dir is restricted), or point `CHROME=/path` at any
  Chromium. Chromium needs a display and its own sandbox off (run the Node command with the
  harness sandbox disabled). Port **8765** must be free — `fuser -k 8765/tcp` if a stale demo holds it.
- **e2e flags**: `KNOWN_BAD_HOST=<host-from-feed>` enables the known-bad redirect check;
  `SHOTS=<dir>` saves a screenshot per scenario. `DEMO_CHECK=<png>` makes `demo.mjs` self-test and exit.

## Git

- Active branch: `feat/engine`. Snapshot for handoff: `so-far-product` (same commit).
- Latest: `87a27e8` "Realistic demo fixtures, installable packages, stronger scam-type floors".
- Commit attribution footer for this repo: `Co-Authored-By: Claude <noreply@anthropic.com>`
  (match whatever the current session's system reminder specifies).
