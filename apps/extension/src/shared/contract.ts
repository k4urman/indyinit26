/**
 * Shared contract between the detection engine ("backend": background worker,
 * content scripts, src/engine, src/detectors) and the UI ("frontend": popup,
 * dashboard, blocked page, in-page overlays). Follows docs/plan.md §2 and §8.
 *
 * Owned jointly. Change it only by agreement — both sides compile against it.
 */

// Working name from plan.md. Every user-visible mention goes through this.
export const BRAND = 'ScamShield';

// ---------------------------------------------------------------------------
// Settings (storage.local, key "settings") — plan.md §2.4, §8
// ---------------------------------------------------------------------------

/** Labeled stops on the Chill -> Paranoid slider. Thresholds are risk scores (0-100). */
export interface Stop {
  at: number; // slider position, 0-100
  label: string;
  description: string;
  warnAt: number;
  blockAt: number;
}

export const STOPS: readonly Stop[] = [
  { at: 0, label: 'Chill', warnAt: 70, blockAt: 90,
    description: 'Only stop pages that are clearly scams.' },
  { at: 33, label: 'Balanced', warnAt: 50, blockAt: 80,
    description: 'Pause before you pay, log in, or download on a suspicious page.' },
  { at: 66, label: 'Strict', warnAt: 35, blockAt: 65,
    description: 'Pause on any unfamiliar site that asks for money, files or personal details.' },
  { at: 100, label: 'Paranoid', warnAt: 20, blockAt: 45,
    description: 'Block anything suspicious. Best for children.' },
];

export type Preset = 'child' | 'standard' | 'power';

export const PRESETS: Record<Preset, { label: string; description: string; aggressiveness: number }> = {
  child: { label: 'Child', aggressiveness: 100,
    description: 'Strongest protection. Settings can be locked with a PIN.' },
  standard: { label: 'Standard', aggressiveness: 33,
    description: 'Good protection for most people.' },
  power: { label: 'Power user', aggressiveness: 0,
    description: 'Fewer interruptions. Known scams are still blocked.' },
};
// Older adults: plan.md suggests Strict (66) plus large text; the UI can offer it as a shortcut.

/** The per-category checkboxes next to the slider on the whiteboard. */
export type Category = 'downloads' | 'transactions' | 'uploads' | 'personalInfo';

export const CATEGORIES: Record<Category, { label: string; description: string }> = {
  downloads: { label: 'Downloads', description: 'Pause risky downloads, like remote-control tools after a fake warning.' },
  transactions: { label: 'Payments', description: 'Pause before card, bank, gift-card or crypto payments on risky pages.' },
  uploads: { label: 'Uploads', description: 'Pause before sending files to a risky page.' },
  personalInfo: { label: 'Personal details', description: 'Pause before passwords, ID numbers or recovery phrases go into a risky page.' },
};

export type AdsMode = 'off' | 'cover' | 'remove';

export interface Settings {
  enabled: boolean; // master on/off
  aggressiveness: number; // 0 (Chill) - 100 (Paranoid); UI snaps to STOPS
  preset: Preset;
  categories: Record<Category, boolean>;
  ads: AdsMode; // Phase 2; UI hides it until supported
  /**
   * User wants protection in private windows. The browser decides whether the
   * extension may run there; check with `getIncognitoAccess`. Nothing is logged
   * from private windows either way.
   */
  incognito: boolean;
  pinHash?: string; // Child preset lock; salted hash, written by the background only
  cloud: { reputation: boolean }; // opt-in hash-prefix lookups, Phase 2
  historyDays: number; // log auto-delete
}

export const DEFAULT_SETTINGS: Settings = {
  enabled: true,
  aggressiveness: 33,
  preset: 'standard',
  categories: { downloads: true, transactions: true, uploads: true, personalInfo: true },
  ads: 'off',
  incognito: true,
  cloud: { reputation: false },
  historyDays: 30,
};

// ---------------------------------------------------------------------------
// Allow / block lists (storage.local, key "lists")
// ---------------------------------------------------------------------------

export interface ListEntry {
  pattern: string; // "example.com" (domain and subdomains) or "*.example.com"
  kind: 'allow' | 'block';
  addedAt: number;
  note?: string;
}

// ---------------------------------------------------------------------------
// Verdicts and the block log
// ---------------------------------------------------------------------------

export type Severity = 'safe' | 'unknown' | 'caution' | 'danger';

export type ReasonKind =
  | 'knownBad' | 'userBlocklist' | 'impersonation' | 'lookalikeDomain' | 'domainTrust'
  | 'pageIntent' | 'pressure' | 'hostileBehavior' | 'download' | 'upload' | 'personalInfo';

/** Plain-language explanation, already written by the engine. UI renders it verbatim. */
export interface Reason {
  kind: ReasonKind;
  title: string; // "This is not Chase's website"
  detail: string; // one or two sentences, no jargon
}

export interface Verdict {
  url: string;
  domain: string; // registrable domain
  severity: Severity;
  /**
   * 0-100. For the dashboard's internal use (sorting, debugging) only:
   * never show it to users — explain with reasons, don't publish weights.
   */
  score: number;
  reasons: Reason[]; // most important first, at most 3
  /** "Your bank's real site is chase.com" -> open this instead. */
  safeAlternative?: { label: string; url: string };
  /** 'basic' when only offline checks ran. */
  depth: 'basic' | 'full';
  checkedAt: number;
}

export type EventCategory = 'page' | 'element' | 'download' | 'transaction' | 'upload' | 'personalInfo' | 'ad';

/** One row in the blocked list. Log lives in IndexedDB (Dexie); read it via `getLog`. */
export interface BlockEvent {
  id: string;
  ts: number;
  url: string;
  domain: string;
  category: EventCategory;
  score: number; // internal, see Verdict.score
  action: 'highlight' | 'warn' | 'block';
  reasons: Reason[];
  userOverride?: 'continued' | 'trusted';
}

/** storage.local, key "stats". Lifetime counters; survive log expiry. */
export interface Stats {
  blocked: Record<EventCategory, number>;
  warned: number;
  today: { date: string; blocked: number }; // YYYY-MM-DD, local time
  since: number;
}

export const STORAGE_KEYS = { settings: 'settings', lists: 'lists', stats: 'stats' } as const;

// ---------------------------------------------------------------------------
// Messages: UI -> background (runtime.sendMessage). Each returns Response<...>.
// Settings, lists and stats are read straight from storage and watched with
// storage.onChanged; the UI writes `settings` directly (except pinHash).
// Everything else goes through these messages.
// ---------------------------------------------------------------------------

export type Request =
  | { type: 'getTabStatus'; tabId: number }
  | { type: 'checkUrl'; url: string } // popup link checker; never opens the link
  | { type: 'setList'; pattern: string; kind: 'allow' | 'block' | null; note?: string }
  | { type: 'getLog'; category?: EventCategory; limit?: number; before?: number }
  | { type: 'exportLog'; format: 'json' | 'csv' } // returns file text; UI triggers the download
  | { type: 'clearLog' }
  | { type: 'reportMistake'; eventId: string } // "This site is safe" -> allowlist + log override
  | { type: 'reportScam'; url: string } // local blocklist; UI also offers the FTC link
  | { type: 'getBlocked'; blockId: string } // blocked.html?id=<blockId>
  | { type: 'continueAnyway'; blockId: string } // returns { url } to navigate to
  | { type: 'getIncognitoAccess' }
  | { type: 'setPin'; pin: string | null } // null removes the lock
  | { type: 'checkPin'; pin: string };

export interface TabStatus {
  url: string;
  domain: string;
  verdict: Verdict | null; // null while the page is still being checked
  listed: 'allow' | 'block' | null;
  recent: BlockEvent[]; // events on this tab since load
  incognito: boolean;
}

export interface BlockedPage {
  verdict: Verdict;
  originalUrl: string;
  canContinue: boolean; // false for known-bad when the Child preset is on
}

export type ResponseFor<R extends Request> =
  R extends { type: 'getTabStatus' } ? TabStatus :
  R extends { type: 'checkUrl' } ? Verdict :
  R extends { type: 'getLog' } ? BlockEvent[] :
  R extends { type: 'exportLog' } ? { filename: string; text: string } :
  R extends { type: 'getBlocked' } ? BlockedPage :
  R extends { type: 'continueAnyway' } ? { url: string } :
  R extends { type: 'getIncognitoAccess' } ? { allowed: boolean } :
  R extends { type: 'checkPin' } ? { valid: boolean } :
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
  /** Shown after the engine has exited fullscreen and muted the tab. Resolves when the user taps "go to safety"; the engine navigates. */
  scarewareRescue(v: Verdict): Promise<void>;
  /** Overlay for behavior-based blocks, where the page is already loaded. */
  blockOverlay(v: Verdict): Promise<'back' | 'continue'>;
}
