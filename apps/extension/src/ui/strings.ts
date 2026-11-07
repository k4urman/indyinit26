/**
 * All user-facing copy for ScamGuard.
 * Plain language, grade 6 reading level, no jargon.
 * Import BRAND from contract — never hardcode the name here.
 */
import { BRAND } from '../shared/contract';
import type { Severity, ReasonKind, GateAction } from '../shared/contract';

export { BRAND };

// ---------------------------------------------------------------------------
// Severity
// ---------------------------------------------------------------------------

export const SEVERITY_LABELS: Record<Severity, string> = {
  safe: 'This page looks safe',
  unknown: 'We have not checked this page yet',
  caution: 'Be careful on this page',
  danger: 'This page looks dangerous',
};

export const SEVERITY_DESCRIPTIONS: Record<Severity, string> = {
  safe: 'We did not find anything worrying. Stay alert and trust your gut.',
  unknown: 'We could not finish checking. Treat it like a new site — be careful.',
  caution: 'Something seems off. Think before you type any personal details.',
  danger: 'This page has signs of a scam. We strongly suggest leaving now.',
};

// ---------------------------------------------------------------------------
// Threat kinds
// ---------------------------------------------------------------------------

export const THREAT_KIND_LABELS: Record<ReasonKind, string> = {
  knownBad: 'Known scam site',
  userBlocklist: 'On your block list',
  impersonation: 'Pretends to be a company',
  lookalikeDomain: 'Copycat website',
  domainTrust: 'Unusual web address',
  pageIntent: 'Asks for money or details',
  pressure: 'Rushing or scaring you',
  hostileBehavior: 'Fake warning or screen lock',
  download: 'Risky download',
  upload: 'Suspicious file upload',
  personalInfo: 'Asking for personal details',
};

// ---------------------------------------------------------------------------
// Gate action headings (shown in the pause-before-action modal)
// ---------------------------------------------------------------------------

export const GATE_HEADINGS: Record<GateAction, string> = {
  password: 'Are you sure this is the right site for your password?',
  card: 'Are you sure this is the right website for your payment?',
  bankDetails: 'Wait — is this really your bank\'s website?',
  crypto: 'Did someone ask you to send money here?',
  giftCard: 'Did someone tell you to pay with gift cards?',
  download: 'Did someone on the phone tell you to install this?',
  upload: 'Are you sure you want to send your file to this site?',
  personalInfo: 'Are you sure this site needs your personal details?',
};

export const GATE_SUBTEXT: Record<GateAction, string> = {
  password: 'Real companies will never ask for your password on a page you weren\'t expecting.',
  card: 'Scammers copy real shops. Check the web address before entering card numbers.',
  bankDetails: 'Banks will not send you to a different website to log in. If in doubt, go directly to your bank.',
  crypto: 'Legitimate businesses do not ask for crypto payments. This is a common scam.',
  giftCard: 'No real business or government asks for gift card payments. This is always a scam.',
  download: 'If someone called you and asked you to install something, hang up and do not install anything.',
  upload: 'Think about what is in the file. Personal documents sent to the wrong site can be used against you.',
  personalInfo: 'Think before sharing your name, address, ID number, or date of birth with an unfamiliar site.',
};

// ---------------------------------------------------------------------------
// Button labels
// ---------------------------------------------------------------------------

export const BTN = {
  takeToSafety: 'Take me to safety',
  continueAnyway: 'Continue anyway',
  trustSite: 'I trust this site',
  blockSite: 'Block this site',
  reportScam: 'Report scam',
  goBack: 'Go back',
  close: 'Close',
  save: 'Save',
  cancel: 'Cancel',
  checkLink: 'Check',
  clearHistory: 'Clear history',
  addDomain: 'Add',
  removeDomain: 'Remove',
  openExtensionsPage: 'Open extensions settings',
  continueCounting: (n: number) => `Continue anyway (${n})`,
} as const;

// ---------------------------------------------------------------------------
// Popup strings
// ---------------------------------------------------------------------------

export const POPUP = {
  title: BRAND,
  checking: 'Checking this page…',
  noPage: 'Open a website to see its safety check.',
  threatsStopped: 'threats stopped',
  checkLinkPlaceholder: 'Paste a link to check it',
  checkLinkLabel: 'Check a link',
  currentPage: 'Current page',
  recentEvents: 'Recent activity',
  noRecentEvents: 'No recent activity on this page.',
  trustSiteAriaLabel: 'Mark this site as trusted',
  blockSiteAriaLabel: 'Add this site to your block list',
  reportScamAriaLabel: 'Report this site as a scam',
  settingsLink: 'Settings',
  onLabel: 'Protection is on',
  offLabel: 'Protection is off',
  toggleAriaLabel: 'Toggle protection on or off',
  reasons: (n: number) => `${n} reason${n === 1 ? '' : 's'} found`,
  safeAlternative: (label: string) => `Your real site is: ${label}`,
  depthBasic: 'Quick check only — full check unavailable',
  listedAllow: 'You have trusted this site',
  listedBlock: 'You have blocked this site',
  linkCheckResult: 'Link check result',
  linkCheckError: 'Could not check that link. Make sure it starts with http:// or https://',
};

// ---------------------------------------------------------------------------
// Settings / options page strings
// ---------------------------------------------------------------------------

export const OPTIONS = {
  pageTitle: `${BRAND} Settings`,
  sectionMaster: 'Master switch',
  masterOnLabel: 'Protection is on',
  masterOffLabel: 'Protection is off',
  masterDescription: `Turn ${BRAND} on or off for all websites.`,

  sectionLevel: 'Protection level',
  levelDescription: 'Choose how careful you want to be. A higher level stops more things but may occasionally ask you to confirm on safe sites.',

  sectionGuards: 'What to protect',
  guardsDescription: 'Choose which types of risky activity you want to be warned about.',

  sectionHistory: 'History',
  historyDescription: 'A record of threats that were stopped or flagged.',
  noHistory: 'No threats recorded yet.',
  retentionLabel: 'Keep history for',
  retentionOptions: [
    { value: 7, label: '7 days' },
    { value: 14, label: '14 days' },
    { value: 30, label: '30 days' },
    { value: 90, label: '90 days' },
  ],
  statsLine: (blocked: number, warned: number) =>
    `${blocked} threat${blocked === 1 ? '' : 's'} stopped, ${warned} warning${warned === 1 ? '' : 's'} shown`,
  clearHistoryConfirm: 'Are you sure you want to delete all your history? This cannot be undone.',
  eventAction: {
    block: 'Blocked',
    warn: 'Warned',
    highlight: 'Marked',
    continued: 'You continued',
    trusted: 'You trusted',
    blocked: 'Blocked',
    paused: 'Paused',
    warned: 'Warned',
    highlighted: 'Highlighted',
    userContinued: 'You continued',
    userTrusted: 'You trusted',
  } as Record<string, string>,

  sectionAllowlist: 'Trusted sites',
  allowlistDescription: 'Sites you have told us to never warn about. Add just the domain name, like "mybank.com".',
  allowlistPlaceholder: 'e.g. mybank.com',
  allowlistEmpty: 'No trusted sites yet.',

  sectionBlocklist: 'Blocked sites',
  blocklistDescription: 'Sites you always want to block, no matter what.',
  blocklistPlaceholder: 'e.g. scamsite.com',
  blocklistEmpty: 'No blocked sites yet.',
  domainError: 'That doesn\'t look like a valid domain. Use just the domain name, like "example.com" — no "https://" or "/" needed.',

  sectionIncognito: 'Private windows',
  incognitoAllowed: `${BRAND} is running in private windows.`,
  incognitoNotAllowed: `${BRAND} is not allowed in private windows. To protect yourself while browsing privately, you need to allow it in your extension settings.`,
  incognitoButton: 'Allow in private windows',

  sectionAds: 'Ad blocking',
  adsDescription: 'Remove or cover ads on pages you visit.',
  adsOff: 'Off',
  adsCover: 'Cover ads (grey box)',
  adsRemove: 'Remove ads',

  saved: 'Saved',
};

// ---------------------------------------------------------------------------
// Blocked page strings
// ---------------------------------------------------------------------------

export const BLOCKED = {
  defaultTitle: 'This page has been blocked',
  subtitle: `${BRAND} stopped you from visiting this page because it looks like a scam.`,
  reasonsHeading: 'Why was this blocked?',
  safeAlternativePrefix: 'Your real',
  safeAlternativeSuffix: 'is at',
  depthBasic: 'Quick check only — full check unavailable offline.',
  mistakeText: 'This site is safe — I was wrong',
  mistakeAriaLabel: 'Report this block as a mistake',
  countdown: (n: number) => `Continue anyway (${n})`,
  continueWarning: 'Continuing is risky. Only do this if you are certain this site is safe.',
};

// ---------------------------------------------------------------------------
// In-page overlay strings (banner, gate, scareware)
// ---------------------------------------------------------------------------

export const INPAGE = {
  blockHeading: 'This website may be a scam',
  bannerClose: 'Close warning',
  bannerAriaLabel: 'Security warning banner',

  gateTitle: (action: GateAction) => GATE_HEADINGS[action],
  gateSubtext: (action: GateAction) => GATE_SUBTEXT[action],
  gateDomain: 'Site:',
  gateBack: 'Go back',
  gateContinue: 'Continue',
  gateTrust: 'I trust this site',
  gateContinueCounting: (n: number) => `Continue (${n})`,
  gateFocusTrapAriaLabel: 'Security check dialog',

  highlightBadgeAriaLabel: 'Warning about this element',
  highlightTooltipPrefix: 'Warning:',

  scarewareTitle: 'This is a fake warning.',
  scarewareSubtitle: 'Your computer is fine.',
  scarewareDetail: 'Microsoft and Apple never show phone numbers in alerts. Do not call any number on this page.',
  scarewareButton: 'Close this tab',
  scarewareAriaLabel: 'Fake warning rescue screen',
};

// ---------------------------------------------------------------------------
// Error strings
// ---------------------------------------------------------------------------

export const ERRORS = {
  generic: 'Something went wrong. Please try again.',
  storageRead: 'Could not read your settings. Try closing and reopening.',
  storageWrite: 'Could not save your settings. Please try again.',
  backgroundUnavailable: 'The protection service is not responding. Try reloading the extension.',
  checkFailed: 'Could not check this page right now.',
  invalidUrl: 'That doesn\'t look like a valid web address.',
};

// ---------------------------------------------------------------------------
// Date formatting helper
// ---------------------------------------------------------------------------

export function formatEventTime(ts: number): string {
  const d = new Date(ts);
  const now = new Date();
  const isToday =
    d.getFullYear() === now.getFullYear() &&
    d.getMonth() === now.getMonth() &&
    d.getDate() === now.getDate();

  const timeStr = d.toLocaleTimeString(undefined, { hour: 'numeric', minute: '2-digit' });

  if (isToday) {
    return `Today at ${timeStr}`;
  }

  const dateStr = d.toLocaleDateString(undefined, { month: 'short', day: 'numeric' });
  return `${dateStr} at ${timeStr}`;
}
