import { STOPS, type Category, type Settings, type Severity } from '../shared/contract';
import type { HighlightLevel, ScoreResult } from './scoring';

/** Warn/block thresholds for any slider position, interpolated between stops (plan.md §2.4). */
export function thresholds(aggressiveness: number): { warnAt: number; blockAt: number } {
  const a = Math.max(0, Math.min(100, aggressiveness));
  for (let i = 1; i < STOPS.length; i++) {
    const lo = STOPS[i - 1]!;
    const hi = STOPS[i]!;
    if (a <= hi.at) {
      const t = (a - lo.at) / (hi.at - lo.at);
      return {
        warnAt: Math.round(lo.warnAt + t * (hi.warnAt - lo.warnAt)),
        blockAt: Math.round(lo.blockAt + t * (hi.blockAt - lo.blockAt)),
      };
    }
  }
  const last = STOPS[STOPS.length - 1]!;
  return { warnAt: last.warnAt, blockAt: last.blockAt };
}

export function severityOf(score: number, aggressiveness: number, hasPage: boolean): Severity {
  const { warnAt, blockAt } = thresholds(aggressiveness);
  if (score >= blockAt) return 'danger';
  if (score >= warnAt) return 'caution';
  return hasPage ? 'safe' : 'unknown';
}

/** Which stop the slider is at or past: 0 Chill, 1 Balanced, 2 Strict, 3 Paranoid. */
function stopIndex(aggressiveness: number): number {
  let idx = 0;
  STOPS.forEach((s, i) => {
    if (aggressiveness >= s.at) idx = i;
  });
  return idx;
}

export type PageAction = 'none' | 'banner' | 'block';

export interface PageDecision {
  page: PageAction;
  /** Element ids to highlight, already filtered by the slider. */
  highlights: ScoreResult['highlights'];
  /** Escape fullscreen, mute, show the rescue screen. */
  scarewareRescue: boolean;
  /** Which risky actions on this page should pause for confirmation. */
  gates: Record<Category, boolean>;
  /** Gate/download decisions block (no "continue") instead of asking. */
  hardBlock: boolean;
}

const HIGHLIGHT_MIN: Record<number, HighlightLevel[]> = {
  0: ['high'],
  1: ['high', 'medium'],
  2: ['high', 'medium', 'low'],
  3: ['high', 'medium', 'low'],
};

/**
 * Turn a score into what happens on the page. `trusted` = official brand domain,
 * top site or user allowlist: Strict and Paranoid still pause on unknown sites,
 * never on these.
 */
export function decide(r: ScoreResult, settings: Settings, trusted: boolean): PageDecision {
  const none: PageDecision = {
    page: 'none', highlights: [], scarewareRescue: false, hardBlock: false,
    gates: { downloads: false, transactions: false, uploads: false, personalInfo: false },
  };
  if (!settings.enabled) return none;

  const { warnAt, blockAt } = thresholds(settings.aggressiveness);
  const stop = stopIndex(settings.aggressiveness);
  const score = r.score;

  const page: PageAction = r.flags.knownBad || score >= blockAt ? 'block' : score >= warnAt ? 'banner' : 'none';

  const levels = HIGHLIGHT_MIN[stop]!;
  const highlights = score >= warnAt / 2 ? r.highlights.filter((h) => levels.includes(h.level)) : [];

  // Strict+ pauses on any unfamiliar site; lower stops only on risky ones.
  const risky = score >= warnAt;
  const unfamiliar = !trusted && stop >= 2;
  const c = settings.categories;
  const gates: Record<Category, boolean> = {
    transactions: c.transactions && (risky || unfamiliar),
    personalInfo: c.personalInfo && (risky || unfamiliar),
    uploads: c.uploads && (risky || unfamiliar),
    // Chill: known-bad only (the page is blocked anyway); Balanced: risky pages; Strict+: unfamiliar.
    downloads: c.downloads && stop >= 1 && (risky || unfamiliar),
  };

  return {
    page,
    highlights,
    scarewareRescue: r.flags.scareware,
    gates,
    hardBlock: stop === 3 && !trusted && risky,
  };
}

/** Download policy, which also depends on the file itself (plan.md §2.4 table). */
export function shouldPauseDownload(opts: {
  settings: Settings;
  pageScore: number; // score of the page that started it (0 if unknown)
  trusted: boolean;
  executable: boolean;
  remoteAccessTool: boolean;
  afterScarePage: boolean;
  /** Downloaded from the tool's own publisher (anydesk.com…). */
  fromVendor?: boolean;
}): boolean {
  const { settings: s } = opts;
  if (!s.enabled || !s.categories.downloads) return false;
  const stop = stopIndex(s.aggressiveness);
  const { warnAt } = thresholds(s.aggressiveness);
  // Remote-access tools: always after a scare page; from Balanced up, unless from the publisher.
  if (opts.remoteAccessTool && (opts.afterScarePage || (stop >= 1 && !opts.fromVendor) || stop >= 2)) return true;
  if (opts.trusted) return false;
  if (stop === 0) return false;
  if (stop === 1) return opts.executable && opts.pageScore >= warnAt;
  if (stop === 2) return opts.executable;
  return true; // Paranoid: every download from a non-allowlisted site
}
