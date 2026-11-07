# ScamShield extension

WXT + TypeScript, Manifest V3 for Chrome, Edge and Firefox. See [docs/plan.md](../../docs/plan.md)
for the product and [docs/FRONTEND_AGENT.md](../../docs/FRONTEND_AGENT.md) for the UI side.

## Commands

```bash
npm install
npm run dev            # Chrome with hot reload
npm run dev:firefox    # Firefox (MV3)
npm run build          # .output/chrome-mv3
npm run build:all      # Chrome, Firefox, Edge
npm test               # unit tests (engine, detectors, policy)
npm run compile        # type-check
npm run lists          # rebuild bundled reputation data (needs network)
npm run e2e            # end-to-end smoke test against tests/fixtures (build first)
```

`npm run e2e` needs a Chromium that still accepts `--load-extension` (branded Chrome 137+
doesn't). Get one with `npx playwright-core install chromium` and point `CHROME=` at it.
Set `KNOWN_BAD_HOST=` to a host from the feed to include the known-bad redirect check.

## How the engine works

```
main-world.content.ts   page's JS world: sees fullscreen / keyboard lock / alert loops / wallet calls
        │ private MessageChannel
content.ts              collects page signals, applies verdicts, pauses risky actions (gates)
        │ runtime messages (src/engine/messages.ts)
background.ts           blocks known-bad navigations, scores pages, downloads, log, badge
        └─ src/engine/analyse.ts → detectors/domain.ts + engine/scoring.ts → engine/policy.ts
```

- **Scoring** (`src/engine/scoring.ts`): weighted signals plus combination floors, e.g.
  brand impersonation + a password form ⇒ at least 85. Pure function, unit-tested.
- **Policy** (`src/engine/policy.ts`): the slider's 4 stops set warn/block thresholds
  (interpolated in between) and which actions pause on unfamiliar sites.
- **Reputation** (`public/lists/`): bloom filter of ~390k phishing hosts (OpenPhish community
  feed + Phishing.Database, MIT) and the Tranco top 10k. Popular and official domains are never
  added to the block filter. Built by `scripts/build-lists.ts`; plan.md Phase 2 automates it.
- **Privacy**: nothing leaves the device. Typed values are pattern-checked in memory for card
  numbers, SSNs and recovery phrases only, never stored. Private windows log nothing.

`src/ui/inpage/index.ts` is a placeholder in-page UI so the engine can be demoed; the
frontend replaces it.
