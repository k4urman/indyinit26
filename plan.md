# ScamShield — Build Plan & Roadmap

Cross-browser (Chrome, Edge, Firefox) extension that detects and blocks scam sites and scam behavior in real time, explains why, and keeps the user's data on their device.

> Working name "ScamShield" — rename freely.

---

## 0. Decisions locked in

| Question | Decision | Notes |
| --- | --- | --- |
| Persona | **Both** older adults and young adults, plus **children** (from the whiteboard) | One product, three presets: "Family/Child", "Standard", "Power user" |
| Scam coverage | **Detect all scam sites and scam behavior**, not a fixed list | Achieved with a generic multi-signal engine (Section 4), not one detector per scam type. We still demo 3 flagship scenarios. |
| Browsers | **Chrome + Edge + Firefox** (Safari later) | One codebase via WXT; Manifest V3 everywhere |
| Principles (whiteboard: "free & libre & local") | **Free, open source, local-first** | Core protection free forever, source on GitHub, all core detection runs on-device |
| Cloud LLM | **Not required.** Local rules + local AI by default; cloud LLM is an opt-in, bring-your-own-key add-on | Keeps the "local" promise |
| Trusted-contact alert | **Phase 3 (post-hackathon)**; show as a "next step" slide | Needs a backend and accounts |

> Whiteboard note: the slider reads **Chill → Paranoid**, and "Toggle 4 Incognito" is a **toggle for incognito mode**. Both are reflected below.

---

## 1. Problem statement (final draft)

**One-liner:** Scam pages do their damage in the first few hours, before blocklists know they exist — ScamShield gives every user a free, private, real-time second opinion at the exact moment they're about to pay, log in, upload, or download.

Key facts behind it (sources in the team doc):
- US consumers reported **$15.9B** in fraud losses in 2025 (FTC); FBI IC3 logged **$20.9B** across 1M+ complaints.
- Median phishing site lives **~5.5 hours**; Google Safe Browsing caught only **18.4%** of them, after **4.5 days** on average (WWW 2025 study).
- AI-generated scams remove the classic red flags (typos, sloppy design).

---

## 2. Feature list (from whiteboard → spec)

### 2.1 Protection engine ("App / Logic")

| # | Feature | What it does | How |
| --- | --- | --- | --- |
| P1 | **Whole-page blocking** | Replaces a high-risk page with a full "Blocked" interstitial | Navigation check in background + `declarativeNetRequest` redirect for known-bad; content-script overlay for behavior-based detections |
| P2 | **Sketchy-element highlighting** | Outlines risky elements (fake download buttons, off-domain login forms, fake "virus" dialogs, phone numbers in scare pages, crypto deposit boxes) with a tooltip saying why | Content script DOM scan + MutationObserver; Shadow-DOM overlay so pages can't restyle it |
| P3 | **Download scanning** | Pauses risky downloads and asks for confirmation | `downloads.onCreated` → pause → check source URL, referrer page score, file type (.exe/.msi/.scr/.apk/.dmg, double extensions), remote-access tools (AnyDesk, TeamViewer, ScreenConnect) after a scare page; URL reputation lookup |
| P4 | **Transaction scanning** | Warns before entering card/bank/crypto details on risky sites | Detect payment fields (autocomplete `cc-*`, IBAN/routing patterns, wallet-connect, seed-phrase inputs), gift-card/wire instructions, combined with page risk score |
| P5 | **Upload & personal-info guard** | Warns before uploading files or typing personal data on untrusted sites | Listen for `input[type=file]` change and paste/typing into fields; local regex + checksum detectors for SSN, card (Luhn), passport, phone, email, DOB, seed phrases. **Never store or transmit the values** |
| P6 | **Scareware lock breaker** | Escapes fake "your computer is locked" pages | Detect fullscreen/keyboard-lock/pointer-lock calls, autoplay audio, `alert`/`beforeunload` loops → exit fullscreen, mute tab, show explanation |
| P7 | **Link checker** | Check any link before opening | Right-click context menu + popup paste box |
| P8 | **Ad removal / covering (optional)** | Hide ads and malvertising | `declarativeNetRequest` static rulesets from EasyList/EasyPrivacy (+ cosmetic CSS). Off by default; "cover" mode greys ads instead of removing |
| P9 | **Report & false-positive flow** | One click "This is a scam" / "This site is safe" | Local allow/block update + optional anonymous report to community feed + link to ReportFraud.ftc.gov |

### 2.2 Frontend ("Frontend" + sketches)

**Popup (toolbar click)** — current site verdict (Safe / Caution / Danger) with reasons, master on/off, quick "trust this site", link checker.

**Settings / Dashboard page** (two-column layout from sketch):

| Left column | Right column |
| --- | --- |
| Aggressiveness slider: **Chill ↔ Paranoid** (continuous, with 4 labeled stops) | **Blocked sites/widgets list** with reason, time, action taken, "undo / trust" button |
| Master ON/OFF | Filters: page / download / transaction / upload / personal info |
| Count of threats blocked (today / all time, by category) | Export log (JSON/CSV), clear log |
| Protection category checkboxes: Downloads, Transactions, Uploads, Personal info | |
| Remove/cover ads toggle | |
| Incognito toggle (run in private windows; never log there) | |
| Whitelist & blocklist manager | |
| Profile preset: Child / Standard / Power user | |
| Parent PIN lock (for Child preset) | |

**On-page UI** — highlight outlines + tooltip, soft banner, full "Blocked" interstitial (primary button "Take me to safety", secondary "Continue anyway" with 3-second delay and reason shown).

### 2.3 Common features

- **Whitelist (trusted) & blocklist (never allow)** — user lists, synced across devices via `storage.sync` (small) with overflow in `storage.local`; wildcard and domain-level entries; import/export.
- **Presets for audiences**: Child (Paranoid + PIN-locked settings + block adult/gambling categories optional), Older adult (Strict + large text + simple language), Standard (Balanced).
- **Plain-language explanations** everywhere, reading level ~grade 6, localized.

### 2.4 Aggressiveness slider → behavior

Risk score is 0–100. The slider sets two thresholds: `warn` and `block`.

| Stop | Warn at | Block at | Highlights | Downloads | Personal info typing |
| --- | --- | --- | --- | --- | --- |
| Chill | 70 | 90 | Only high-risk elements | Known-bad only | Off |
| Balanced (default) | 50 | 80 | Medium+ | Pause executables from risky pages | Warn on risky sites |
| Strict (older-adult default) | 35 | 65 | All suspicious | Pause all executables from non-allowlisted sites | Warn on any non-allowlisted site |
| Paranoid (child default) | 20 | 45 | All suspicious | Pause all downloads from non-allowlisted sites | Block on non-allowlisted sites |

The slider is continuous: thresholds interpolate between stops. Known-bad URLs are blocked at every level.

---

## 3. Architecture

```
┌──────────────────────── Browser extension (MV3) ────────────────────────┐
│ Content script            Background (SW / event page)    UI            │
│  • DOM & form signals ──▶  • Risk engine (scoring)   ──▶  • Popup        │
│  • Behavior hooks          • URL / domain analysis        • Dashboard    │
│  • Highlight overlay  ◀──  • Policy (slider, lists)  ──▶  • Interstitial │
│  • PII detector            • Downloads / DNR rules        • Overlays     │
│                            • Local AI (offscreen doc)                    │
│                            • Storage: settings, lists, log, caches       │
└───────────────┬─────────────────────────────────────────────────────────┘
                │ only hash prefixes / domains, never page content (default)
┌───────────────▼──────────── Optional cloud ─────────────────────────────┐
│ Threat-feed builder (CI)   Reputation proxy        Opt-in services      │
│  • pulls PhishTank,         • Safe Browsing v4/v5  • BYO-key LLM         │
│    OpenPhish, URLhaus        hash-prefix lookups   • community reports   │
│  • signs & publishes lists  • RDAP domain age      • trusted contact (P3)│
└─────────────────────────────────────────────────────────────────────────┘
```

**Message flow (page load):**
1. `webNavigation.onCommitted` → background checks URL against local blocklist / user lists / cached reputation → instant block if known-bad.
2. Content script runs at `document_idle` → collects signals → sends `SIGNALS` message.
3. Risk engine scores → returns verdict + reasons → content script highlights, bannerizes, or overlays per slider.
4. Event-time checks (form focus, file select, payment field, download, fullscreen) re-score with the action as an extra factor.
5. Results logged locally (not in incognito), counter updated, badge text set.

**Budgets:** content script < 50 KB gzipped, signal collection < 30 ms, local verdict < 150 ms, no blocking network call on the critical path (cloud checks time out at 800 ms and fail open).

---

## 4. Detection engine ("detect all scams")

No single trick catches every scam, so the engine combines independent signal families. A page has to trip several to be blocked, which keeps false positives low while catching brand-new scams.

### 4.1 Signal families

| Family | Signals | Source |
| --- | --- | --- |
| Reputation | Known-bad URL/domain, user blocklist, community reports | Local signed lists (updated every 30–60 min), Safe Browsing hash-prefix |
| Identity / impersonation | Brand name, logo, title, or favicon of a known brand on a non-official domain; lookalike domain (edit distance, homoglyphs, punycode, combosquatting like `paypal-secure-login.xyz`) | Brand → official-domains map (~1,000 brands), Tranco top list |
| Domain trust | Domain age < 30 days (RDAP), new TLS cert, risky TLD, free hosting / trusted-host abuse (Google Forms/Sites, Notion, Weebly, link shorteners), IP-literal URL, many redirects | RDAP, URL parsing |
| Page intent | Password/card/seed-phrase fields, form posts off-domain, wallet-connect, file upload prompts, phone number + "call support", download buttons | DOM scan |
| Pressure & language | Urgency/threat phrases, countdown timers, "guaranteed returns", gift-card / wire / crypto-only payment, prize claims | Keyword model + local classifier |
| Hostile behavior | Fullscreen/keyboard-lock, audio autoplay, alert loops, back-button hijack, disabled right-click, history spam, notification-permission spam | API hooks injected in MAIN world |
| Visual similarity (Phase 3) | Screenshot perceptual hash vs. brand login pages | Offscreen canvas, local |
| Local AI | Page summary → "is this a scam, and why?" | Chrome/Edge built-in Prompt API (Gemini Nano / Phi) where available; otherwise a small ONNX/transformers.js text classifier |

### 4.2 Scoring

`score = clamp( Σ (weight_i × signal_i) − allowlist_credit , 0, 100 )`, with **combination rules** (e.g., brand mismatch AND credential form ⇒ min 85). Weights start hand-tuned, then are fitted with logistic regression on the labeled dataset (Section 7). Each signal carries a human-readable reason string; the top 3 are shown to the user.

### 4.3 Scam coverage map

| Scam type | Main signals that fire |
| --- | --- |
| Credential phishing | impersonation + credential form + domain trust |
| Delivery/toll smishing | brand + small fee + card form + young domain |
| Tech-support scareware | hostile behavior + phone number + "Microsoft/Apple" |
| Investment / crypto | guaranteed returns + deposit/wallet + young domain |
| Fake shops | deep discounts + young domain + odd payment methods + no contact info |
| Remote-access lure | download of RMM tool after a risky page |
| Romance/job/advance-fee landing pages | pressure language + payment request + domain trust |
| Gift-card coercion | gift-card instructions in page text |
| Malvertising | ad rulesets + redirect chain + landing page score |

---

## 5. Tech stack

| Layer | Choice | Why |
| --- | --- | --- |
| Extension framework | **WXT** (Vite-based) + TypeScript | Builds Chrome, Edge, Firefox (and Safari later) from one codebase; handles MV3 differences (service worker vs Firefox event page) |
| UI | React + Tailwind (or Preact for smaller bundles); Radix UI primitives for accessible slider/toggles | Fast to build, accessible |
| State/storage | `browser.storage.local` + `storage.sync` via `webextension-polyfill`; Dexie (IndexedDB) for the block log | Cross-browser, persistent |
| Domain parsing | `tldts`, `punycode`, Unicode confusables table | Correct registrable domains, homoglyph detection |
| Fuzzy matching | Damerau-Levenshtein + keyboard-distance | Lookalike domains |
| Blocking | `declarativeNetRequest` (static + dynamic rules), `webNavigation`, `downloads` | MV3-compliant |
| Local AI | Chrome/Edge Prompt API; fallback `onnxruntime-web` / `transformers.js` in an offscreen document (Chrome/Edge) or background page (Firefox) | On-device, private |
| Reputation | Google Safe Browsing (Update API, hash prefixes), PhishTank, OpenPhish, URLhaus, RDAP | Free sources |
| Threat-list pipeline | GitHub Actions cron → fetch feeds → dedupe → compile to DNR rules + bloom filter → sign (Ed25519) → publish to CDN (Cloudflare R2/Pages) | Free, auditable, no server |
| Optional backend | Cloudflare Workers + D1/KV (reputation proxy, reports); later Supabase for accounts | Cheap, scales, edge latency |
| Opt-in cloud LLM | User's own API key (Claude/OpenAI/local Ollama endpoint) | Keeps "local & free" promise |
| Testing | Vitest (unit), Playwright with extension loading (E2E) on Chrome + Firefox, local fixture scam pages | Real-browser coverage |
| Lint/format | ESLint, Prettier, TypeScript strict, `web-ext lint` | Store review readiness |
| CI/CD | GitHub Actions: test → build per browser → zip → `chrome-webstore-upload`, Edge Partner Center API, `web-ext sign` (AMO) | One-click releases |
| Error monitoring | Self-hosted GlitchTip/Sentry, **opt-in**, PII scrubbing | Privacy-respecting |
| Localization | `browser.i18n` + Crowdin/Weblate | EN, ES first |
| License | GPL-3.0 (libre) or MIT; ship lists under their own licenses | Matches "libre" principle |

---

## 6. Permissions & privacy model

| Permission | Why | Notes |
| --- | --- | --- |
| `storage`, `unlimitedStorage` | settings, lists, log | |
| `declarativeNetRequest`, `declarativeNetRequestWithHostAccess` | block known-bad URLs, ads | |
| `webNavigation`, `tabs` | check pages as they load | |
| `downloads` | pause/scan downloads | |
| `contextMenus` | "Check this link" | |
| `scripting`, host `<all_urls>` | content scripts on all pages | Explain clearly in onboarding; Firefox users grant at install/runtime |
| `offscreen` (Chrome/Edge) | local AI model, canvas | |
| `notifications` | download/transaction alerts | |
| `alarms` | list updates | |

Privacy rules:
- No page content, form values, or full URLs leave the device by default. Reputation lookups send only hash prefixes.
- Typed personal data is detected by pattern only and never stored.
- Incognito: if the user enables the incognito toggle (and allows the extension in private windows), protection runs but **nothing is logged**.
- Local logs auto-delete after 30 days (configurable); one-click wipe.
- Telemetry and crash reports are opt-in and anonymous.
- Published privacy policy; Chrome Web Store "Limited Use" disclosure; Firefox data-collection disclosure.

---

## 7. Security, testing & quality

**Extension security**
- No remote code; detection logic bundled. Remote data (lists, weights) is signed and verified before use; reject unsigned or older versions (rollback protection).
- Strict CSP; no `eval`; sanitize every string rendered in overlays.
- Overlays in closed Shadow DOM, top z-index, re-attached if removed (pages can't hide warnings).
- MAIN-world hooks are minimal and frozen to resist tampering.
- Settings PIN (Child preset) stored as salted hash.
- Dependency scanning (Dependabot, `npm audit`), SBOM per release, signed tags.
- Pre-launch security review + public `SECURITY.md` and bug-bounty-lite (hall of fame).

**Fallbacks**

| Failure | Behavior |
| --- | --- |
| Cloud lookup slow (>800 ms) or down | Local verdict only; never block page load on timeout |
| Local AI unavailable (Firefox, old hardware) | Rules + classifier only; verdict marked "basic check" |
| Offline | Cached lists + heuristics |
| List update fails signature check | Keep previous list; report error |
| Low confidence | Soft banner, not a block |
| High risk + irreversible action | Interstitial with delayed "Continue anyway" |
| False positive | "This site is safe" → allowlist instantly + optional report |
| Extension crashes on a page | Catch and fail open; log error locally |

**Evaluation dataset & targets**
- Phishing: fresh URLs from PhishTank/OpenPhish/URLhaus, crawled within 1 hour of listing (with screenshots + HTML saved) — 2,000+ samples.
- Scam pages: tech-support, fake shops, crypto platforms from public reports (ScamAdviser, Reddit r/Scams, FTC alerts).
- Legit: Tranco top 10,000 + login/checkout pages of top 500 brands + small-business shops on new domains.
- Targets for v1.0 at Balanced: **≥ 90% detection** on fresh phishing, **≥ 80%** on other scam pages, **≤ 0.5% false-block rate** on legit pages, **≤ 2%** false-warn rate.
- Track per-signal precision so weights can be tuned.

**Tests**
- Unit: domain parsing, lookalike scoring, PII regexes (with Luhn/SSN validity), slider thresholds.
- E2E (Playwright, Chrome + Firefox): fixture pages for each scam type; assert overlay, block, download pause, no false positives on fixtures of real brand pages.
- Performance: Lighthouse/trace on top 50 sites with extension on vs off; CPU < 5% overhead.
- Accessibility: keyboard-only, screen reader (NVDA/VoiceOver), WCAG 2.2 AA contrast, large-text mode.

---

## 8. Repository structure

```
scamshield/
├─ apps/extension/
│  ├─ entrypoints/
│  │  ├─ background.ts        # risk engine host, navigation, downloads, alarms
│  │  ├─ content.ts           # signal collection, highlights, PII guard
│  │  ├─ main-world.ts        # fullscreen/audio/alert hooks
│  │  ├─ offscreen/           # local AI model, image hashing
│  │  ├─ popup/               # React popup
│  │  ├─ dashboard/           # settings + blocked log
│  │  └─ blocked/             # full-page interstitial
│  ├─ src/engine/             # signals/, scoring.ts, policy.ts, reasons.ts
│  ├─ src/detectors/          # domain.ts, brand.ts, forms.ts, pii.ts, behavior.ts, language.ts
│  ├─ src/storage/            # settings, lists, log (Dexie)
│  ├─ src/ui/                 # shared components (slider, toggles, overlay)
│  ├─ public/rules/           # DNR rulesets (malware, ads)
│  └─ wxt.config.ts
├─ packages/data/             # brand→domains map, keyword lists, confusables
├─ services/feeds/            # GitHub Action: build + sign threat lists
├─ services/worker/           # optional Cloudflare Worker (reputation proxy, reports)
├─ eval/                      # dataset scripts, crawler, metrics notebook
├─ tests/e2e/                 # Playwright + fixture scam pages
└─ docs/                      # privacy policy, threat model, store listing assets
```

**Core data model**

```ts
type Settings = {
  enabled: boolean;
  aggressiveness: number;          // 0 (Chill) – 100 (Paranoid)
  preset: 'child' | 'standard' | 'power';
  categories: { downloads: boolean; transactions: boolean; uploads: boolean; personalInfo: boolean };
  ads: 'off' | 'cover' | 'remove';
  incognito: boolean;
  pinHash?: string;
  cloud: { reputation: boolean; llmKey?: string };
};
type ListEntry = { pattern: string; kind: 'allow' | 'block'; addedAt: number; note?: string };
type BlockEvent = {
  id: string; ts: number; url: string; domain: string;
  category: 'page' | 'element' | 'download' | 'transaction' | 'upload' | 'personalInfo' | 'ad';
  score: number; action: 'highlight' | 'warn' | 'block'; reasons: string[]; userOverride?: 'continued' | 'trusted';
};
```

---

## 9. Roadmap

### Phase 0 — Setup (hackathon, first 2–3 hours)
- [ ] Repo, WXT scaffold, TypeScript strict, ESLint/Prettier, CI running unit tests
- [ ] Load-unpacked builds working in Chrome, Edge, Firefox
- [ ] Shared message types between content and background
- [ ] Fixture scam pages (fake bank login, scareware lock, fake crypto deposit, fake shop) served locally
- [ ] Brand→domains seed list (top 100 brands) and Tranco top-10k allowlist

### Phase 1 — Hackathon MVP (24–48 hours)
Goal: a live demo that blocks three real-looking scams on all three browsers.
- [ ] Domain analysis: registrable domain, lookalike, homoglyph, risky TLD
- [ ] Brand-mismatch + credential-form detector
- [ ] Scareware lock breaker (P6)
- [ ] Payment/crypto field detector (P4, basic)
- [ ] Scoring + reasons + slider thresholds (4 stops)
- [ ] Element highlighting (P2) and full "Blocked" interstitial (P1)
- [ ] Popup: verdict, reasons, master toggle
- [ ] Dashboard v0: slider, master toggle, threat counter, blocked list with reasons, allow/block lists
- [ ] Local signed blocklist from PhishTank/OpenPhish/URLhaus (one-time build)
- [ ] Download pause for executables from risky pages (P3, basic)
- [ ] Demo script + metrics slide (catch rate on 100 fresh phishing URLs vs Safe Browsing)

### Phase 2 — Private beta (weeks 1–4 after hackathon)
- [ ] PII guard with validated detectors (P5) and upload guard
- [ ] Pressure-language classifier (local, < 5 MB)
- [ ] Chrome/Edge built-in AI integration with graceful fallback
- [ ] RDAP domain age + cert age (via cache/worker)
- [ ] Safe Browsing hash-prefix integration
- [ ] Automated threat-list pipeline (GitHub Actions, signed, hourly)
- [ ] Context-menu link checker (P7), report + false-positive flow (P9)
- [ ] Presets (Child / Standard / Power), parent PIN, incognito toggle behavior
- [ ] Ad cover/remove option (P8) with EasyList rulesets
- [ ] Evaluation dataset v1 + weight tuning; publish metrics
- [ ] 20–50 beta testers including older adults and parents; usability sessions

### Phase 3 — v1.0 store launch (weeks 5–8)
- [ ] Hit quality targets (Section 7)
- [ ] Accessibility + large-text mode, ES localization
- [ ] Performance pass, bundle budgets enforced in CI
- [ ] Security review, threat model doc, `SECURITY.md`
- [ ] Privacy policy, store listings, screenshots, demo video
- [ ] Release pipeline to Chrome Web Store, Edge Add-ons, Firefox AMO
- [ ] Onboarding flow explaining permissions and the slider
- [ ] Opt-in crash reporting
- [ ] Trusted-contact alerts (opt-in, minimal backend: Workers + email)

### Phase 4 — Post-launch (months 3–6)
- [ ] Visual similarity detection (screenshot hash of brand login pages)
- [ ] Safari build (Xcode web-extension converter)
- [ ] Mobile coverage: Firefox for Android; Edge/Kiwi on Android; explore SMS link-check companion app
- [ ] Community report review queue + public transparency stats
- [ ] Enterprise/school policy support (managed settings via `storage.managed`)
- [ ] BYO-key cloud LLM explanations; local Ollama support
- [ ] Regular model retraining from community-labeled data

---

## 10. Hackathon team split (4 people)

| Person | Owns |
| --- | --- |
| A — Extension & UI | WXT setup, popup, dashboard, interstitial, overlays, slider |
| B — Detection | domain/lookalike, brand map, forms, behavior hooks, scoring |
| C — Data & infra | threat-list build + signing, reputation lookups, download scanning |
| D — QA & pitch | fixture scam pages, eval script, cross-browser testing, demo script, slides |

---

## 11. Demo script (5 minutes)

1. Problem in 3 numbers ($15.9B, 5.5-hour median phishing life, 18.4% caught by Safe Browsing).
2. Click a "your bank account is locked" text link → fake login on a lookalike domain → highlight + block with reasons → "Take me to the real site".
3. Scareware page with siren and fullscreen → extension exits fullscreen, mutes, explains.
4. Fake crypto platform asks for deposit → transaction warning with domain age.
5. Dashboard: slider from Chill to Paranoid, threat counter, blocked list with reasons, whitelist.
6. Same build running in Firefox and Edge.
7. Privacy story: all on-device, free, open source. Next steps: trusted contact, Safari, mobile.

---

## 12. Risks & mitigations

| Risk | Mitigation |
| --- | --- |
| False positives annoy users and they uninstall | Multi-signal rules, allowlist of top sites, soft warnings below block threshold, instant "trust" |
| Store rejection for broad permissions | Clear permission justifications, no remote code, privacy policy, minimal data |
| Scammers adapt to our heuristics | Many independent signals, frequent list updates, ML weights, open reporting |
| Firefox lacks built-in AI / offscreen | Bundled lightweight classifier in background page |
| Download contents can't be read by extensions | Judge by source, type, and context; pause and ask rather than "scan" claims |
| Performance hit on heavy pages | Debounced MutationObserver, idle-time scanning, budgets in CI |
| Child-safety expectations beyond scams | Scope Child preset to scam + optional category blocking; recommend OS parental controls for the rest |
