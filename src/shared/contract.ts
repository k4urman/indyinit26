/**
 * Shared contract between the detection engine ("backend": background worker,
 * content scripts, engine/) and the UI ("frontend": popup, options page,
 * blocked page, in-page overlays).
 *
 * Owned jointly. Change it only by agreement — both sides compile against it.
 */

// The product name is undecided. Every user-visible mention goes through this.
export const BRAND = 'ScamGuard'; // placeholder

// ---------------------------------------------------------------------------
// Settings (chrome.storage.local, key "settings")
// ---------------------------------------------------------------------------

/** Whiteboard "aggro" slider, chill -> paranoid. */
export type Level = 1 | 2 | 3 | 4 | 5;

export const LEVELS: Record<Level, { label: string; description: string }> = {
  1: { label: 'Chill', description: 'Only stop pages that are known scams.' },
  2: { label: 'Relaxed', description: 'Also warn when a page pretends to be a well-known company.' },
  3: { label: 'Balanced', description: 'Pause before you pay, log in, or download on a suspicious page.' },
  4: { label: 'Strict', description: 'Pause on any new or unknown site that asks for money or personal details.' },
  5: { label: 'Paranoid', description: 'Block suspicious pages outright. Best for someone who should never take the risk.' },
};

/** The per-category list drawn next to the slider on the whiteboard. */
export type Guard = 'pageBlocking' | 'highlight' | 'download' | 'transaction' | 'upload' | 'personalInfo';

export const GUARDS: Record<Guard, { label: string; description: string }> = {
  pageBlocking: { label: 'Block dangerous pages', description: 'Replace known or very likely scam pages with a warning.' },
  highlight: { label: 'Mark suspicious parts of a page', description: 'Outline fake buttons, fake alerts and risky forms.' },
  download: { label: 'Check downloads', description: 'Pause downloads from risky pages, and remote-control tools after a scare page.' },
  transaction: { label: 'Check payments', description: 'Pause before card, bank, gift-card or crypto payments on risky pages.' },
  upload: { label: 'Check uploads', description: 'Pause before sending files to a risky page.' },
  personalInfo: { label: 'Protect personal details', description: 'Pause before passwords, ID numbers or recovery phrases are typed into a risky page.' },
};

export type AdsMode = 'off' | 'cover' | 'remove';

export interface Settings {
  enabled: boolean; // master on/off
  level: Level;
  guards: Record<Guard, boolean>;
  ads: AdsMode; // "Could" scope; UI may hide it until the engine supports it
  allowlist: string[]; // registrable domains, e.g. "example.com"
  blocklist: string[];
  historyDays: number; // auto-expire for the event log
}

export const DEFAULT_SETTINGS: Settings = {
  enabled: true,
  level: 3,
  guards: { pageBlocking: true, highlight: true, download: true, transaction: true, upload: true, personalInfo: true },
  ads: 'off',
  allowlist: [],
  blocklist: [],
  historyDays: 7,
};

// ---------------------------------------------------------------------------
// Verdicts and events
// ---------------------------------------------------------------------------

export type Severity = 'safe' | 'unknown' | 'caution' | 'danger';

export type ThreatKind =
  | 'knownBad' | 'userBlocklist' | 'phishing' | 'lookalikeDomain' | 'scareware'
  | 'payment' | 'investment' | 'fakeShop' | 'download' | 'upload' | 'personalInfo';

/** Plain-language explanation, already written by the engine. UI renders it verbatim. */
export interface Reason {
  kind: ThreatKind;
  title: string; // "This is not Chase's website"
  detail: string; // one or two sentences, no jargon
}

export interface Verdict {
  url: string;
  domain: string; // registrable domain
  severity: Severity;
  reasons: Reason[]; // most important first; never empty unless severity is 'safe' or 'unknown'
  /** "Your bank's real site is chase.com" -> open this instead. */
  safeAlternative?: { label: string; url: string };
  /** 'basic' when only offline checks ran (reputation lookups failed or are off). */
  depth: 'basic' | 'full';
  checkedAt: number;
}
// No numeric score is exposed on purpose: explain reasons, don't publish weights.

export type ThreatAction = 'blocked' | 'paused' | 'warned' | 'highlighted' | 'userContinued' | 'userTrusted';

export interface ThreatEvent {
  id: string;
  at: number;
  url: string;
  domain: string;
  action: ThreatAction;
  guard: Guard | null;
  reasons: Reason[];
}

/** chrome.storage.local, key "stats". Lifetime counters, survive history expiry. */
export interface Stats {
  blocked: number; // blocked + paused, i.e. "threats stopped"
  warned: number;
  since: number;
}

export const STORAGE_KEYS = { settings: 'settings', events: 'events', stats: 'stats' } as const;

// ---------------------------------------------------------------------------
// Messages: UI -> background (chrome.runtime.sendMessage). Each returns Response<...>.
// Settings/events/stats are read straight from chrome.storage and watched with
// chrome.storage.onChanged; the UI writes settings directly. Everything else goes
// through these messages.
// ---------------------------------------------------------------------------

export type Request =
  | { type: 'getTabStatus'; tabId: number }
  | { type: 'checkUrl'; url: string } // popup link checker / pasted link
  | { type: 'setList'; domain: string; list: 'allow' | 'block' | null }
  | { type: 'reportMistake'; eventId: string } // "This site is safe" -> allowlist + log
  | { type: 'reportScam'; url: string } // local blocklist; UI also offers the FTC link
  | { type: 'getBlocked'; blockId: string } // blocked.html?id=<blockId>
  | { type: 'continueAnyway'; blockId: string } // returns { url } to navigate to
  | { type: 'clearHistory' }
  | { type: 'getIncognitoAccess' };

export interface TabStatus {
  url: string;
  domain: string;
  verdict: Verdict | null; // null while the page is still being checked
  listed: 'allow' | 'block' | null;
  recent: ThreatEvent[]; // events on this tab since load
}

export interface BlockedPage {
  verdict: Verdict;
  originalUrl: string;
  canContinue: boolean; // false for 'knownBad' at level 5
}

export type ResponseFor<R extends Request> =
  R extends { type: 'getTabStatus' } ? TabStatus :
  R extends { type: 'checkUrl' } ? Verdict :
  R extends { type: 'getBlocked' } ? BlockedPage :
  R extends { type: 'continueAnyway' } ? { url: string } :
  R extends { type: 'getIncognitoAccess' } ? { allowed: boolean } :
  { ok: true };

export type Response<T> = { ok: true; data: T } | { ok: false; error: string };

// ---------------------------------------------------------------------------
// In-page UI. Frontend implements these in src/ui/inpage/; the backend content
// script imports and calls them. All of it renders inside a closed Shadow DOM.
// ---------------------------------------------------------------------------

export type GateAction = 'password' | 'card' | 'bankDetails' | 'crypto' | 'giftCard' | 'download' | 'upload' | 'personalInfo';
export type GateChoice = 'back' | 'continue' | 'trust';

export interface InPageUI {
  /** Soft warning strip; caution-level verdicts. */
  showBanner(v: Verdict): { close(): void };
  /** Modal pause before a risky action. Resolves with the user's choice. */
  gate(v: Verdict, action: GateAction): Promise<GateChoice>;
  /** Outline one element with a short reason tooltip. */
  highlight(el: Element, reason: Reason): { remove(): void };
  /** Shown after the engine has exited fullscreen and muted the tab. */
  scarewareRescue(v: Verdict): void;
}
