import { Bloom } from '../engine/bloom';
import { extUrl } from '../engine/ext-url';

/**
 * Bundled reputation data (built by scripts/build-lists.ts). Loaded lazily and
 * kept in memory while the background worker is alive.
 */
let bloom: Promise<Bloom | null> | null = null;
let top: Promise<Set<string>> | null = null;

async function load<T>(path: string, parse: (r: Response) => Promise<T>, fallback: T): Promise<T> {
  try {
    const res = await fetch(extUrl(path));
    if (!res.ok) throw new Error(`HTTP ${res.status}`);
    return await parse(res);
  } catch (e) {
    // Fail open: missing data means fewer detections, never a broken browser.
    console.warn(`[sentinel] could not load ${path}`, e);
    return fallback;
  }
}

function knownBadFilter(): Promise<Bloom | null> {
  bloom ??= load('/lists/known-bad.bin', async (r) => Bloom.deserialize(await r.arrayBuffer()), null);
  return bloom;
}

function topSites(): Promise<Set<string>> {
  top ??= load('/lists/top-sites.json', async (r) => new Set((await r.json()) as string[]), new Set<string>());
  return top;
}

/** Checks the host and each parent down to the registrable domain ("a.b.evil.com" -> "evil.com"). */
export async function isKnownBad(hostname: string, domain: string): Promise<boolean> {
  const f = await knownBadFilter();
  if (!f) return false;
  let h = hostname.replace(/^www\./, '');
  for (;;) {
    if (f.has(h)) return true;
    if (h === domain || !h.includes('.')) return false;
    h = h.slice(h.indexOf('.') + 1);
  }
}

export async function isTopSite(domain: string): Promise<boolean> {
  return (await topSites()).has(domain);
}

/** Warm the caches at startup so the first page check is fast. */
export function preloadReputation(): void {
  void knownBadFilter();
  void topSites();
}
