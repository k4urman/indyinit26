import { parse } from 'tldts';
import { BRANDS, HOSTNAME_ONLY_TERMS, type Brand } from '../data/brands';
import { PHRASES, type PhraseFamily } from '../data/lists';
import type { DomainFindings, ParsedUrl } from '../detectors/domain';
import type { Reason } from '../shared/contract';
import { R } from './reasons';
import type { PageSignals } from './signals';

/**
 * Risk score for one page (docs/plan.md §4.2):
 *   score = clamp(Σ weight × signal − allowlist credit, 0, 100), plus combination floors.
 * Pure function so it can be unit-tested and tuned against the eval set.
 */
export interface ScoreInput {
  url: ParsedUrl;
  domain: DomainFindings;
  page?: PageSignals;
  knownBad: boolean;
  listed: 'allow' | 'block' | null;
  topSite: boolean; // Tranco top list
}

export type HighlightLevel = 'high' | 'medium' | 'low';

export interface ScoreResult {
  score: number;
  reasons: Reason[]; // top 3
  brand: Brand | null; // brand being impersonated, if any
  safeAlternative?: { label: string; url: string };
  flags: {
    knownBad: boolean;
    scareware: boolean;
    hostile: boolean; // any screen-takeover behaviour
    impersonating: boolean;
  };
  highlights: { id: number; reason: Reason; level: HighlightLevel }[];
}

interface Hit {
  weight: number;
  reason: Reason;
}

const PHONE_RE = /(?:\+?1[\s.-]?)?\(?\b[2-9]\d{2}\)?[\s.-]\d{3}[\s.-]\d{4}\b/g;
const SMALL_FEE_RE = /(?:\$|usd\s?)\s?(?:0|1|2|3)\.\d{2}\b/;
const FEE_CONTEXT_RE = /\b(package|parcel|delivery|redeliver|shipment|shipping|toll|e-?zpass|customs|postage)\b/;
const DISCOUNT_RE = /\b(?:[7-9]\d)\s?%\s?off\b/g;
const ODD_PAYMENT_RE = /\b(zelle|bitcoin|btc|usdt|crypto|gift ?card|cash ?app|wire transfer)\b/;
const CRYPTO_ADDR_RE = /\b(?:bc1[a-z0-9]{25,59}|[13][a-km-zA-HJ-NP-Z1-9]{25,34}|0x[a-f0-9]{40}|T[A-Za-z1-9]{33})\b/;
const DEPOSIT_RE = /\b(deposit|top ?up|recharge|fund your account|withdraw)\b/;
const LOGIN_CONTEXT_RE = /\b(sign ?in|log ?in|login|account|online banking|verify|secure|password)\b/;

function countPhrases(text: string, family: PhraseFamily): number {
  let n = 0;
  for (const p of PHRASES[family]) if (text.includes(p)) n++;
  return n;
}

function escapeRe(s: string): string {
  return s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

const BRAND_NAME_RES = BRANDS.map((b) => ({
  brand: b,
  res: b.names.map((n) => ({ term: n, re: new RegExp(`(^|[^a-z0-9])${escapeRe(n)}([^a-z0-9]|$)`) })),
}));

/** Brands the page claims to be, from its title, headings and logos. */
export function claimedBrands(page: PageSignals): Brand[] {
  const identity = [page.title, ...page.identity].join(' \n ').toLowerCase();
  const loginContext = LOGIN_CONTEXT_RE.test(identity) || page.forms.password > 0 || page.forms.card > 0;
  const found: Brand[] = [];
  for (const { brand, res } of BRAND_NAME_RES) {
    for (const { term, re } of res) {
      if (!re.test(identity)) continue;
      if (HOSTNAME_ONLY_TERMS.has(term) && !loginContext) continue; // "Apple pie recipe"
      found.push(brand);
      break;
    }
  }
  return found;
}

function offDomainHost(hosts: string[], pageDomain: string): string | null {
  for (const h of hosts) {
    const d = parse(h).domain ?? h;
    if (d && d !== pageDomain) return h;
  }
  return null;
}

export function scorePage(input: ScoreInput): ScoreResult {
  const { url, domain: d, page, knownBad, listed } = input;
  const result: ScoreResult = {
    score: 0,
    reasons: [],
    brand: null,
    flags: { knownBad, scareware: false, hostile: false, impersonating: false },
    highlights: [],
  };

  if (listed === 'allow') return result;
  if (listed === 'block' || knownBad) {
    result.score = 100;
    result.reasons = [listed === 'block' ? R.userBlocklist() : R.knownBad()];
    return result;
  }

  const hits: Hit[] = [];
  const add = (weight: number, reason: Reason) => hits.push({ weight, reason });
  let floor = 0;

  // Free hosts sit under big brands' domains (sites.google.com), so they never count as trusted.
  const trustedName = !d.trustedHostAbuse && (d.official !== null || input.topSite);

  // --- Domain ---------------------------------------------------------------
  let brand: Brand | null = null;
  if (d.lookalike) {
    brand = d.lookalike.brand;
    add(40, R.lookalike(brand, url.hostname));
    if (d.lookalike.how === 'idn') add(10, R.idn());
  } else if (d.combosquat && !trustedName) {
    brand = d.combosquat;
    add(25, R.combosquat(brand, url.domain));
  } else if (d.isIdn) {
    add(10, R.idn());
  }
  if (d.isIp) add(15, R.ip());
  if (d.shortener) add(10, R.shortener());
  if (d.riskyTld) add(8, R.riskyTld(url.suffix.split('.').pop() ?? url.suffix));
  if (d.deepSubdomains && !trustedName) add(5, R.longAddress(url.hostname));

  // --- Page -----------------------------------------------------------------
  if (page) {
    const text = page.text;
    const f = page.forms;
    const asksSecrets = f.password > 0 || f.card > 0 || f.seed > 0 || f.bank > 0 || f.ssn > 0;

    // Identity: claims to be a brand but isn't on its domain.
    const claimed = trustedName ? [] : claimedBrands(page);
    if (claimed.length > 0 && claimed.length <= 2) {
      const b = brand && claimed.includes(brand) ? brand : claimed[0]!;
      brand = brand ?? b;
      result.flags.impersonating = true;
      add(25, R.impersonation(b, url.domain));
    }

    if (d.trustedHostAbuse && asksSecrets) add(20, R.trustedHost(d.trustedHostAbuse));

    // Forms.
    const offsite = f.password > 0 ? offDomainHost(f.passwordActionHosts, url.domain) : null;
    if (offsite) add(20, R.passwordOffsite(offsite));
    else if (f.password > 0 && !trustedName) add(8, R.asksPassword());
    if (f.seed > 0 && !trustedName) add(35, R.asksSeed());
    if (f.ssn > 0 && !trustedName) add(10, R.asksSsn());
    if (f.bank > 0 && !trustedName) add(5, R.asksBank());

    const smallFee = f.card > 0 && SMALL_FEE_RE.test(text) && FEE_CONTEXT_RE.test(text);
    if (smallFee && !trustedName) add(25, R.smallFee(brand?.kind === 'delivery' ? brand : null));
    else if (f.card > 0 && !trustedName) add(5, R.asksCard());

    // Language.
    const urgency = countPhrases(text, 'urgency');
    if (urgency >= 2) add(urgency >= 4 ? 15 : 10, R.pressure());

    const scare = countPhrases(text, 'scareware');
    const phones = (text.match(PHONE_RE) ?? []).length;
    if (scare >= 2) add(scare >= 4 ? 30 : 20, R.scareware());
    if (scare >= 2 && phones > 0) add(15, R.scareware());

    const invest = countPhrases(text, 'investment');
    const cryptoAddr = CRYPTO_ADDR_RE.test(page.text);
    if (invest >= 2) add(invest >= 4 ? 25 : 15, R.investment());
    if (invest >= 2 && (cryptoAddr || DEPOSIT_RE.test(text))) add(15, R.investment());

    const gift = countPhrases(text, 'giftCard');
    if (gift >= 2) add(20, R.giftCard());

    if (countPhrases(text, 'prize') >= 2) add(15, R.prize());
    if (countPhrases(text, 'seedPhrase') >= 2 && f.seed === 0 && !trustedName) add(10, R.asksSeed());

    const discounts = (text.match(DISCOUNT_RE) ?? []).length;
    if (discounts >= 3 && ODD_PAYMENT_RE.test(text)) add(20, R.fakeShop());

    // Behaviour.
    const b = page.behavior;
    const hostile = b.fullscreen || b.keyboardLock || b.pointerLock || b.alertLoop || b.beforeunloadTrap || b.historySpam;
    result.flags.hostile = hostile;
    let bw = 0;
    if (b.fullscreen) bw += 15;
    if (b.keyboardLock) bw += 20;
    if (b.pointerLock) bw += 10;
    if (b.alertLoop) bw += 15;
    if (b.autoplayAudio && (hostile || scare >= 2)) bw += 10;
    if (b.beforeunloadTrap) bw += 10;
    if (b.historySpam) bw += 10;
    if (bw > 0) add(Math.min(bw, 45), R.lockedScreen());
    if (b.walletRequest && !trustedName) add(10, R.wallet());
    // ClickFix: a page copying a shell command is never legitimate for these users; the
    // "press Win+R / Ctrl+V" instructions alone are a weaker sign.
    const clickFixText = countPhrases(text, 'clickFix');
    if (b.clipboardCommand) add(60, R.clickFix());
    else if (clickFixText >= 3) add(20, R.clickFix());

    // --- Combination floors -------------------------------------------------
    const pretends = Boolean(d.lookalike || d.combosquat || result.flags.impersonating) && !trustedName;
    if (pretends && (f.password > 0 || f.card > 0 || f.seed > 0 || f.bank > 0)) floor = Math.max(floor, 85);
    if (smallFee && pretends) floor = Math.max(floor, 85);
    if (scare >= 2 && (hostile || phones > 0)) {
      floor = Math.max(floor, 90);
      result.flags.scareware = true;
    }
    if (f.seed > 0 && !trustedName) floor = Math.max(floor, 70);
    if (b.clipboardCommand) floor = Math.max(floor, 90);
    // A bank, company or agency asking for gift cards is always a scam (FTC).
    if (gift >= 2 && (pretends || result.flags.impersonating)) floor = Math.max(floor, 85);
    if (invest >= 2 && (cryptoAddr || b.walletRequest)) floor = Math.max(floor, 60);

    // --- Elements to highlight ---------------------------------------------
    for (const el of page.elements) {
      switch (el.kind) {
        case 'passwordForm':
          if (offsite) result.highlights.push({ id: el.id, reason: R.passwordOffsite(offsite), level: 'high' });
          else if (pretends && brand) result.highlights.push({ id: el.id, reason: R.lookalike(brand, url.hostname), level: 'high' });
          break;
        case 'cardForm':
          if (smallFee) result.highlights.push({ id: el.id, reason: R.smallFee(brand?.kind === 'delivery' ? brand : null), level: 'high' });
          else if (pretends) result.highlights.push({ id: el.id, reason: R.asksCard(), level: 'medium' });
          break;
        case 'seedForm':
          if (!trustedName) result.highlights.push({ id: el.id, reason: R.asksSeed(), level: 'high' });
          break;
        case 'bankForm':
          if (pretends) result.highlights.push({ id: el.id, reason: R.asksBank(), level: 'medium' });
          break;
        case 'phone':
          if (scare >= 2) result.highlights.push({ id: el.id, reason: R.scareware(), level: 'high' });
          break;
        case 'walletButton':
          if (invest >= 2) result.highlights.push({ id: el.id, reason: R.investment(), level: 'medium' });
          break;
        case 'downloadLink':
          if (el.text) result.highlights.push({ id: el.id, reason: R.executable(el.text), level: 'low' });
          break;
        case 'fileInput':
          result.highlights.push({ id: el.id, reason: R.upload(), level: 'low' });
          break;
      }
    }
  }

  // --- Total ------------------------------------------------------------------
  let score = hits.reduce((s, h) => s + h.weight, 0);
  if (trustedName) score -= 40;
  score = Math.max(score, floor);
  if (trustedName && !result.flags.scareware) score = Math.min(score, 30);
  result.score = Math.max(0, Math.min(100, Math.round(score)));

  // Top 3 reasons, strongest first, no duplicate titles.
  const seen = new Set<string>();
  result.reasons = hits
    .sort((a, b) => b.weight - a.weight)
    .map((h) => h.reason)
    .filter((r) => !seen.has(r.title) && seen.add(r.title))
    .slice(0, 3);

  result.brand = brand;
  if (brand && result.score > 0) {
    const real = brand.domains[0]!;
    result.safeAlternative = { label: `Go to the real ${real}`, url: `https://${real}/` };
  }
  return result;
}
