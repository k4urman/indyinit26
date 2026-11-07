/**
 * In-page UI for ScamGuard.
 * Renders into a closed Shadow DOM so the host page cannot interfere.
 * No React — vanilla DOM/TypeScript to keep content scripts lean.
 */

import type { InPageUI, GateAction, GateChoice, GateOptions, Verdict, Reason } from '../../shared/contract';
import { INPAGE, BTN } from '../strings';

// ---------------------------------------------------------------------------
// Palette
// ---------------------------------------------------------------------------

const COLORS = {
  safe: '#16a34a',
  caution: '#d97706',
  danger: '#dc2626',
  primary: '#2563eb',
  text: '#111827',
  muted: '#6b7280',
  bg: '#ffffff',
  overlay: 'rgba(0,0,0,0.6)',
};

function severityBg(s: Verdict['severity']): string {
  if (s === 'danger') return COLORS.danger;
  if (s === 'caution') return COLORS.caution;
  return COLORS.muted;
}

// ---------------------------------------------------------------------------
// Shadow DOM host factory
// ---------------------------------------------------------------------------

interface HostResult {
  host: HTMLElement;
  root: ShadowRoot;
}

function createHost(extraStyle: string): HostResult {
  const host = document.createElement('div');
  host.style.cssText =
    'all:initial;position:fixed;z-index:2147483647;pointer-events:none;top:0;left:0;width:0;height:0';
  const root = host.attachShadow({ mode: 'closed' });
  for (const type of ['click', 'mousedown', 'mouseup', 'pointerdown', 'pointerup', 'keydown', 'keyup', 'keypress']) {
    host.addEventListener(type, (e) => e.stopPropagation());
  }
  const s = document.createElement('style');
  s.textContent =
    `* { box-sizing: border-box; font-family: system-ui, sans-serif; } ` + extraStyle;
  root.appendChild(s);
  return { host, root };
}

// ---------------------------------------------------------------------------
// Re-attach observer (page cannot remove our overlay)
// ---------------------------------------------------------------------------

function watchAndReattach(host: HTMLElement): () => void {
  const obs = new MutationObserver(() => {
    if (host.isConnected) return;
    document.body.appendChild(host);
  });
  obs.observe(document.body, { childList: true });
  return () => obs.disconnect();
}

// ---------------------------------------------------------------------------
// Gate action headings lookup
// ---------------------------------------------------------------------------

const GATE_HEADINGS: Record<GateAction, string> = {
  password: 'Are you sure this is the right site for your password?',
  card: 'Are you sure this is the right website for your payment?',
  bankDetails: "Wait — is this really your bank's website?",
  crypto: 'Did someone ask you to send money here?',
  giftCard: 'Did someone tell you to pay with gift cards?',
  download: 'Did someone on the phone tell you to install this?',
  upload: 'Are you sure you want to send your file to this site?',
  personalInfo: 'Are you sure this site needs your personal details?',
};

// ---------------------------------------------------------------------------
// Focus trap helper
// ---------------------------------------------------------------------------

function getFocusable(root: Element): HTMLElement[] {
  return Array.from(
    root.querySelectorAll<HTMLElement>(
      'a[href],button:not([disabled]),input:not([disabled]),select:not([disabled]),textarea:not([disabled]),[tabindex]:not([tabindex="-1"])'
    )
  );
}

function trapFocus(container: Element, escCallback: () => void): () => void {
  function handler(e: KeyboardEvent) {
    if (e.key === 'Escape') {
      e.preventDefault();
      escCallback();
      return;
    }
    if (e.key !== 'Tab') return;
    const focusable = getFocusable(container);
    if (!focusable.length) { e.preventDefault(); return; }
    const first = focusable[0]!;
    const last = focusable[focusable.length - 1]!;
    if (e.shiftKey) {
      if (document.activeElement === first) {
        e.preventDefault();
        last.focus();
      }
    } else {
      if (document.activeElement === last) {
        e.preventDefault();
        first.focus();
      }
    }
  }
  document.addEventListener('keydown', handler, true);
  return () => document.removeEventListener('keydown', handler, true);
}

// ---------------------------------------------------------------------------
// Reduced-motion check
// ---------------------------------------------------------------------------

function prefersReducedMotion(): boolean {
  return window.matchMedia('(prefers-reduced-motion: reduce)').matches;
}

// ---------------------------------------------------------------------------
// 1. showBanner
// ---------------------------------------------------------------------------

function showBanner(v: Verdict): { close(): void } {
  const bg = v.severity === 'danger' ? COLORS.danger : COLORS.caution;
  const { host, root } = createHost(`
    @keyframes slideDown {
      from { transform: translateY(-100%); opacity: 0; }
      to   { transform: translateY(0);    opacity: 1; }
    }
    .banner {
      position: fixed;
      top: 0; left: 0; right: 0;
      height: 60px;
      background: ${bg};
      color: #fff;
      display: flex;
      align-items: center;
      padding: 0 16px;
      gap: 10px;
      z-index: 2147483647;
      pointer-events: all;
      font-size: 16px;
      animation: ${prefersReducedMotion() ? 'none' : 'slideDown 0.25s ease'};
      box-shadow: 0 2px 8px rgba(0,0,0,0.2);
    }
    .icon { font-size: 20px; flex-shrink: 0; }
    .msg  { flex: 1; min-width: 0; font-weight: 600; white-space: nowrap; overflow: hidden; text-overflow: ellipsis; }
    .close-btn {
      background: rgba(255,255,255,0.2);
      border: none;
      color: #fff;
      border-radius: 50%;
      width: 32px;
      height: 32px;
      font-size: 20px;
      line-height: 1;
      cursor: pointer;
      display: flex;
      align-items: center;
      justify-content: center;
      flex-shrink: 0;
      pointer-events: all;
    }
    .close-btn:hover { background: rgba(255,255,255,0.3); }
    .close-btn:focus { outline: 2px solid #fff; outline-offset: 2px; }
  `);

  const banner = document.createElement('div');
  banner.className = 'banner';
  banner.setAttribute('role', 'alert');
  banner.setAttribute('aria-label', INPAGE.bannerAriaLabel);

  const icon = document.createElement('span');
  icon.className = 'icon';
  icon.textContent = '⚠';

  const msg = document.createElement('span');
  msg.className = 'msg';
  msg.textContent = v.reasons[0]?.title ?? (v.severity === 'danger' ? 'Dangerous page' : 'Be careful on this page');

  const closeBtn = document.createElement('button');
  closeBtn.className = 'close-btn';
  closeBtn.textContent = '×';
  closeBtn.setAttribute('aria-label', INPAGE.bannerClose);

  banner.appendChild(icon);
  banner.appendChild(msg);
  banner.appendChild(closeBtn);
  root.appendChild(banner);

  host.style.cssText = 'all:initial;position:fixed;z-index:2147483647;top:0;left:0;width:100%;height:60px;pointer-events:none';
  document.body.appendChild(host);

  const stopWatch = watchAndReattach(host);

  function close() {
    stopWatch();
    host.remove();
  }

  closeBtn.addEventListener('click', close);

  return { close };
}

// ---------------------------------------------------------------------------
// 2. gate
// ---------------------------------------------------------------------------

function gate(v: Verdict, action: GateAction, opts: GateOptions & { heading?: string; allowTrust?: boolean } = {}): Promise<GateChoice> {
  return new Promise<GateChoice>((resolve) => {
    const { host, root } = createHost(`
      .overlay {
        position: fixed;
        inset: 0;
        background: rgba(0,0,0,0.6);
        display: flex;
        align-items: center;
        justify-content: center;
        z-index: 2147483647;
        pointer-events: all;
        padding: 16px;
      }
      .card {
        background: #fff;
        border-radius: 20px;
        padding: 36px 32px;
        max-width: 480px;
        width: 100%;
        box-shadow: 0 20px 60px rgba(0,0,0,0.3);
        outline: none;
      }
      .domain-pill {
        display: inline-block;
        background: #fef2f2;
        color: ${COLORS.danger};
        font-family: monospace;
        font-size: 14px;
        padding: 4px 12px;
        border-radius: 20px;
        margin-bottom: 16px;
        word-break: break-all;
      }
      .heading {
        font-size: 20px;
        font-weight: 700;
        color: ${COLORS.text};
        margin: 0 0 10px;
        line-height: 1.3;
      }
      .detail {
        font-size: 15px;
        color: ${COLORS.muted};
        margin: 0 0 24px;
        line-height: 1.6;
      }
      .btn-back {
        display: block;
        width: 100%;
        height: 56px;
        background: ${COLORS.primary};
        color: #fff;
        border: none;
        border-radius: 12px;
        font-size: 18px;
        font-weight: 700;
        cursor: pointer;
        margin-bottom: 10px;
        pointer-events: all;
      }
      .btn-back:hover { opacity: 0.9; }
      .btn-back:focus { outline: 3px solid #93c5fd; outline-offset: 2px; }
      .btn-continue {
        display: block;
        width: 100%;
        height: 48px;
        background: #fff;
        color: ${COLORS.muted};
        border: 1px solid #d1d5db;
        border-radius: 12px;
        font-size: 15px;
        cursor: pointer;
        margin-bottom: 12px;
        pointer-events: all;
        transition: color 0.2s;
      }
      .btn-continue:not([disabled]):hover { color: ${COLORS.text}; }
      .btn-continue:disabled { cursor: not-allowed; opacity: 0.5; }
      .btn-continue:focus { outline: 3px solid #93c5fd; outline-offset: 2px; }
      .btn-trust {
        display: block;
        width: 100%;
        background: none;
        border: none;
        color: ${COLORS.muted};
        text-decoration: underline;
        cursor: pointer;
        font-size: 14px;
        padding: 4px 0;
        pointer-events: all;
      }
      .btn-trust:hover { color: ${COLORS.text}; }
      .btn-trust:focus { outline: 2px solid ${COLORS.primary}; border-radius: 4px; }
    `);

    host.style.cssText =
      'all:initial;position:fixed;z-index:2147483647;top:0;left:0;width:100%;height:100%;pointer-events:none';

    const overlay = document.createElement('div');
    overlay.className = 'overlay';
    overlay.setAttribute('role', 'dialog');
    overlay.setAttribute('aria-modal', 'true');
    overlay.setAttribute('aria-label', INPAGE.gateFocusTrapAriaLabel);

    const card = document.createElement('div');
    card.className = 'card';
    card.tabIndex = -1;

    const domainPill = document.createElement('div');
    domainPill.className = 'domain-pill';
    domainPill.textContent = `${INPAGE.gateDomain} ${v.domain}`;

    const heading = document.createElement('h2');
    heading.className = 'heading';
    heading.textContent = opts.heading ?? GATE_HEADINGS[action];

    const detail = document.createElement('p');
    detail.className = 'detail';
    detail.textContent = v.reasons[0]?.detail ?? '';

    const btnBack = document.createElement('button');
    btnBack.className = 'btn-back';
    btnBack.textContent = INPAGE.gateBack;

    const btnContinue = document.createElement('button');
    btnContinue.className = 'btn-continue';
    btnContinue.disabled = true;

    const btnTrust = document.createElement('button');
    btnTrust.className = 'btn-trust';
    btnTrust.textContent = INPAGE.gateTrust;

    card.appendChild(domainPill);
    card.appendChild(heading);
    card.appendChild(detail);
    card.appendChild(btnBack);
    if (opts.allowContinue !== false) card.appendChild(btnContinue);
    if (opts.allowTrust !== false && opts.allowContinue !== false) card.appendChild(btnTrust);
    overlay.appendChild(card);
    root.appendChild(overlay);

    document.body.appendChild(host);

    // Countdown
    let countdown = 3;
    btnContinue.textContent = INPAGE.gateContinueCounting(countdown);

    const timer = setInterval(() => {
      countdown -= 1;
      if (countdown <= 0) {
        clearInterval(timer);
        btnContinue.disabled = false;
        btnContinue.textContent = INPAGE.gateContinue;
      } else {
        btnContinue.textContent = INPAGE.gateContinueCounting(countdown);
      }
    }, 1000);

    // Focus first button
    setTimeout(() => btnBack.focus(), 50);

    const stopTrap = trapFocus(card, () => finish('back'));

    function finish(choice: GateChoice) {
      clearInterval(timer);
      stopTrap();
      host.remove();
      resolve(choice);
    }

    btnBack.addEventListener('click', () => finish('back'));
    btnContinue.addEventListener('click', () => { if (!btnContinue.disabled) finish('continue'); });
    btnTrust.addEventListener('click', () => finish('trust'));

    // Click outside card → go back
    overlay.addEventListener('click', (e) => {
      if (e.target === overlay) finish('back');
    });
  });
}

// ---------------------------------------------------------------------------
// 3. highlight
// ---------------------------------------------------------------------------

function highlight(el: Element, reason: Reason): { remove(): void } {
  const { host, root } = createHost(`
    .ring {
      position: fixed;
      border: 2px dashed ${COLORS.caution};
      border-radius: 4px;
      pointer-events: none;
      z-index: 2147483646;
    }
    .badge {
      position: absolute;
      top: -10px;
      right: -10px;
      width: 20px;
      height: 20px;
      background: ${COLORS.caution};
      color: #fff;
      border-radius: 50%;
      display: flex;
      align-items: center;
      justify-content: center;
      font-size: 13px;
      font-weight: 700;
      cursor: pointer;
      pointer-events: all;
    }
    .tooltip {
      position: absolute;
      top: -50px;
      left: 50%;
      transform: translateX(-50%);
      background: #1f2937;
      color: #fff;
      padding: 6px 12px;
      border-radius: 8px;
      font-size: 13px;
      white-space: nowrap;
      pointer-events: none;
      display: none;
    }
    .badge:hover + .tooltip,
    .badge:focus + .tooltip { display: block; }
  `);

  function position() {
    const rect = el.getBoundingClientRect();
    ring.style.top = `${rect.top}px`;
    ring.style.left = `${rect.left}px`;
    ring.style.width = `${rect.width}px`;
    ring.style.height = `${rect.height}px`;
  }

  const ring = document.createElement('div');
  ring.className = 'ring';

  const badge = document.createElement('div');
  badge.className = 'badge';
  badge.textContent = '!';
  badge.setAttribute('tabindex', '0');
  badge.setAttribute('aria-label', INPAGE.highlightBadgeAriaLabel);
  badge.setAttribute('role', 'button');

  const tooltip = document.createElement('div');
  tooltip.className = 'tooltip';
  tooltip.textContent = `${INPAGE.highlightTooltipPrefix} ${reason.title}`;

  ring.appendChild(badge);
  ring.appendChild(tooltip);
  root.appendChild(ring);

  host.style.cssText = 'all:initial;position:fixed;z-index:2147483646;top:0;left:0;pointer-events:none';
  document.body.appendChild(host);

  position();

  // Reposition on scroll/resize
  const reposition = () => position();
  window.addEventListener('scroll', reposition, { passive: true });
  window.addEventListener('resize', reposition, { passive: true });

  return {
    remove() {
      window.removeEventListener('scroll', reposition);
      window.removeEventListener('resize', reposition);
      host.remove();
    },
  };
}

// ---------------------------------------------------------------------------
// 4. scarewareRescue
// ---------------------------------------------------------------------------

function scarewareRescue(_v: Verdict): Promise<void> {
  return new Promise<void>((resolve) => {
  const { host, root } = createHost(`
    .cover {
      position: fixed;
      inset: 0;
      background: #fff;
      z-index: 2147483647;
      pointer-events: all;
      display: flex;
      flex-direction: column;
      align-items: center;
      justify-content: center;
      padding: 32px;
      text-align: center;
    }
    .icon { font-size: 72px; margin-bottom: 24px; }
    .title {
      font-size: 32px;
      font-weight: 700;
      color: ${COLORS.safe};
      margin: 0 0 8px;
      line-height: 1.2;
    }
    .subtitle {
      font-size: 26px;
      font-weight: 700;
      color: ${COLORS.text};
      margin: 0 0 20px;
    }
    .detail {
      font-size: 18px;
      color: ${COLORS.muted};
      max-width: 500px;
      line-height: 1.6;
      margin: 0 0 36px;
    }
    .btn {
      height: 60px;
      padding: 0 48px;
      background: ${COLORS.primary};
      color: #fff;
      border: none;
      border-radius: 14px;
      font-size: 20px;
      font-weight: 700;
      cursor: pointer;
      pointer-events: all;
    }
    .btn:hover { opacity: 0.9; }
    .btn:focus { outline: 3px solid #93c5fd; outline-offset: 2px; }
  `);

  const cover = document.createElement('div');
  cover.className = 'cover';
  cover.setAttribute('role', 'alertdialog');
  cover.setAttribute('aria-label', INPAGE.scarewareAriaLabel);

  const iconEl = document.createElement('div');
  iconEl.className = 'icon';
  iconEl.textContent = '✓';

  const title = document.createElement('h1');
  title.className = 'title';
  title.textContent = INPAGE.scarewareTitle;

  const subtitle = document.createElement('p');
  subtitle.className = 'subtitle';
  subtitle.textContent = INPAGE.scarewareSubtitle;

  const detail = document.createElement('p');
  detail.className = 'detail';
  detail.textContent = INPAGE.scarewareDetail;

  const btn = document.createElement('button');
  btn.className = 'btn';
  btn.textContent = INPAGE.scarewareButton;

  cover.appendChild(iconEl);
  cover.appendChild(title);
  cover.appendChild(subtitle);
  cover.appendChild(detail);
  cover.appendChild(btn);
  root.appendChild(cover);

  host.style.cssText =
    'all:initial;position:fixed;z-index:2147483647;top:0;left:0;width:100%;height:100%;pointer-events:all';
  document.body.appendChild(host);

  watchAndReattach(host);

  // Only way out: to safety. The engine does the navigation once we resolve.
  btn.addEventListener('click', () => {
    host.remove();
    resolve();
  });

  setTimeout(() => btn.focus(), 50);
  });
}

// ---------------------------------------------------------------------------
// 5. blockOverlay: page judged dangerous after it loaded
// ---------------------------------------------------------------------------

async function blockOverlay(v: Verdict, opts: GateOptions = {}): Promise<'back' | 'continue'> {
  const choice = await gate(v, 'personalInfo', { ...opts, heading: INPAGE.blockHeading, allowTrust: false });
  return choice === 'back' ? 'back' : 'continue';
}

// ---------------------------------------------------------------------------
// Export factory
// ---------------------------------------------------------------------------

export function createInPageUI(): InPageUI {
  return { showBanner, gate: (v, a, o) => gate(v, a, o), highlight, scarewareRescue, blockOverlay };
}
