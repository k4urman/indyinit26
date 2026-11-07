import { parse } from 'tldts';
import { BRANDS, HOSTNAME_ONLY_TERMS, brandOfDomain, type Brand } from '../data/brands';
import { RISKY_TLDS, TRUSTED_HOST_ABUSE, URL_SHORTENERS } from '../data/lists';

export interface ParsedUrl {
  url: string;
  hostname: string;
  domain: string; // registrable domain, or hostname when there is none (IPs, localhost)
  label: string; // domain without its public suffix: "paypal" for paypal.co.uk
  suffix: string;
  isIp: boolean;
  isIdn: boolean; // has punycode labels
  protocol: string;
}

export function parseUrl(raw: string): ParsedUrl | null {
  let u: URL;
  try {
    u = new URL(raw);
  } catch {
    return null;
  }
  const r = parse(u.hostname, { allowPrivateDomains: false });
  const hostname = u.hostname.replace(/^\[|\]$/g, '').toLowerCase();
  const domain = r.domain ?? hostname;
  return {
    url: u.href,
    hostname,
    domain,
    label: r.domainWithoutSuffix ?? domain.split('.')[0] ?? domain,
    suffix: r.publicSuffix ?? '',
    isIp: Boolean(r.isIp),
    isIdn: hostname.split('.').some((l) => l.startsWith('xn--')),
    protocol: u.protocol,
  };
}

/** Pages we never analyse: browser and extension pages, local files. */
export function isAnalysable(raw: string): boolean {
  return /^https?:/i.test(raw);
}

// ---------------------------------------------------------------------------
// Lookalike detection
// ---------------------------------------------------------------------------

/** Characters that look alike, folded to one ASCII "skeleton" (subset of Unicode confusables). */
const CONFUSABLES: Record<string, string> = {
  '0': 'o', '1': 'l', '3': 'e', '4': 'a', '5': 's', '7': 't', '8': 'b', '9': 'g', '|': 'l', '!': 'i',
  'а': 'a', 'е': 'e', 'о': 'o', 'р': 'p', 'с': 'c', 'х': 'x', 'у': 'y', 'і': 'i', 'ј': 'j', 'ԁ': 'd', 'ѕ': 's',
  'ɑ': 'a', 'α': 'a', 'ο': 'o', 'ρ': 'p', 'ν': 'v', 'τ': 't', 'κ': 'k', 'ι': 'i', 'ɡ': 'g', 'ӏ': 'l', 'ⅼ': 'l',
  'á': 'a', 'à': 'a', 'â': 'a', 'ä': 'a', 'ã': 'a', 'å': 'a', 'é': 'e', 'è': 'e', 'ê': 'e', 'ë': 'e',
  'í': 'i', 'ì': 'i', 'î': 'i', 'ï': 'i', 'ó': 'o', 'ò': 'o', 'ô': 'o', 'ö': 'o', 'õ': 'o', 'ú': 'u', 'ù': 'u',
  'û': 'u', 'ü': 'u', 'ç': 'c', 'ñ': 'n', 'ý': 'y', 'ı': 'i', 'ł': 'l', 'ø': 'o',
};

/** Fold confusable characters and multi-letter tricks ("rn" -> "m", "vv" -> "w"). */
export function skeleton(s: string): string {
  let out = '';
  for (const ch of s.toLowerCase()) out += CONFUSABLES[ch] ?? ch;
  return out.replace(/rn/g, 'm').replace(/vv/g, 'w').replace(/cl/g, 'd');
}

/** Damerau-Levenshtein (optimal string alignment) distance, capped for speed. */
export function editDistance(a: string, b: string, max = 3): number {
  if (Math.abs(a.length - b.length) > max) return max + 1;
  const d: number[][] = Array.from({ length: a.length + 1 }, (_, i) => [i, ...Array<number>(b.length).fill(0)]);
  for (let j = 1; j <= b.length; j++) d[0]![j] = j;
  for (let i = 1; i <= a.length; i++) {
    let rowMin = Infinity;
    for (let j = 1; j <= b.length; j++) {
      const cost = a[i - 1] === b[j - 1] ? 0 : 1;
      let v = Math.min(d[i - 1]![j]! + 1, d[i]![j - 1]! + 1, d[i - 1]![j - 1]! + cost);
      if (i > 1 && j > 1 && a[i - 1] === b[j - 2] && a[i - 2] === b[j - 1]) v = Math.min(v, d[i - 2]![j - 2]! + 1);
      d[i]![j] = v;
      rowMin = Math.min(rowMin, v);
    }
    if (rowMin > max) return max + 1;
  }
  return d[a.length]![b.length]!;
}

function decodeIdn(hostname: string): string {
  try {
    return hostname
      .split('.')
      .map((l) => (l.startsWith('xn--') ? punycodeDecode(l.slice(4)) : l))
      .join('.');
  } catch {
    return hostname;
  }
}

/** RFC 3492 decoder (small, avoids a dependency). */
function punycodeDecode(input: string): string {
  const base = 36, tMin = 1, tMax = 26, skew = 38, damp = 700;
  const output: number[] = [];
  let n = 128, i = 0, bias = 72;
  let basic = input.lastIndexOf('-');
  if (basic < 0) basic = 0;
  for (let j = 0; j < basic; j++) output.push(input.charCodeAt(j));
  const adapt = (delta: number, numPoints: number, first: boolean) => {
    delta = first ? Math.floor(delta / damp) : delta >> 1;
    delta += Math.floor(delta / numPoints);
    let k = 0;
    while (delta > ((base - tMin) * tMax) >> 1) {
      delta = Math.floor(delta / (base - tMin));
      k += base;
    }
    return k + Math.floor(((base - tMin + 1) * delta) / (delta + skew));
  };
  for (let idx = basic > 0 ? basic + 1 : 0; idx < input.length; ) {
    const oldi = i;
    for (let w = 1, k = base; ; k += base) {
      const c = input.charCodeAt(idx++);
      const digit = c - 48 < 10 ? c - 22 : c - 65 < 26 ? c - 65 : c - 97 < 26 ? c - 97 : base;
      if (digit >= base) throw new Error('bad punycode');
      i += digit * w;
      const t = k <= bias ? tMin : k >= bias + tMax ? tMax : k - bias;
      if (digit < t) break;
      w *= base - t;
    }
    bias = adapt(i - oldi, output.length + 1, oldi === 0);
    n += Math.floor(i / (output.length + 1));
    i %= output.length + 1;
    output.splice(i++, 0, n);
  }
  return String.fromCodePoint(...output);
}

/**
 * Whether pages directly on this host are user content: sites.google.com/view/x is,
 * jotform.com (the company's own site) isn't; its users get form.jotform.com.
 */
function isUserContentRoot(h: string): boolean {
  return h.split('.').length >= 3 || h === 'forms.gle';
}

/** Endings owned by the company itself (ICANN "brand TLDs"): mail.microsoft is Microsoft's. */
const BRAND_TLDS: Record<string, string> = {
  microsoft: 'Microsoft', windows: 'Microsoft', office: 'Microsoft', xbox: 'Microsoft', bing: 'Microsoft',
  amazon: 'Amazon', google: 'Google', youtube: 'Google', gmail: 'Google', apple: 'Apple', chase: 'Chase',
  citi: 'Citi', netflix: 'Netflix', visa: 'Visa', ups: 'UPS', fedex: 'FedEx', dhl: 'DHL', target: 'Target',
  walmart: 'Walmart', ebay: 'eBay', bestbuy: 'Best Buy', americanexpress: 'American Express', amex: 'American Express',
  capitalone: 'Capital One', wellsfargo: 'Wells Fargo', pnc: 'PNC', att: 'AT&T', verizon: 'Verizon', adobe: 'Adobe',
};

export interface DomainFindings {
  official: Brand | null; // this IS the brand's real domain
  /** 'tld': the brand's exact name under another ending (chase.xyz, metamask.lt). */
  lookalike: { brand: Brand; how: 'typo' | 'homoglyph' | 'idn' | 'tld' } | null;
  combosquat: Brand | null; // "paypal-secure-login.xyz", "chase.com.verify-account.net"
  riskyTld: boolean;
  trustedHostAbuse: string | null; // the free host the page sits on
  shortener: boolean;
  isIp: boolean;
  isIdn: boolean;
  deepSubdomains: boolean;
}

const BRAND_LABELS: { brand: Brand; label: string; skel: string }[] = BRANDS.flatMap((brand) =>
  brand.domains.map((d) => {
    const label = parse(d).domainWithoutSuffix ?? d;
    return { brand, label, skel: skeleton(label) };
  }),
);

/** Brand terms usable inside hostnames (no spaces, at least 4 chars to avoid "ups" in "groups"). */
const HOST_TERMS: { brand: Brand; term: string; raw: string }[] = BRANDS.flatMap((brand) =>
  brand.names
    .filter((n) => !n.includes(' ') && n.length >= 4)
    .map((raw) => ({ brand, raw, term: skeleton(raw.replace(/[^a-z0-9]/g, '')) })),
);

export function analyseDomain(p: ParsedUrl): DomainFindings {
  const brandTld = BRAND_TLDS[p.suffix];
  const official = brandOfDomain(p.domain) ?? (brandTld ? (BRANDS.find((b) => b.name === brandTld) ?? null) : null);
  const bare = p.hostname.replace(/^www\./, '');
  const f: DomainFindings = {
    official,
    lookalike: null,
    combosquat: null,
    riskyTld: RISKY_TLDS.has(p.suffix.split('.').pop() ?? ''),
    trustedHostAbuse: TRUSTED_HOST_ABUSE.find((h) => bare.endsWith('.' + h) || (bare === h && isUserContentRoot(h))) ?? null,
    shortener: URL_SHORTENERS.has(p.domain),
    isIp: p.isIp,
    isIdn: p.isIdn,
    deepSubdomains: p.hostname.split('.').length - p.domain.split('.').length >= 3,
  };
  if (official || p.isIp) return f;

  const decodedLabel = p.isIdn ? decodeIdn(p.label) : p.label;
  const skel = skeleton(decodedLabel);
  for (const { brand, label, skel: bskel } of BRAND_LABELS) {
    if (label.length < 4) continue; // too short to judge typos ("ups", "pnc")
    if (p.isIdn && skel === bskel) {
      f.lookalike = { brand, how: 'idn' };
      break;
    }
    if (decodedLabel !== label && skel === bskel) {
      f.lookalike = { brand, how: 'homoglyph' };
      break;
    }
    // Same name, other ending: global companies own dozens (google.com.qa, ebay.es), so only
    // brands that don't (banks, payment, crypto, delivery, government) count here.
    if (decodedLabel === label) {
      if (brand.kind === 'tech' || brand.kind === 'social' || brand.kind === 'shop') continue;
      f.lookalike = { brand, how: 'tld' };
      break;
    }
    // Short names ("apple", "chase") are one typo away from real words ("apply",
    // "chasm"), so they only count as lookalikes via character swaps (caught above).
    const maxDist = label.length >= 9 ? 2 : label.length >= 6 ? 1 : 0;
    // Real typosquats keep the first letter ("paypai", not "qaypal"); requiring it drops
    // most accidental matches between unrelated names ("psbank" vs "usbank").
    if (maxDist > 0 && decodedLabel[0] === label[0] && editDistance(decodedLabel, label, maxDist) <= maxDist) {
      f.lookalike = { brand, how: 'typo' };
      break;
    }
  }

  // Brand name inside the hostname of an unrelated domain.
  const host = skeleton(p.hostname.replace(/[^a-z0-9.\-]/g, ''));
  const hostCompact = host.replace(/\./g, '');
  for (const { brand, term, raw } of HOST_TERMS) {
    if (hostCompact.includes(term)) {
      // "paypal-login", "paypalsecure" count; common words glued into others ("targeted",
      // "applebees") don't, so those brands need the term as a whole label part.
      const words = host.split(/[.\-]/);
      const loose = !HOSTNAME_ONLY_TERMS.has(raw) && term.length >= 5;
      const asWord = words.some((w) => w === term || (loose && (w.startsWith(term) || w.endsWith(term))));
      // google.com.qa, ebay.es: a global brand's own name as the whole site name, not a combo.
      const globalBrand = brand.kind === 'tech' || brand.kind === 'social' || brand.kind === 'shop';
      if (asWord && !(globalBrand && skeleton(decodedLabel) === term)) {
        f.combosquat = brand;
        break;
      }
    }
  }
  return f;
}
