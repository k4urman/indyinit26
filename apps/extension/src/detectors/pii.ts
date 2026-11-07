import { wordlist as BIP39 } from '@scure/bip39/wordlists/english.js';

/**
 * Pattern checks for sensitive identifiers typed into a page. Values are only
 * examined in memory; callers must never store or send them.
 *
 * Deliberately excludes email, phone and date of birth: they're typed into
 * every signup form and would make warnings meaningless (docs/plan.md P5).
 */
export type PiiKind = 'card' | 'ssn' | 'passport' | 'seedPhrase' | 'bankAccount';

export function luhn(digits: string): boolean {
  let sum = 0;
  for (let i = 0; i < digits.length; i++) {
    let d = digits.charCodeAt(digits.length - 1 - i) - 48;
    if (i % 2 === 1) {
      d *= 2;
      if (d > 9) d -= 9;
    }
    sum += d;
  }
  return sum % 10 === 0;
}

export function isCardNumber(value: string): boolean {
  const digits = value.replace(/[\s-]/g, '');
  if (!/^\d{13,19}$/.test(digits)) return false;
  if (!/^(4|5[1-5]|2[2-7]|3[47]|6(011|5|4[4-9])|3(0[0-5]|[68])|35)/.test(digits)) return false;
  return luhn(digits);
}

/** SSA validity rules: no 000/666/9xx area, no 00 group, no 0000 serial. */
export function isSsn(value: string): boolean {
  const m = /^\s*(\d{3})[- ]?(\d{2})[- ]?(\d{4})\s*$/.exec(value);
  if (!m) return false;
  const [, area, group, serial] = m;
  if (area === '000' || area === '666' || area!.startsWith('9')) return false;
  return group !== '00' && serial !== '0000';
}

const BIP39_SET = new Set(BIP39);

/** 12+ words, nearly all from the BIP39 list: someone is typing a wallet recovery phrase. */
export function isSeedPhrase(value: string): boolean {
  const words = value.toLowerCase().trim().split(/\s+/);
  if (words.length < 12) return false;
  const hits = words.filter((w) => BIP39_SET.has(w)).length;
  return hits >= 12 && hits / words.length >= 0.9;
}

export function isBip39Word(word: string): boolean {
  return BIP39_SET.has(word.toLowerCase().trim());
}

/** Field hints from name/id/autocomplete/label text. */
const HINTS: [PiiKind, RegExp][] = [
  ['card', /\b(cc-?number|card-?num|cardnumber|credit.?card|debit.?card|card.?no)\b/i],
  ['ssn', /\b(ssn|social.?security|sin.?number|tax.?id|itin)\b/i],
  ['passport', /\bpassport\b/i],
  ['bankAccount', /\b(routing|aba|iban|account.?number|acct.?no|sort.?code|swift|bic)\b/i],
  ['seedPhrase', /\b(seed|mnemonic|recovery.?phrase|secret.?phrase|private.?key)\b/i],
];

export function kindFromFieldHint(hint: string): PiiKind | null {
  for (const [kind, re] of HINTS) if (re.test(hint)) return kind;
  return null;
}

/** What the typed value looks like, regardless of the field's label. */
export function kindFromValue(value: string): PiiKind | null {
  if (value.length < 9) return null;
  if (isCardNumber(value)) return 'card';
  if (isSsn(value)) return 'ssn';
  if (isSeedPhrase(value)) return 'seedPhrase';
  return null;
}
