import type { Settings, Verdict } from '../shared/contract';
import { analyseDomain, parseUrl, type ParsedUrl } from '../detectors/domain';
import { getLists, lookup } from '../storage/lists';
import { isKnownBad, isTopSite } from '../storage/reputation';
import { decide, severityOf, type PageDecision } from './policy';
import { scorePage, type ScoreResult } from './scoring';
import type { PageSignals } from './signals';

export interface Analysis {
  parsed: ParsedUrl;
  result: ScoreResult;
  verdict: Verdict;
  decision: PageDecision;
  listed: 'allow' | 'block' | null;
  trusted: boolean; // official, top site or allowlisted
}

/** Everything known about a URL (and optionally its page) -> verdict + what to do. */
export async function analyse(url: string, settings: Settings, page?: PageSignals): Promise<Analysis | null> {
  const parsed = parseUrl(url);
  if (!parsed) return null;
  const domain = analyseDomain(parsed);
  const [lists, knownBad, topSite] = await Promise.all([
    getLists(),
    isKnownBad(parsed.hostname, parsed.domain),
    isTopSite(parsed.domain),
  ]);
  const listed = lookup(lists, parsed.hostname);
  const result = scorePage({ url: parsed, domain, page, knownBad, listed, topSite });
  const trusted = listed === 'allow' || (!domain.trustedHostAbuse && (domain.official !== null || topSite));
  const severity = listed === 'allow' ? 'safe' : severityOf(result.score, settings.aggressiveness, Boolean(page) || trusted);
  const verdict: Verdict = {
    url: parsed.url,
    domain: parsed.domain,
    severity,
    score: result.score,
    // A safe verdict carries no reasons: weak signs below the threshold would only worry people.
    reasons: severity === 'safe' ? [] : result.reasons,
    ...(result.safeAlternative ? { safeAlternative: result.safeAlternative } : {}),
    depth: 'basic', // no cloud lookups in Phase 1
    checkedAt: Date.now(),
  };
  return { parsed, result, verdict, decision: decide(result, settings, trusted), listed, trusted };
}
