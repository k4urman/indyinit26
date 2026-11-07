/**
 * Builds the bundled reputation data (run: npm run lists).
 *   public/lists/known-bad.bin   bloom filter of phishing/scam hostnames
 *   public/lists/top-sites.json  Tranco top 10k registrable domains (false-positive guard)
 *   public/lists/meta.json       sources, counts, build time
 *
 * Sources (free, no keys): OpenPhish community feed, Phishing.Database (MIT), Tranco.
 * plan.md Phase 2 moves this to a signed, hourly GitHub Action.
 */
import { execFileSync } from 'node:child_process';
import { mkdirSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { parse } from 'tldts';
import { BRANDS } from '../src/data/brands.ts';
import { TRUSTED_HOST_ABUSE, URL_SHORTENERS } from '../src/data/lists.ts';
import { Bloom } from '../src/engine/bloom.ts';

const OUT = join(import.meta.dirname, '..', 'public', 'lists');
const TOP_N = 10_000;

const SOURCES = {
  openphish: 'https://raw.githubusercontent.com/openphish/public_feed/refs/heads/main/feed.txt',
  phishingDatabase: 'https://raw.githubusercontent.com/Phishing-Database/Phishing.Database/master/phishing-domains-ACTIVE.txt',
  tranco: 'https://tranco-list.eu/top-1m.csv.zip',
};

async function text(url: string): Promise<string> {
  const res = await fetch(url);
  if (!res.ok) throw new Error(`${url}: HTTP ${res.status}`);
  return res.text();
}

async function trancoTop(n: number): Promise<string[]> {
  const res = await fetch(SOURCES.tranco);
  if (!res.ok) throw new Error(`tranco: HTTP ${res.status}`);
  const zip = join(tmpdir(), `tranco-${process.pid}.zip`);
  writeFileSync(zip, Buffer.from(await res.arrayBuffer()));
  const csv = execFileSync('unzip', ['-p', zip], { maxBuffer: 64 * 1024 * 1024 }).toString();
  const out: string[] = [];
  for (const line of csv.split('\n')) {
    const d = line.split(',')[1]?.trim();
    if (d) out.push(d);
    if (out.length >= n) break;
  }
  return out;
}

function hostOf(entry: string): string | null {
  const s = entry.trim().toLowerCase();
  if (!s || s.startsWith('#')) return null;
  try {
    return new URL(s.includes('://') ? s : `http://${s}`).hostname.replace(/^www\./, '');
  } catch {
    return null;
  }
}

const top = await trancoTop(TOP_N);
// Never block a whole popular or official domain, or a shared host's root.
const protectedHosts = new Set<string>([
  ...top,
  ...BRANDS.flatMap((b) => b.domains),
  ...TRUSTED_HOST_ABUSE,
  ...URL_SHORTENERS,
]);

// Only hosts whose whole domain is user content; sites.google.com must not make google.com "free".
const freeHosts = new Set(TRUSTED_HOST_ABUSE.filter((h) => parse(h).domain === h));
const bad = new Set<string>();
let skipped = 0;
for (const [name, url] of [['openphish', SOURCES.openphish], ['phishingDatabase', SOURCES.phishingDatabase]] as const) {
  const lines = (await text(url)).split('\n');
  for (const line of lines) {
    const host = hostOf(line);
    if (!host) continue;
    // Keep "evil.blogspot.com", but never list a popular/official domain or its subdomains:
    // a stale or wrong feed entry there would break a site millions use.
    const domain = parse(host).domain ?? host;
    const freeHost = freeHosts.has(domain);
    if (protectedHosts.has(host) || (!freeHost && protectedHosts.has(domain))) {
      skipped++;
      continue;
    }
    bad.add(host);
  }
  console.log(`${name}: ${lines.length} lines`);
}

const bloom = Bloom.create(bad.size, 1e-6);
for (const h of bad) bloom.add(h);

mkdirSync(OUT, { recursive: true });
writeFileSync(join(OUT, 'known-bad.bin'), bloom.serialize());
writeFileSync(join(OUT, 'top-sites.json'), JSON.stringify(top));
writeFileSync(
  join(OUT, 'meta.json'),
  JSON.stringify({ builtAt: new Date().toISOString(), knownBad: bad.size, skippedProtected: skipped, topSites: top.length, sources: SOURCES }, null, 2),
);
console.log(`known-bad: ${bad.size} hosts (${skipped} protected skipped), bloom ${(bloom.bits.length / 1e6).toFixed(2)} MB, k=${bloom.k}`);
