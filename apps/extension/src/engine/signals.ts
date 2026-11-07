/**
 * What the content script reports about a page. Raw observations only; all
 * judgement happens in the background (scoring.ts) so the content script stays
 * small and the brand/keyword data isn't shipped into every page.
 *
 * Never contains anything the user typed.
 */
export interface PageSignals {
  url: string;
  title: string;
  /** Page-claimed identity: og:site_name, h1/h2, logo alt text and image file names, favicon URL. */
  identity: string[];
  /** Visible text, lowercased and whitespace-collapsed, capped at ~20k chars. */
  text: string;
  forms: FormSignals;
  behavior: BehaviorSignals;
  /** Elements the background may ask to highlight, by index. */
  elements: ElementHint[];
}

export interface FormSignals {
  password: number; // password inputs
  passwordActionHosts: string[]; // hostnames that password forms post to
  card: number; // card-number-like inputs
  bank: number; // routing / account / IBAN inputs
  seed: number; // recovery-phrase inputs (hinted, or a 12/24-input grid)
  ssn: number;
  file: number;
}

export interface BehaviorSignals {
  fullscreen: boolean; // requestFullscreen called without a user-visible reason
  keyboardLock: boolean;
  pointerLock: boolean;
  alertLoop: boolean; // 3+ alert/confirm/prompt in 10 s
  autoplayAudio: boolean;
  beforeunloadTrap: boolean;
  historySpam: boolean; // 10+ pushState in 2 s (back-button hijack)
  notificationPrompt: boolean;
  walletRequest: boolean; // eth_requestAccounts / sendTransaction / solana connect
}

export type ElementKind = 'passwordForm' | 'cardForm' | 'seedForm' | 'bankForm' | 'fileInput' | 'phone' | 'downloadLink' | 'walletButton';

export interface ElementHint {
  id: number;
  kind: ElementKind;
  /** Short text for context, e.g. the phone number or download file name. Never input values. */
  text?: string;
  /** For links and forms: where they point. */
  href?: string;
}

export const EMPTY_BEHAVIOR: BehaviorSignals = {
  fullscreen: false, keyboardLock: false, pointerLock: false, alertLoop: false, autoplayAudio: false,
  beforeunloadTrap: false, historySpam: false, notificationPrompt: false, walletRequest: false,
};
