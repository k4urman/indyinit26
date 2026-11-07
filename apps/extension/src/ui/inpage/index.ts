/**
 * Sentinel in-page UI (implements InPageUI from contract.ts).
 *
 * Look: system-native alert sheets and notifications. Neutral surfaces, one
 * blue for the safe action, solid symbols, follows the OS light/dark setting.
 *
 * Hard rules (docs/FRONTEND_AGENT.md §4): closed Shadow DOM, all CSS inline,
 * re-attach if the page removes us, never let our clicks/keys reach the page,
 * render page-derived text with textContent only, never navigate (return the
 * user's choice; the engine acts).
 */
import type { GateAction, GateChoice, GateOptions, InPageUI, Reason, Toast, Verdict } from '../../shared/contract';
import { BRAND } from '../../shared/contract';
import { INPAGE } from '../strings';

// ---------------------------------------------------------------------------
// Styles
// ---------------------------------------------------------------------------

const CSS = `
:host { all: initial; }
* { box-sizing: border-box; margin: 0; padding: 0; }
.root {
  --surface: #ffffff; --line: #d2d2d7; --soft: #f5f5f7; --text: #1d1d1f; --muted: #6e6e73; --dim: #86868b;
  --blue: #0071e3; --blue-hover: #0077ed; --link: #0066cc; --red: #e30000; --orange: #bf4800; --green: #1d8a3a;
  --scrim: rgba(0,0,0,.42); --shadow: 0 22px 70px rgba(0,0,0,.28), 0 2px 8px rgba(0,0,0,.08);
  font: 400 15px/1.47 -apple-system, BlinkMacSystemFont, "SF Pro Text", "Helvetica Neue", "Segoe UI", Helvetica, Arial, sans-serif;
  letter-spacing: -.01em; color: var(--text); -webkit-font-smoothing: antialiased;
}
@media (prefers-color-scheme: dark) {
  .root { --surface: #1c1c1e; --line: #38383a; --soft: #2c2c2e; --text: #f5f5f7; --muted: #a1a1a6; --dim: #8e8e93;
    --blue: #0a84ff; --blue-hover: #409cff; --link: #2997ff; --red: #ff453a; --orange: #ff9f0a; --green: #30d158;
    --scrim: rgba(0,0,0,.6); --shadow: 0 22px 70px rgba(0,0,0,.6); }
}
button { font: inherit; letter-spacing: inherit; cursor: pointer; border: 0; background: none; color: inherit; }
button:focus-visible { outline: 3px solid rgba(0,113,227,.45); outline-offset: 2px; }

/* ---- Alert sheet ---- */
.scrim { position: fixed; inset: 0; z-index: 2147483647; display: grid; place-items: center; padding: 20px; background: var(--scrim);
  animation: fade .2s ease-out both; pointer-events: auto; }
.card { width: min(480px, 100%); max-height: calc(100vh - 40px); overflow-y: auto; scrollbar-width: none; border-radius: 18px; padding: 32px 32px 24px;
  background: var(--surface); box-shadow: var(--shadow); text-align: center; animation: sheet .3s cubic-bezier(.25,.1,.25,1) both; }
.symbol { width: 56px; height: 56px; margin: 0 auto 16px; color: var(--red); }
.symbol.warn { color: var(--orange); }
h1 { font-size: 24px; line-height: 1.17; font-weight: 600; letter-spacing: -.02em; }
.domain { margin-top: 6px; font-size: 15px; color: var(--muted); word-break: break-all; }
.reasons { list-style: none; margin: 22px 0 24px; text-align: left; border-top: 1px solid var(--line); }
.reason { padding: 13px 0; border-bottom: 1px solid var(--line); }
.reason b { display: block; font-weight: 600; font-size: 15px; }
.reason span { display: block; color: var(--muted); font-size: 14px; margin-top: 2px; }
.actions { display: grid; gap: 6px; justify-items: center; }
.primary { width: 100%; min-height: 48px; border-radius: 980px; font-weight: 500; font-size: 17px; color: #fff; background: var(--blue); transition: background .15s; }
.primary:hover { background: var(--blue-hover); }
.secondary { min-height: 40px; padding: 0 12px; font-size: 15px; color: var(--link); }
.secondary:disabled { color: var(--dim); cursor: default; }
.tertiary { font-size: 13px; color: var(--dim); padding: 4px 8px; }
.tertiary:hover, .secondary:not(:disabled):hover { text-decoration: underline; }
.foot { display: flex; align-items: center; justify-content: center; gap: 6px; margin-top: 18px; color: var(--dim); font-size: 12px; }
.foot svg { color: var(--dim); }

/* ---- Rescue (fake virus warning) ---- */
.rescue { position: fixed; inset: 0; z-index: 2147483647; display: grid; place-items: center; padding: 24px; text-align: center; pointer-events: auto; overflow: auto;
  background: var(--surface); animation: fade .25s ease-out both; }
.rescue .inner { max-width: 600px; animation: appear .5s cubic-bezier(.25,.1,.25,1) both; }
.rescue .symbol { width: 84px; height: 84px; color: var(--green); margin-bottom: 24px; }
.rescue h1 { font-size: 48px; line-height: 1.08; font-weight: 600; letter-spacing: -.03em; }
.rescue p.lead { font-size: 21px; line-height: 1.38; color: var(--muted); margin: 14px auto 32px; max-width: 520px; }
.done { list-style: none; display: grid; width: max-content; max-width: 100%; gap: 12px; margin: 0 auto 36px; text-align: left; }
.done li { display: flex; gap: 10px; align-items: center; font-size: 17px; }
.done svg { flex: none; color: var(--green); }
.rescue .primary { width: auto; padding: 0 32px; }
.rescue .foot { margin-top: 28px; }

/* ---- Banner + notifications (top-right) ---- */
.stack { position: fixed; top: 14px; right: 14px; z-index: 2147483647; display: grid; gap: 8px; width: min(360px, calc(100vw - 28px)); pointer-events: none; }
.pill { pointer-events: auto; display: grid; grid-template-columns: 34px 1fr auto; gap: 12px; align-items: start; padding: 13px 12px 13px 14px; border-radius: 16px;
  background: color-mix(in srgb, var(--surface) 88%, transparent); box-shadow: 0 10px 34px rgba(0,0,0,.18), 0 0 0 .5px rgba(0,0,0,.12);
  backdrop-filter: saturate(180%) blur(20px); -webkit-backdrop-filter: saturate(180%) blur(20px); animation: drop .35s cubic-bezier(.25,.1,.25,1) both; }
.pill.out { animation: lift .2s ease-in both; }
.app { width: 34px; height: 34px; border-radius: 8px; display: grid; place-items: center; background: var(--text); color: var(--surface); }
.app.warn { background: var(--orange); color: #fff; }
.app.safe { background: var(--green); color: #fff; }
.pill b { display: block; font-size: 14px; font-weight: 600; }
.pill span { display: block; font-size: 13.5px; color: var(--muted); margin-top: 1px; }
.count { margin-top: 4px; font-size: 12px; color: var(--dim); }
.x { width: 26px; height: 26px; border-radius: 50%; color: var(--dim); font-size: 17px; line-height: 1; }
.x:hover { background: var(--soft); color: var(--text); }
.why { margin-top: 4px; font-size: 13px; color: var(--link); }
.why:hover { text-decoration: underline; }
.more { margin-top: 6px; display: grid; gap: 4px; }
.more div { font-size: 13px; color: var(--muted); }

/* ---- Highlight ---- */
.hl { position: fixed; z-index: 2147483646; pointer-events: none; border-radius: 8px; box-shadow: 0 0 0 2px var(--red), 0 0 0 5px rgba(227,0,0,.12); }
.tag { position: absolute; left: 0; top: -30px; pointer-events: auto; white-space: nowrap; max-width: 80vw; overflow: hidden; text-overflow: ellipsis;
  font-size: 12.5px; font-weight: 500; color: #fff; padding: 4px 10px; border-radius: 980px; background: var(--red); }

@keyframes fade { from { opacity: 0 } to { opacity: 1 } }
@keyframes sheet { from { opacity: 0; transform: scale(.97) } to { opacity: 1; transform: none } }
@keyframes appear { from { opacity: 0; transform: translateY(8px) } to { opacity: 1; transform: none } }
@keyframes drop { from { opacity: 0; transform: translateY(-8px) } to { opacity: 1; transform: none } }
@keyframes lift { to { opacity: 0; transform: translateY(-8px) } }
@media (prefers-reduced-motion: reduce) { * { animation: none !important; transition: none !important; } }
`;

// ---------------------------------------------------------------------------
// Icons (inline SVG built with DOM calls; no network, no innerHTML)
// ---------------------------------------------------------------------------

const NS = 'http://www.w3.org/2000/svg';
type Shape = [tag: string, attrs: Record<string, string>];

function svg(shapes: Shape[], size = 22, extra: Record<string, string> = {}): SVGSVGElement {
  const s = document.createElementNS(NS, 'svg');
  const attrs = { width: String(size), height: String(size), viewBox: '0 0 24 24', fill: 'none', stroke: 'currentColor',
    'stroke-width': '2', 'stroke-linecap': 'round', 'stroke-linejoin': 'round', 'aria-hidden': 'true', ...extra };
  for (const [k, v] of Object.entries(attrs)) s.setAttribute(k, v);
  for (const [tag, a] of shapes) {
    const n = document.createElementNS(NS, tag);
    for (const [k, v] of Object.entries(a)) n.setAttribute(k, v);
    s.append(n);
  }
  return s;
}

const SHIELD_PATH = 'M12 2 4 5v6.2c0 5 3.4 9.4 8 10.8 4.6-1.4 8-5.8 8-10.8V5z';
const fill = (d: string, size: number) => svg([['path', { d, fill: 'currentColor', stroke: 'none' }]], size);
const I = {
  /** Sentinel mark: solid shield. */
  shield: (size = 18) => fill(SHIELD_PATH, size),
  /** Shield with a cut-out tick (for the rescue screen). */
  shieldCheck: (size = 84) =>
    svg([['path', { d: SHIELD_PATH, fill: 'currentColor', stroke: 'none' }], ['path', { d: 'm8.3 12.2 2.6 2.6 5-5.2', stroke: '#fff', 'stroke-width': '2' }]], size),
  /** exclamationmark.triangle.fill */
  warn: (size = 56) =>
    svg([['path', { d: 'M10.3 3.4a2 2 0 0 1 3.4 0l8.4 14.5a2 2 0 0 1-1.7 3H3.6a2 2 0 0 1-1.7-3z', fill: 'currentColor', stroke: 'none' }], ['path', { d: 'M12 9v4.5M12 17h.01', stroke: '#fff', 'stroke-width': '2.2' }]], size),
  /** xmark.octagon.fill */
  stop: (size = 56) =>
    svg([['path', { d: 'M8.2 2h7.6L22 8.2v7.6L15.8 22H8.2L2 15.8V8.2z', fill: 'currentColor', stroke: 'none' }], ['path', { d: 'm9 9 6 6m0-6-6 6', stroke: '#fff', 'stroke-width': '2.2' }]], size),
  check: (size = 18) => svg([['path', { d: 'm5 12.5 4.5 4.5L19 7.5' }]], size, { 'stroke-width': '2.4' }),
  lock: () => fill('M7 10V8a5 5 0 0 1 10 0v2h1a1 1 0 0 1 1 1v9a1 1 0 0 1-1 1H6a1 1 0 0 1-1-1v-9a1 1 0 0 1 1-1zm2 0h6V8a3 3 0 0 0-6 0z', 12),
};

// ---------------------------------------------------------------------------
// DOM helpers
// ---------------------------------------------------------------------------

function el<K extends keyof HTMLElementTagNameMap>(tag: K, cls?: string, text?: string): HTMLElementTagNameMap[K] {
  const e = document.createElement(tag);
  if (cls) e.className = cls;
  if (text !== undefined) e.textContent = text;
  return e;
}

const HOST_STYLE = 'all: initial; position: fixed; inset: 0; z-index: 2147483647; pointer-events: none;';

/** One closed shadow host for everything Sentinel draws on a page. */
function createHost() {
  const host = document.createElement('sentinel-ui');
  host.setAttribute('style', HOST_STYLE);
  const shadow = host.attachShadow({ mode: 'closed' });
  const style = el('style');
  style.textContent = CSS;
  const root = el('div', 'root');
  shadow.append(style, root);

  // Our UI's clicks and keys must not reach the page (scareware re-enters fullscreen on any click).
  for (const type of ['click', 'mousedown', 'mouseup', 'pointerdown', 'pointerup', 'keydown', 'keyup', 'keypress']) {
    host.addEventListener(type, (e) => e.stopPropagation());
  }

  const mount = () => {
    if (!host.isConnected) (document.body ?? document.documentElement).append(host);
  };
  // Pages that remove or restyle us get us back.
  new MutationObserver(() => {
    if (!root.childElementCount) return;
    if (!host.isConnected) mount();
    if (host.getAttribute('style') !== HOST_STYLE) host.setAttribute('style', HOST_STYLE);
  }).observe(document.documentElement, { childList: true, subtree: true, attributes: true, attributeFilter: ['style', 'class'] });

  return { root, mount };
}

function trapFocus(container: HTMLElement, onEscape: () => void): () => void {
  const handler = (e: KeyboardEvent) => {
    if (e.key === 'Escape') {
      e.preventDefault();
      onEscape();
      return;
    }
    if (e.key !== 'Tab') return;
    const items = [...container.querySelectorAll<HTMLElement>('button:not([disabled])')];
    if (!items.length) return;
    const first = items[0]!;
    const last = items[items.length - 1]!;
    const active = (container.getRootNode() as ShadowRoot).activeElement;
    if (e.shiftKey && active === first) {
      e.preventDefault();
      last.focus();
    } else if (!e.shiftKey && active === last) {
      e.preventDefault();
      first.focus();
    }
  };
  container.addEventListener('keydown', handler);
  return () => container.removeEventListener('keydown', handler);
}

// ---------------------------------------------------------------------------
// Factory
// ---------------------------------------------------------------------------

export function createInPageUI(): InPageUI {
  const { root, mount } = createHost();
  let stack: HTMLElement | null = null;
  // Toasts float above everything, including an open warning card: keep the stack last.
  const getStack = () => {
    stack ??= el('div', 'stack');
    root.append(stack);
    return stack;
  };

  /** The shared warning card for pauses and page blocks. */
  function modal(opts: {
    v: Verdict;
    heading: string;
    tone: 'danger' | 'warn';
    allowContinue: boolean;
    allowTrust: boolean;
  }): Promise<GateChoice> {
    mount();
    return new Promise((resolve) => {
      const { v } = opts;
      const scrim = el('div', 'scrim');
      const card = el('div', 'card');
      card.setAttribute('role', 'alertdialog');
      card.setAttribute('aria-modal', 'true');
      card.setAttribute('aria-label', opts.heading);

      const symbol = opts.tone === 'warn' ? I.warn() : I.stop();
      symbol.classList.add('symbol');
      if (opts.tone === 'warn') symbol.classList.add('warn');
      const title = el('h1', '', opts.heading);
      const domain = v.domain ? el('div', 'domain', v.domain) : null;

      const list = el('ul', 'reasons');
      v.reasons.slice(0, 3).forEach((r: Reason) => {
        const li = el('li', 'reason');
        li.append(el('b', '', r.title), el('span', '', r.detail));
        list.append(li);
      });

      const actions = el('div', 'actions');
      const back = el('button', 'primary', v.safeAlternative ? `Go to ${v.safeAlternative.url.replace(/^https?:\/\/|\/$/g, '')}` : 'Go back to safety');
      actions.append(back);
      let timer: ReturnType<typeof setInterval> | undefined;
      let cont: HTMLButtonElement | null = null;
      if (opts.allowContinue) {
        const c = el('button', 'secondary', 'Continue anyway (3)');
        c.disabled = true;
        let n = 3;
        timer = setInterval(() => {
          n--;
          c.textContent = n > 0 ? `Continue anyway (${n})` : 'Continue anyway';
          if (n <= 0) {
            c.disabled = false;
            clearInterval(timer);
          }
        }, 1000);
        actions.append(c);
        cont = c;
      }
      const trust = opts.allowTrust && opts.allowContinue ? el('button', 'tertiary', 'I trust this website') : null;
      if (trust) actions.append(trust);

      const foot = el('div', 'foot');
      foot.append(I.shield(12), el('span', '', `${BRAND} · Checked on this device`));

      card.append(symbol, title, ...(domain ? [domain] : []), list, actions, foot);
      scrim.append(card);
      root.append(scrim);
      if (stack) root.append(stack); // toasts stay above the card
      setTimeout(() => back.focus(), 60);

      const untrap = trapFocus(card, () => done('back'));
      function done(c: GateChoice) {
        clearInterval(timer);
        untrap();
        scrim.remove();
        resolve(c);
      }
      back.addEventListener('click', () => done('back'));
      cont?.addEventListener('click', () => {
        if (!cont!.disabled) done('continue');
      });
      trust?.addEventListener('click', () => done('trust'));
    });
  }

  function pill(kind: 'warn' | 'safe' | 'info', role: 'status' | 'alert') {
    mount();
    const p = el('div', 'pill');
    p.setAttribute('role', role);
    const dot = el('div', `app ${kind}`);
    dot.append(kind === 'safe' ? I.check(18) : kind === 'warn' ? I.warn(18) : I.shield(18));
    const body = el('div');
    const x = el('button', 'x', '×');
    x.setAttribute('aria-label', INPAGE.bannerClose);
    p.append(dot, body, x);
    let gone = false;
    const close = () => {
      if (gone) return;
      gone = true;
      p.classList.add('out');
      setTimeout(() => p.remove(), 260);
    };
    x.addEventListener('click', close);
    return { p, body, close };
  }

  return {
    showBanner(v) {
      const { p, body, close } = pill('warn', 'alert');
      body.append(el('b', '', 'Be careful on this website'), el('span', '', v.reasons[0]?.title ?? 'Some things here look risky.'));
      if (v.reasons.length) {
        const why = el('button', 'why', 'Why?');
        const more = el('div', 'more');
        why.addEventListener('click', () => {
          if (more.childElementCount) return void more.replaceChildren();
          for (const r of v.reasons) more.append(el('div', '', `• ${r.detail}`));
        });
        body.append(why, more);
      }
      getStack().prepend(p);
      return { close };
    },

    gate(v, action: GateAction, o: GateOptions = {}) {
      const allowContinue = o.allowContinue !== false;
      return modal({ v, heading: INPAGE.gateTitle(action), tone: 'warn', allowContinue, allowTrust: true });
    },

    async blockOverlay(v, o: GateOptions = {}) {
      const c = await modal({ v, heading: INPAGE.blockHeading, tone: 'danger', allowContinue: o.allowContinue !== false, allowTrust: false });
      return c === 'back' ? 'back' : 'continue';
    },

    highlight(target, reason) {
      mount();
      const box = el('div', 'hl');
      const tag = el('div', 'tag', reason.title);
      tag.title = reason.detail;
      box.append(tag);
      root.append(box);
      const place = () => {
        const r = target.getBoundingClientRect();
        box.style.top = `${r.top - 6}px`;
        box.style.left = `${r.left - 6}px`;
        box.style.width = `${r.width + 12}px`;
        box.style.height = `${r.height + 12}px`;
        box.style.display = r.width && r.height ? 'block' : 'none';
      };
      place();
      const timer = setInterval(place, 200);
      return { remove: () => (clearInterval(timer), box.remove()) };
    },

    scarewareRescue() {
      mount();
      return new Promise<void>((resolve) => {
        const wrap = el('div', 'rescue');
        wrap.setAttribute('role', 'alertdialog');
        wrap.setAttribute('aria-label', INPAGE.scarewareAriaLabel);
        const inner = el('div', 'inner');
        const halo = I.shieldCheck();
        halo.classList.add('symbol');
        const h1 = el('h1');
        h1.append(document.createTextNode('That warning was fake.'), el('br'), document.createTextNode('Your computer is fine.'));
        const lead = el('p', 'lead', 'Microsoft and Apple never put phone numbers in warnings. There’s no need to call anyone.');
        const done = el('ul', 'done');
        ['Sound turned off', 'Full screen closed', 'Nothing was installed'].forEach((t) => {
          const li = el('li');
          li.append(I.check(), el('span', '', t));
          done.append(li);
        });
        const btn = el('button', 'primary', 'Close this page');
        const foot = el('div', 'foot');
        foot.append(I.shield(12), el('span', '', BRAND));
        inner.append(halo, h1, lead, done, btn, foot);
        wrap.append(inner);
        root.append(wrap);
        setTimeout(() => btn.focus(), 80);
        btn.addEventListener('click', () => {
          wrap.remove();
          resolve();
        });
      });
    },

    toast(t: Toast) {
      const ms = 6500;
      const { p, body, close } = pill(t.tone, 'status');
      body.append(el('b', '', t.title));
      if (t.detail) body.append(el('span', '', t.detail));
      if (t.stopped) body.append(el('div', 'count', `${t.stopped.toLocaleString()} ${t.stopped === 1 ? 'scam' : 'scams'} stopped so far`));
      getStack().append(p);
      // Stays while the pointer is on it, like a system notification.
      let timer = setTimeout(close, ms);
      p.addEventListener('mouseenter', () => clearTimeout(timer));
      p.addEventListener('mouseleave', () => (timer = setTimeout(close, 2500)));
    },
  };
}
