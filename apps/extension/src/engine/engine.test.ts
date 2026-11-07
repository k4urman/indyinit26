import { describe, expect, it } from 'vitest';
import { analyseDomain, editDistance, parseUrl, skeleton } from '../detectors/domain';
import { isCardNumber, isSeedPhrase, isSsn, kindFromFieldHint, kindFromValue } from '../detectors/pii';
import { DEFAULT_SETTINGS, type Settings } from '../shared/contract';
import { Bloom } from './bloom';
import { decide, shouldPauseDownload, thresholds } from './policy';
import { scorePage } from './scoring';
import { EMPTY_BEHAVIOR, type PageSignals } from './signals';

function page(over: Partial<PageSignals> & { url: string }): PageSignals {
  return {
    title: '',
    identity: [],
    text: '',
    forms: { password: 0, passwordActionHosts: [], card: 0, bank: 0, seed: 0, ssn: 0, file: 0 },
    behavior: { ...EMPTY_BEHAVIOR },
    elements: [],
    ...over,
  };
}

function score(url: string, p?: Partial<PageSignals>, opts: { topSite?: boolean; knownBad?: boolean } = {}) {
  const parsed = parseUrl(url)!;
  return scorePage({
    url: parsed,
    domain: analyseDomain(parsed),
    page: p ? page({ url, ...p }) : undefined,
    knownBad: opts.knownBad ?? false,
    listed: null,
    topSite: opts.topSite ?? false,
  });
}

const settings = (aggressiveness: number): Settings => ({ ...DEFAULT_SETTINGS, aggressiveness });

describe('domain', () => {
  it('parses registrable domains', () => {
    const p = parseUrl('https://login.secure.paypal.co.uk/x')!;
    expect(p.domain).toBe('paypal.co.uk');
    expect(p.label).toBe('paypal');
  });

  it('folds look-alike characters', () => {
    expect(skeleton('paypa1')).toBe('paypal');
    expect(skeleton('rnicrosoft')).toBe('microsoft');
    expect(skeleton('аpple')).toBe('apple'); // Cyrillic а
  });

  it('measures typos with transpositions', () => {
    expect(editDistance('paypal', 'paypla')).toBe(1);
    expect(editDistance('microsoft', 'micrsoft')).toBe(1);
  });

  it.each([
    ['https://paypa1.com', 'PayPal', 'homoglyph'],
    ['https://micros0ft.com', 'Microsoft', 'homoglyph'],
    ['https://amazom.com', 'Amazon', 'typo'],
    ['https://wellsfargo-secure.com', null, null],
  ])('%s is a lookalike of %s', (url, brand, how) => {
    const f = analyseDomain(parseUrl(url)!);
    expect(f.lookalike?.brand.name ?? null).toBe(brand);
    expect(f.lookalike?.how ?? null).toBe(how);
  });

  it('finds brand names inside unrelated hostnames', () => {
    expect(analyseDomain(parseUrl('https://chase-secure-verify.com')!).combosquat?.name).toBe('Chase');
    expect(analyseDomain(parseUrl('https://usps-redelivery.top')!).combosquat?.name).toBe('USPS');
    expect(analyseDomain(parseUrl('https://chase.com.account-verify.net')!).combosquat?.name).toBe('Chase');
  });

  it('does not flag real brand domains or ordinary words', () => {
    expect(analyseDomain(parseUrl('https://secure.chase.com')!).official?.name).toBe('Chase');
    expect(analyseDomain(parseUrl('https://www.apply.com')!).lookalike).toBeNull();
    expect(analyseDomain(parseUrl('https://targetedmarketing.com')!).combosquat).toBeNull();
    expect(analyseDomain(parseUrl('https://applebees.com')!).combosquat).toBeNull();
  });

  it('treats user-content hosts under big names as untrusted', () => {
    expect(analyseDomain(parseUrl('https://sites.google.com/view/x')!).trustedHostAbuse).toBe('sites.google.com');
    expect(analyseDomain(parseUrl('https://my-bank.web.app')!).trustedHostAbuse).toBe('web.app');
    expect(analyseDomain(parseUrl('https://www.jotform.com')!).trustedHostAbuse).toBeNull();
    expect(analyseDomain(parseUrl('https://bucket.s3.amazonaws.com')!).official).toBeNull();
  });
});

describe('pii', () => {
  it('validates card numbers with Luhn', () => {
    expect(isCardNumber('4111 1111 1111 1111')).toBe(true);
    expect(isCardNumber('4111 1111 1111 1112')).toBe(false);
    expect(isCardNumber('1234567890123')).toBe(false);
  });

  it('validates SSNs', () => {
    expect(isSsn('123-45-6789')).toBe(true);
    expect(isSsn('000-12-3456')).toBe(false);
    expect(isSsn('900-12-3456')).toBe(false);
  });

  it('recognises recovery phrases', () => {
    const phrase = 'abandon ability able about above absent absorb abstract absurd abuse access accident';
    expect(isSeedPhrase(phrase)).toBe(true);
    expect(isSeedPhrase('the quick brown fox jumps over the lazy dog and runs far away')).toBe(false);
    expect(kindFromValue(phrase)).toBe('seedPhrase');
  });

  it('ignores email, phone and dates (plan.md P5)', () => {
    expect(kindFromValue('someone@example.com')).toBeNull();
    expect(kindFromValue('(317) 555-0199')).toBeNull();
    expect(kindFromValue('1950-04-12')).toBeNull();
  });

  it('reads field hints', () => {
    expect(kindFromFieldHint('cc-number Card number')).toBe('card');
    expect(kindFromFieldHint('ssn')).toBe('ssn');
    expect(kindFromFieldHint('Enter your 12-word recovery phrase')).toBe('seedPhrase');
    expect(kindFromFieldHint('email')).toBeNull();
  });
});

describe('scoring: demo scenarios', () => {
  it('fake Chase login on a lookalike domain is blocked with a safe alternative', () => {
    const r = score('https://chase-secure-verify.com/login', {
      title: 'Chase Online - Sign in',
      identity: ['Chase', 'chase-logo.svg'],
      text: 'your account has been locked due to unusual activity. verify your identity within 24 hours.',
      forms: { password: 1, passwordActionHosts: ['collect.evil-host.ru'], card: 0, bank: 0, seed: 0, ssn: 0, file: 0 },
      elements: [{ id: 0, kind: 'passwordForm' }],
    });
    expect(r.score).toBeGreaterThanOrEqual(85);
    expect(r.brand?.name).toBe('Chase');
    expect(r.safeAlternative?.url).toBe('https://chase.com/');
    expect(r.reasons[0]!.title).toMatch(/Chase/);
    expect(r.highlights.some((h) => h.level === 'high')).toBe(true);
  });

  it('USPS $1.99 redelivery fee page is blocked', () => {
    const r = score('https://usps-redelivery.top/pay', {
      title: 'USPS - Package on hold',
      identity: ['USPS'],
      text: 'your package is on hold due to an incomplete address. pay a $1.99 redelivery fee to schedule delivery.',
      forms: { password: 0, passwordActionHosts: [], card: 1, bank: 0, seed: 0, ssn: 0, file: 0 },
    });
    expect(r.score).toBeGreaterThanOrEqual(85);
    expect(r.reasons.map((x) => x.title)).toContain('Small fee to release a package or pay a toll');
  });

  it('tech-support scareware with fullscreen is flagged for rescue', () => {
    const r = score('https://win-defender-alert.xyz/', {
      title: 'Windows Security Alert',
      text: 'windows defender alert: your computer is infected with a trojan. do not restart. call microsoft support at 1-888-555-0142.',
      behavior: { ...EMPTY_BEHAVIOR, fullscreen: true, autoplayAudio: true },
    });
    expect(r.flags.scareware).toBe(true);
    expect(r.score).toBeGreaterThanOrEqual(90);
  });

  it('fake crypto platform asking for a deposit is risky', () => {
    const r = score('https://quantum-ai-profits.live/', {
      title: 'Quantum AI Trading',
      text: 'guaranteed returns of 3% daily profit. minimum deposit $250. withdraw anytime. send usdt to 0x52908400098527886e0f7030069857d2e4169ee7',
    });
    expect(r.score).toBeGreaterThanOrEqual(60);
  });

  it('wallet "validation" page asking for a recovery phrase is risky', () => {
    const r = score('https://wallet-rectify.app/', {
      text: 'synchronize wallet. enter your 12 word recovery phrase to validate wallet',
      forms: { password: 0, passwordActionHosts: [], card: 0, bank: 0, seed: 1, ssn: 0, file: 0 },
    });
    expect(r.score).toBeGreaterThanOrEqual(70);
  });
});

describe('scoring: false positives', () => {
  it('real Chase login is safe', () => {
    const r = score('https://secure.chase.com/web/auth', {
      title: 'Sign in - Chase',
      identity: ['Chase'],
      text: 'sign in to your account. unusual activity? we will never ask for your password by text.',
      forms: { password: 1, passwordActionHosts: ['secure.chase.com'], card: 0, bank: 0, seed: 0, ssn: 0, file: 0 },
    });
    expect(r.score).toBe(0);
  });

  it('a small shop on a new domain with a checkout is only mildly scored', () => {
    const r = score('https://grannys-quilts.shop/checkout', {
      title: "Granny's Quilts - Checkout",
      text: 'shipping $8.00. thank you for supporting a small business!',
      forms: { password: 0, passwordActionHosts: [], card: 1, bank: 0, seed: 0, ssn: 0, file: 0 },
    });
    expect(r.score).toBeLessThan(thresholds(33).warnAt);
  });

  it('a news article about Apple is not impersonation', () => {
    const r = score('https://example-news.com/apple-earnings', { title: 'Apple reports record quarter', text: 'apple said...' });
    expect(r.flags.impersonating).toBe(false);
  });

  it('a top site gets credit', () => {
    const r = score('https://www.wikipedia.org/', { title: 'Wikipedia' }, { topSite: true });
    expect(r.score).toBe(0);
  });

  it('a phishing form on sites.google.com is not trusted despite google.com', () => {
    const r = score('https://sites.google.com/view/microsoft-365-login', {
      title: 'Microsoft 365 Sign in',
      identity: ['Microsoft'],
      forms: { password: 1, passwordActionHosts: [], card: 0, bank: 0, seed: 0, ssn: 0, file: 0 },
    }, { topSite: true });
    expect(r.score).toBeGreaterThanOrEqual(85);
  });

  it('known-bad is always 100', () => {
    expect(score('https://anything.example', undefined, { knownBad: true }).score).toBe(100);
  });
});

describe('policy', () => {
  it('interpolates thresholds between stops', () => {
    expect(thresholds(0)).toEqual({ warnAt: 70, blockAt: 90 });
    expect(thresholds(33)).toEqual({ warnAt: 50, blockAt: 80 });
    expect(thresholds(100)).toEqual({ warnAt: 20, blockAt: 45 });
    const mid = thresholds(50);
    expect(mid.warnAt).toBeLessThan(50);
    expect(mid.warnAt).toBeGreaterThan(35);
  });

  it('blocks a high score and pauses risky actions', () => {
    const r = score('https://chase-secure-verify.com/', {
      title: 'Chase sign in',
      forms: { password: 1, passwordActionHosts: [], card: 0, bank: 0, seed: 0, ssn: 0, file: 0 },
    });
    const d = decide(r, settings(33), false);
    expect(d.page).toBe('block');
    expect(d.gates.personalInfo).toBe(true);
  });

  it('Strict pauses payments on unfamiliar sites, never on trusted ones', () => {
    const r = score('https://grannys-quilts.shop/', { forms: { password: 0, passwordActionHosts: [], card: 1, bank: 0, seed: 0, ssn: 0, file: 0 } });
    expect(decide(r, settings(66), false).gates.transactions).toBe(true);
    expect(decide(r, settings(66), true).gates.transactions).toBe(false);
    expect(decide(r, settings(33), false).gates.transactions).toBe(false);
  });

  it('master switch off does nothing', () => {
    const r = score('https://anything.example', undefined, { knownBad: true });
    expect(decide(r, { ...DEFAULT_SETTINGS, enabled: false }, false).page).toBe('none');
  });

  it('pauses remote-access tools after a scare page even when Chill', () => {
    const base = { pageScore: 0, trusted: false, executable: true };
    expect(shouldPauseDownload({ settings: settings(0), ...base, remoteAccessTool: true, afterScarePage: true })).toBe(true);
    expect(shouldPauseDownload({ settings: settings(0), ...base, remoteAccessTool: false, afterScarePage: false })).toBe(false);
    expect(shouldPauseDownload({ settings: settings(66), ...base, remoteAccessTool: false, afterScarePage: false })).toBe(true);
    expect(shouldPauseDownload({ settings: settings(66), ...base, trusted: true, remoteAccessTool: false, afterScarePage: false })).toBe(false);
  });
});

describe('bloom', () => {
  it('round-trips and has no false negatives', () => {
    const b = Bloom.create(1000, 1e-6);
    for (let i = 0; i < 1000; i++) b.add(`bad${i}.example`);
    const back = Bloom.deserialize(b.serialize().slice().buffer);
    for (let i = 0; i < 1000; i++) expect(back.has(`bad${i}.example`)).toBe(true);
    let fp = 0;
    for (let i = 0; i < 100_000; i++) if (back.has(`good${i}.example`)) fp++;
    expect(fp).toBeLessThan(3);
  });
});
