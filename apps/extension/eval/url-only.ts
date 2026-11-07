/**
 * Offline evaluation for the pitch (plan.md Phase 1 "metrics slide").
 *
 * Question: with the known-scam list switched OFF (a scam that went live minutes
 * ago), how often does the web address alone already look suspicious, and how
 * often do ordinary sites get flagged?
 *
 *   npx tsx eval/url-only.ts <openphish-feed.txt> <phishing-database.txt> <tranco.zip>
 *
 * Page signals (fake login forms, scare text, screen locking) are NOT included,
 * so this is a lower bound: the demo pages are caught by page signals.
 */
import { execFileSync } from 'node:child_process';
import { readFileSync, writeFileSync } from 'node:fs';
import { analyseDomain, parseUrl } from '../src/detectors/domain';
import { thresholds } from '../src/engine/policy';
import { scorePage } from '../src/engine/scoring';
import { STOPS } from '../src/shared/contract';
import { BRANDS } from '../src/data/brands';

const [openphishFile, pdbFile, trancoZip] = process.argv.slice(2);
if (!openphishFile || !pdbFile || !trancoZip) {
  console.error('usage: tsx eval/url-only.ts <openphish.txt> <phishing-database.txt> <tranco.zip>');
  process.exit(1);
}

// Deterministic sample so numbers are reproducible.
function sample<T>(xs: T[], n: number, seed = 42): T[] {
  let s = seed;
  const rnd = () => ((s = (Math.imul(s, 1103515245) + 12345) >>> 0) / 2 ** 32);
  const copy = [...xs];
  for (let i = copy.length - 1; i > 0; i--) {
    const j = Math.floor(rnd() * (i + 1));
    [copy[i], copy[j]] = [copy[j]!, copy[i]!];
  }
  return copy.slice(0, n);
}

const lines = (f: string) => readFileSync(f, 'utf8').split('\n').map((l) => l.trim()).filter((l) => l && !l.startsWith('#'));
const tranco = execFileSync('unzip', ['-p', trancoZip], { maxBuffer: 64 << 20 }).toString().split('\n').map((l) => l.split(',')[1]?.trim()).filter(Boolean) as string[];
const top10k = new Set(tranco.slice(0, 10_000));

const sets: { name: string; urls: string[]; scam: boolean }[] = [
  { name: 'OpenPhish community feed (live phishing URLs)', urls: lines(openphishFile), scam: true },
  { name: 'Phishing.Database, random 5,000 hosts', urls: sample(lines(pdbFile), 5000).map((h) => `http://${h}/`), scam: true },
  { name: 'Popular sites, Tranco #1–500 (trusted list applies)', urls: tranco.slice(0, 500).map((d) => `https://${d}/`), scam: false },
  { name: 'Ordinary sites, Tranco #10,001–15,000 (no trusted credit)', urls: tranco.slice(10_000, 15_000).map((d) => `https://${d}/`), scam: false },
];

const rows: string[] = [];
const header = `| Set | URLs | ${STOPS.map((s) => `${s.label} (≥${thresholds(s.at).warnAt})`).join(' | ')} | Any warning sign |`;
rows.push(header, `|${'---|'.repeat(STOPS.length + 3)}`);
const examples: string[] = [];
const brandRows: string[] = ['| Set | Addresses using a brand name | Identified as not that brand |', '|---|---|---|'];
// Naive "uses a brand name": any 5+ letter brand term appears in the hostname.
const BRAND_TERMS = [...new Set(BRANDS.flatMap((b) => b.names).map((n) => n.replace(/[^a-z0-9]/g, '')).filter((n) => n.length >= 5))];
const usesBrand = (host: string) => BRAND_TERMS.some((t) => host.replace(/[^a-z0-9]/g, '').includes(t));

for (const set of sets) {
  const scores: number[] = [];
  let anySign = 0;
  let branded = 0;
  let identified = 0;
  for (const raw of set.urls) {
    const p = parseUrl(raw);
    if (!p) continue;
    const r = scorePage({ url: p, domain: analyseDomain(p), knownBad: false, listed: null, topSite: top10k.has(p.domain) });
    scores.push(r.score);
    if (r.reasons.length) anySign++;
    if (usesBrand(p.hostname)) {
      branded++;
      if (r.reasons.some((x) => x.kind === 'lookalikeDomain')) identified++;
    }
    if (set.scam && r.score >= 35 && examples.length < 8) examples.push(`\`${p.hostname}\` → ${r.score}: ${r.reasons.map((x) => x.title).join('; ')}`);
  }
  const pct = (n: number) => `${((100 * n) / scores.length).toFixed(1)}%`;
  const cols = STOPS.map((s) => pct(scores.filter((x) => x >= thresholds(s.at).warnAt).length));
  rows.push(`| ${set.name} | ${scores.length} | ${cols.join(' | ')} | ${pct(anySign)} |`);
  brandRows.push(`| ${set.name} | ${branded} | ${branded ? ((100 * identified) / branded).toFixed(1) : '0.0'}% |`);
}

const out = `# URL-only detection (known-scam list off)

Generated ${new Date().toISOString().slice(0, 10)} by \`eval/url-only.ts\`. Each cell is the share of URLs whose
**web address alone** reaches the warning threshold at that protection level. For scam sets higher is
better; for ordinary sites lower is better. Page signals are not included, so for scams this is a
lower bound. In normal use the bundled list catches the listed ones outright; this measures brand-new ones.

${rows.join('\n')}

"Any warning sign" = at least one reason was found (e.g. look-alike name, free website builder,
unusual ending), even if below the warning threshold.

## Brand impersonation in the address

Of the addresses that contain a big brand's name (e.g. \`paypal-cancel.cc\`, \`amazon.co.jp.qs1a.xyz\`),
how many the engine names as "not that brand's website". For ordinary sites this is the false-alarm side.

${brandRows.join('\n')}

Examples caught from the address alone:

${examples.map((e) => `- ${e}`).join('\n')}
`;
writeFileSync(new URL('./results.md', import.meta.url), out);
console.log(out);
