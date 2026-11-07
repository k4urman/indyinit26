/**
 * Mock background for dev/testing.
 * Answers every Request type with realistic fixture data.
 * Import sendMessage from here instead of chrome.runtime.sendMessage when
 * running outside the extension context.
 */
import {
  DEFAULT_SETTINGS,
  type Request,
  type ResponseFor,
  type Verdict,
  type TabStatus,
  type BlockedPage,
  type ThreatEvent,
  type Stats,
  type Settings,
} from '../../shared/contract';

// ---------------------------------------------------------------------------
// Fixture Verdicts
// ---------------------------------------------------------------------------

export const mockChasePhishing: Verdict = {
  url: 'https://chase-secure-login.xyz/account/verify',
  domain: 'chase-secure-login.xyz',
  severity: 'danger',
  reasons: [
    {
      kind: 'lookalikeDomain',
      title: 'This is not Chase\'s website',
      detail: 'The web address "chase-secure-login.xyz" is trying to look like Chase Bank, but it is not. The real Chase website is chase.com.',
    },
    {
      kind: 'phishing',
      title: 'Fake login form',
      detail: 'This page asks for your username and password but it is not a real bank page. Entering your details here would hand them to scammers.',
    },
    {
      kind: 'knownBad',
      title: 'Domain registered just 3 days ago',
      detail: 'This website was created very recently. Legitimate banks have websites that have been around for years.',
    },
  ],
  safeAlternative: { label: 'chase.com', url: 'https://www.chase.com' },
  depth: 'full',
  checkedAt: Date.now() - 2000,
};

export const mockFakeUsps: Verdict = {
  url: 'https://usps-delivery-fee.com/track/pay',
  domain: 'usps-delivery-fee.com',
  severity: 'danger',
  reasons: [
    {
      kind: 'payment',
      title: 'Fake delivery fee request',
      detail: 'This page is pretending to be USPS and asking for a small payment to release a package. USPS never charges delivery fees by text or email.',
    },
    {
      kind: 'phishing',
      title: 'Copycat USPS page',
      detail: 'The page looks like USPS but the web address "usps-delivery-fee.com" is not the real USPS website. The real site is usps.com.',
    },
  ],
  safeAlternative: { label: 'usps.com', url: 'https://www.usps.com' },
  depth: 'full',
  checkedAt: Date.now() - 1500,
};

export const mockScareware: Verdict = {
  url: 'https://windows-alert-critical.net/virus-detected',
  domain: 'windows-alert-critical.net',
  severity: 'danger',
  reasons: [
    {
      kind: 'scareware',
      title: 'Fake virus warning',
      detail: 'This page is showing a fake "your computer is infected" alert to scare you into calling a phone number or installing software. Your computer is fine.',
    },
  ],
  depth: 'full',
  checkedAt: Date.now() - 500,
};

export const mockSafeSite: Verdict = {
  url: 'https://www.google.com/',
  domain: 'google.com',
  severity: 'safe',
  reasons: [],
  depth: 'full',
  checkedAt: Date.now() - 100,
};

export const mockCautionSite: Verdict = {
  url: 'https://deals-unlimited-shop.net/login',
  domain: 'deals-unlimited-shop.net',
  severity: 'caution',
  reasons: [
    {
      kind: 'personalInfo',
      title: 'Password field on an unfamiliar site',
      detail: 'This site is asking for a password but we have not seen it before. Make sure you know and trust this website before logging in.',
    },
  ],
  depth: 'basic',
  checkedAt: Date.now() - 3000,
};

// ---------------------------------------------------------------------------
// Fixture TabStatuses
// ---------------------------------------------------------------------------

export const mockTabStatusDanger: TabStatus = {
  url: mockChasePhishing.url,
  domain: mockChasePhishing.domain,
  verdict: mockChasePhishing,
  listed: null,
  recent: [],
};

export const mockTabStatusSafe: TabStatus = {
  url: mockSafeSite.url,
  domain: mockSafeSite.domain,
  verdict: mockSafeSite,
  listed: null,
  recent: [],
};

export const mockTabStatusChecking: TabStatus = {
  url: 'https://example.com/',
  domain: 'example.com',
  verdict: null,
  listed: null,
  recent: [],
};

// ---------------------------------------------------------------------------
// Mock Settings
// ---------------------------------------------------------------------------

export const mockSettings: Settings = { ...DEFAULT_SETTINGS };

// ---------------------------------------------------------------------------
// Mock Stats
// ---------------------------------------------------------------------------

export const mockStats: Stats = {
  blocked: 47,
  warned: 12,
  since: Date.now() - 30 * 24 * 60 * 60 * 1000,
};

// ---------------------------------------------------------------------------
// Mock ThreatEvents
// ---------------------------------------------------------------------------

export const mockThreatEvents: ThreatEvent[] = [
  {
    id: 'evt-001',
    at: Date.now() - 5 * 60 * 1000,
    url: mockChasePhishing.url,
    domain: mockChasePhishing.domain,
    action: 'blocked',
    guard: 'pageBlocking',
    reasons: mockChasePhishing.reasons,
  },
  {
    id: 'evt-002',
    at: Date.now() - 42 * 60 * 1000,
    url: mockFakeUsps.url,
    domain: mockFakeUsps.domain,
    action: 'blocked',
    guard: 'transaction',
    reasons: mockFakeUsps.reasons,
  },
  {
    id: 'evt-003',
    at: Date.now() - 2 * 60 * 60 * 1000,
    url: mockCautionSite.url,
    domain: mockCautionSite.domain,
    action: 'warned',
    guard: 'personalInfo',
    reasons: mockCautionSite.reasons,
  },
  {
    id: 'evt-004',
    at: Date.now() - 5 * 60 * 60 * 1000,
    url: 'https://free-software-download.net/setup.exe',
    domain: 'free-software-download.net',
    action: 'paused',
    guard: 'download',
    reasons: [
      {
        kind: 'download',
        title: 'Risky download from unknown site',
        detail: 'This file is an installer (.exe) from a site we have not seen before. Only install software from sources you trust.',
      },
    ],
  },
  {
    id: 'evt-005',
    at: Date.now() - 24 * 60 * 60 * 1000,
    url: mockScareware.url,
    domain: mockScareware.domain,
    action: 'blocked',
    guard: 'pageBlocking',
    reasons: mockScareware.reasons,
  },
];

// ---------------------------------------------------------------------------
// Mock BlockedPage
// ---------------------------------------------------------------------------

export const mockBlockedPage: BlockedPage = {
  verdict: mockChasePhishing,
  originalUrl: mockChasePhishing.url,
  canContinue: true,
};

// ---------------------------------------------------------------------------
// In-memory state for mock
// ---------------------------------------------------------------------------

let _settings: Settings = { ...DEFAULT_SETTINGS };
let _events: ThreatEvent[] = [...mockThreatEvents];

// ---------------------------------------------------------------------------
// sendMessage implementation
// ---------------------------------------------------------------------------

export async function sendMessage<R extends Request>(req: R): Promise<ResponseFor<R>> {
  // Simulate a small network delay
  await new Promise((r) => setTimeout(r, 60));

  switch (req.type) {
    case 'getTabStatus': {
      // Return different statuses based on tabId for variety in dev
      const statuses = [mockTabStatusDanger, mockTabStatusSafe, mockTabStatusChecking];
      const status = statuses[req.tabId % statuses.length] ?? mockTabStatusSafe;
      return status as ResponseFor<R>;
    }

    case 'checkUrl': {
      const url = req.url.toLowerCase();
      if (url.includes('chase') || url.includes('phish') || url.includes('scam')) {
        return mockChasePhishing as ResponseFor<R>;
      }
      if (url.includes('usps') || url.includes('delivery')) {
        return mockFakeUsps as ResponseFor<R>;
      }
      if (url.includes('virus') || url.includes('alert') || url.includes('scareware')) {
        return mockScareware as ResponseFor<R>;
      }
      if (url.includes('google') || url.includes('microsoft') || url.includes('apple')) {
        return mockSafeSite as ResponseFor<R>;
      }
      return mockCautionSite as ResponseFor<R>;
    }

    case 'setList': {
      const { domain, list } = req;
      if (list === 'allow') {
        if (!_settings.allowlist.includes(domain)) {
          _settings = { ..._settings, allowlist: [..._settings.allowlist, domain] };
        }
        _settings = { ..._settings, blocklist: _settings.blocklist.filter((d) => d !== domain) };
      } else if (list === 'block') {
        if (!_settings.blocklist.includes(domain)) {
          _settings = { ..._settings, blocklist: [..._settings.blocklist, domain] };
        }
        _settings = { ..._settings, allowlist: _settings.allowlist.filter((d) => d !== domain) };
      } else {
        _settings = {
          ..._settings,
          allowlist: _settings.allowlist.filter((d) => d !== domain),
          blocklist: _settings.blocklist.filter((d) => d !== domain),
        };
      }
      return { ok: true } as ResponseFor<R>;
    }

    case 'reportMistake': {
      _events = _events.filter((e) => e.id !== req.eventId);
      return { ok: true } as ResponseFor<R>;
    }

    case 'reportScam': {
      const domain = new URL(req.url).hostname.replace(/^www\./, '');
      if (!_settings.blocklist.includes(domain)) {
        _settings = { ..._settings, blocklist: [..._settings.blocklist, domain] };
      }
      return { ok: true } as ResponseFor<R>;
    }

    case 'getBlocked': {
      return mockBlockedPage as ResponseFor<R>;
    }

    case 'continueAnyway': {
      return { url: mockBlockedPage.originalUrl } as ResponseFor<R>;
    }

    case 'clearHistory': {
      _events = [];
      return { ok: true } as ResponseFor<R>;
    }

    case 'getIncognitoAccess': {
      return { allowed: false } as ResponseFor<R>;
    }

    default: {
      return { ok: true } as ResponseFor<R>;
    }
  }
}

// ---------------------------------------------------------------------------
// Dev helper: get current mock state
// ---------------------------------------------------------------------------

export function getMockState() {
  return { settings: _settings, events: _events, stats: mockStats };
}
