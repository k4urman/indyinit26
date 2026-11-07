/**
 * Sentinel in-page UI (implements InPageUI from contract.ts).
 *
 * Look: dark frosted glass, one accent gradient, calm motion. Friendly toasts
 * for good news, a single obvious safe action on every warning.
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
  --glass: rgba(15, 20, 38, 0.82); --line: rgba(255,255,255,0.10); --line2: rgba(255,255,255,0.16);
  --text: #f5f7ff; --muted: #a8b0c8; --dim: #8a93ad;
  --accent1: #7c5cff; --accent2: #22d3ee; --danger: #ff5d6c; --warn: #ffb547; --safe: #3ee089;
  font: 400 17px/1.5 ui-sans-serif, -apple-system, "Segoe UI Variable", "Segoe UI", system-ui, Roboto, "Helvetica Neue", Arial, sans-serif;
  color: var(--text); -webkit-font-smoothing: antialiased;
}
button { font: inherit; cursor: pointer; border: 0; background: none; color: inherit; }
button:focus-visible { outline: 3px solid var(--accent2); outline-offset: 3px; }

/* ---- Modal ---- */
.scrim { position: fixed; inset: 0; z-index: 2147483647; display: grid; place-items: center; padding: 16px;
  background: radial-gradient(1200px 600px at 50% 0%, rgba(124,92,255,.18), transparent 60%), rgba(5, 8, 20, .62);
  backdrop-filter: blur(6px) saturate(120%); -webkit-backdrop-filter: blur(6px) saturate(120%);
  animation: fade .22s ease-out both; pointer-events: auto; }
.card { position: relative; width: min(520px, 100%); max-height: calc(100vh - 32px); overflow-x: hidden; overflow-y: auto; scrollbar-width: none; border-radius: 24px; padding: 24px 24px 18px;
  background: var(--glass); border: 1px solid var(--line);
  box-shadow: 0 30px 80px rgba(0,0,0,.55), 0 1px 0 rgba(255,255,255,.08) inset;
  backdrop-filter: blur(22px) saturate(160%); -webkit-backdrop-filter: blur(22px) saturate(160%);
  animation: pop .38s cubic-bezier(.2,.9,.25,1.15) both; }
.card::before { content: ""; position: absolute; inset: -1px; border-radius: 24px; padding: 1px; pointer-events: none;
  background: linear-gradient(135deg, rgba(124,92,255,.7), rgba(34,211,238,.25) 40%, transparent 70%);
  -webkit-mask: linear-gradient(#000 0 0) content-box, linear-gradient(#000 0 0); -webkit-mask-composite: xor; mask-composite: exclude; }
.top { display: flex; align-items: center; justify-content: space-between; margin-bottom: 14px; }
.brand { display: inline-flex; align-items: center; gap: 8px; font-weight: 650; font-size: 14px; letter-spacing: .2px; color: var(--muted); }
.chip { font-size: 12.5px; font-weight: 650; letter-spacing: .3px; text-transform: uppercase; padding: 5px 10px; border-radius: 999px; }
.chip.danger { color: #ffd6da; background: rgba(255,93,108,.16); border: 1px solid rgba(255,93,108,.35); }
.chip.warn { color: #ffe6bf; background: rgba(255,181,71,.14); border: 1px solid rgba(255,181,71,.35); }
.hero { display: flex; gap: 16px; align-items: flex-start; }
.badge { flex: none; width: 52px; height: 52px; border-radius: 16px; display: grid; place-items: center; color: var(--danger);
  background: linear-gradient(135deg, rgba(255,93,108,.22), rgba(255,93,108,.06)); border: 1px solid rgba(255,93,108,.35);
  animation: pulse 2.4s ease-in-out infinite; }
.badge.warn { color: var(--warn); background: linear-gradient(135deg, rgba(255,181,71,.22), rgba(255,181,71,.05)); border-color: rgba(255,181,71,.35); animation: none; box-shadow: 0 0 40px rgba(255,181,71,.2); }
h1 { font-size: 22px; line-height: 1.25; font-weight: 720; letter-spacing: -.3px; }
.domain { display: inline-block; margin-top: 8px; font: 500 14px/1.4 ui-monospace, "SF Mono", Menlo, Consolas, monospace;
  color: #ffc2c8; background: rgba(255,93,108,.10); border: 1px solid rgba(255,93,108,.22); padding: 3px 9px; border-radius: 8px; word-break: break-all; }
.reasons { list-style: none; margin: 16px 0 18px; display: grid; gap: 8px; }
.reason { display: grid; grid-template-columns: 20px 1fr; gap: 10px; padding: 10px 12px; border-radius: 14px;
  background: rgba(255,255,255,.035); border: 1px solid var(--line); animation: rise .45s cubic-bezier(.2,.9,.25,1) both; }
.reason b { display: block; font-weight: 650; font-size: 16px; }
.reason span { display: block; color: var(--muted); font-size: 14.5px; margin-top: 1px; line-height: 1.45; }
.ri { width: 20px; height: 20px; margin-top: 1px; color: var(--danger); }
.actions { display: grid; gap: 10px; }
.primary { min-height: 54px; border-radius: 14px; font-weight: 700; font-size: 18px; color: #fff; padding: 0 20px;
  background: linear-gradient(135deg, var(--accent1), #4f7cff 55%, var(--accent2));
  box-shadow: 0 10px 30px rgba(92,110,255,.45), 0 1px 0 rgba(255,255,255,.25) inset; transition: transform .15s, box-shadow .15s; }
.primary:hover { transform: translateY(-1px); box-shadow: 0 14px 36px rgba(92,110,255,.55), 0 1px 0 rgba(255,255,255,.25) inset; }
.secondary { min-height: 48px; border-radius: 14px; font-weight: 600; color: var(--muted); border: 1px solid var(--line2); background: rgba(255,255,255,.03); }
.secondary:disabled { opacity: .45; cursor: default; }
.secondary:not(:disabled):hover { color: var(--text); background: rgba(255,255,255,.06); }
.tertiary { justify-self: center; font-size: 14.5px; color: var(--dim); text-decoration: underline; text-underline-offset: 3px; padding: 6px; }
.foot { display: flex; align-items: center; justify-content: center; gap: 7px; margin-top: 14px; padding-top: 12px; border-top: 1px solid var(--line);
  color: var(--dim); font-size: 13px; }

/* ---- Rescue (fake virus warning) ---- */
.rescue { position: fixed; inset: 0; z-index: 2147483647; display: grid; place-items: center; padding: 24px; text-align: center; pointer-events: auto; overflow: auto;
  background: radial-gradient(900px 500px at 50% 20%, rgba(62,224,137,.18), transparent 60%), radial-gradient(800px 600px at 80% 100%, rgba(124,92,255,.22), transparent 60%), #070b18;
  animation: fade .3s ease-out both; }
.rescue .inner { max-width: 560px; animation: pop .5s cubic-bezier(.2,.9,.25,1.1) both; }
.halo { width: 116px; height: 116px; margin: 0 auto 26px; border-radius: 34px; display: grid; place-items: center;
  background: linear-gradient(135deg, rgba(62,224,137,.25), rgba(34,211,238,.10)); border: 1px solid rgba(62,224,137,.4);
  box-shadow: 0 0 80px rgba(62,224,137,.35); animation: breathe 3.2s ease-in-out infinite; }
.rescue h1 { font-size: 38px; letter-spacing: -.6px; }
.rescue h1 em { font-style: normal; background: linear-gradient(90deg, var(--safe), var(--accent2)); -webkit-background-clip: text; background-clip: text; color: transparent; }
.rescue p.lead { font-size: 21px; color: var(--muted); margin: 12px 0 26px; }
.done { list-style: none; display: grid; gap: 10px; margin: 0 auto 30px; max-width: 440px; text-align: left; }
.done li { display: flex; gap: 12px; align-items: center; padding: 12px 16px; border-radius: 14px; background: rgba(255,255,255,.04); border: 1px solid var(--line);
  animation: rise .5s cubic-bezier(.2,.9,.25,1) both; }
.done svg { flex: none; color: var(--safe); }
.rescue .primary { padding: 0 40px; }
.rescue .foot { border-top: 0; }

/* ---- Floating banner + toasts (top-right stack) ---- */
.stack { position: fixed; top: 16px; right: 16px; z-index: 2147483647; display: grid; gap: 10px; width: min(380px, calc(100vw - 32px)); pointer-events: none; }
.pill { pointer-events: auto; display: grid; grid-template-columns: auto 1fr auto; gap: 12px; align-items: start; padding: 14px 14px 14px 16px; border-radius: 18px;
  background: var(--glass); border: 1px solid var(--line); box-shadow: 0 18px 50px rgba(0,0,0,.45);
  backdrop-filter: blur(20px) saturate(160%); -webkit-backdrop-filter: blur(20px) saturate(160%);
  animation: slide .45s cubic-bezier(.2,.9,.25,1.15) both; }
.pill.out { animation: slideout .25s ease-in both; }
.dot { width: 34px; height: 34px; border-radius: 11px; display: grid; place-items: center; }
.dot svg { width: 18px; height: 18px; }
.dot.warn { background: rgba(255,181,71,.16); color: var(--warn); }
.dot.safe { background: rgba(62,224,137,.16); color: var(--safe); }
.dot.info { background: rgba(124,92,255,.18); color: #b9a8ff; }
.pill b { display: block; font-size: 15.5px; font-weight: 650; }
.pill span { display: block; font-size: 14px; color: var(--muted); margin-top: 1px; }
.count { display: inline-flex !important; align-items: center; gap: 6px; margin-top: 8px; font-size: 12.5px; font-weight: 650; color: #cfd6ff;
  padding: 4px 9px; border-radius: 999px; background: linear-gradient(135deg, rgba(124,92,255,.25), rgba(34,211,238,.15)); border: 1px solid rgba(124,92,255,.35); }
.count span { color: #cfd6ff !important; margin: 0 !important; font-size: 12.5px !important; }
.x { width: 30px; height: 30px; border-radius: 9px; color: var(--dim); font-size: 20px; line-height: 1; }
.x:hover { background: rgba(255,255,255,.07); color: var(--text); }
.why { margin-top: 6px; font-size: 13.5px; color: #b9a8ff; text-decoration: underline; text-underline-offset: 3px; }
.more { margin-top: 6px; display: grid; gap: 6px; }
.more div { font-size: 13.5px; color: var(--muted); }
.bar { height: 3px; border-radius: 3px; margin-top: 10px; background: linear-gradient(90deg, var(--accent1), var(--accent2)); transform-origin: left; animation: drain linear both; }

/* ---- Highlight ---- */
.hl { position: fixed; z-index: 2147483646; pointer-events: none; border-radius: 12px; animation: ring 2s ease-in-out infinite; }
.tag { position: absolute; left: 0; top: -34px; pointer-events: auto; display: inline-flex; align-items: center; gap: 6px; white-space: nowrap; max-width: 80vw; overflow: hidden; text-overflow: ellipsis;
  font-size: 13px; font-weight: 650; color: #fff; padding: 6px 10px; border-radius: 999px; background: linear-gradient(135deg, #ff5d6c, #ff7a59); box-shadow: 0 6px 18px rgba(255,93,108,.45); }

@keyframes fade { from { opacity: 0 } to { opacity: 1 } }
@keyframes pop { from { opacity: 0; transform: translateY(10px) scale(.96) } to { opacity: 1; transform: none } }
@keyframes rise { from { opacity: 0; transform: translateY(8px) } to { opacity: 1; transform: none } }
@keyframes slide { from { opacity: 0; transform: translateX(24px) scale(.98) } to { opacity: 1; transform: none } }
@keyframes slideout { to { opacity: 0; transform: translateX(24px) } }
@keyframes pulse { 0%,100% { box-shadow: 0 0 30px rgba(255,93,108,.2) } 50% { box-shadow: 0 0 50px rgba(255,93,108,.38) } }
@keyframes breathe { 0%,100% { transform: scale(1) } 50% { transform: scale(1.04) } }
@keyframes ring { 0%,100% { box-shadow: 0 0 0 2px #ff5d6c, 0 0 0 6px rgba(255,93,108,.18), 0 0 24px rgba(255,93,108,.35) } 50% { box-shadow: 0 0 0 2px #ff5d6c, 0 0 0 9px rgba(255,93,108,.10), 0 0 36px rgba(255,93,108,.5) } }
@keyframes drain { from { transform: scaleX(1) } to { transform: scaleX(0) } }
@media (prefers-reduced-motion: reduce) { *, *::before { animation: none !important; transition: none !important; } }
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

const SHIELD_PATH = 'M12 2.5 4.5 5.5v6c0 4.6 3.1 8.6 7.5 10 4.4-1.4 7.5-5.4 7.5-10v-6z';
let gradId = 0;
const I = {
  /** Brand mark: gradient shield with a tick. */
  shield(size = 18): SVGSVGElement {
    const id = `sg${++gradId}`;
    const s = svg([['path', { d: SHIELD_PATH, fill: `url(#${id})`, stroke: 'none' }], ['path', { d: 'm8.5 12 2.4 2.4 4.8-4.8', stroke: '#fff', 'stroke-width': '2.2' }]], size);
    const defs = document.createElementNS(NS, 'defs');
    const g = document.createElementNS(NS, 'linearGradient');
    g.setAttribute('id', id);
    g.setAttribute('x1', '0');
    g.setAttribute('y1', '0');
    g.setAttribute('x2', '1');
    g.setAttribute('y2', '1');
    for (const [off, color] of [['0', '#7c5cff'], ['1', '#22d3ee']]) {
      const st = document.createElementNS(NS, 'stop');
      st.setAttribute('offset', off!);
      st.setAttribute('stop-color', color!);
      g.append(st);
    }
    defs.append(g);
    s.prepend(defs);
    return s;
  },
  alert: () => svg([['path', { d: 'M12 3 2.5 19.5h19z' }], ['path', { d: 'M12 10v4.5M12 17.5h.01' }]], 26),
  stop: () => svg([['path', { d: 'M8 2.5h8l5.5 5.5v8L16 21.5H8L2.5 16V8z' }], ['path', { d: 'M12 7.5v5.5M12 16.5h.01' }]], 26),
  dot: () => svg([['circle', { cx: '12', cy: '12', r: '9' }], ['path', { d: 'M12 8v5M12 16h.01' }]]),
  check: (size = 20) => svg([['path', { d: 'm5 12.5 4.5 4.5L19 7.5' }]], size),
  lock: () => svg([['rect', { x: '5', y: '11', width: '14', height: '10', rx: '2.5' }], ['path', { d: 'M8 11V8a4 4 0 0 1 8 0v3' }]], 14),
  bigShield: () =>
    svg([['path', { d: SHIELD_PATH, fill: 'rgba(62,224,137,.18)', stroke: '#3ee089' }], ['path', { d: 'm8.5 12 2.4 2.4 4.8-4.8', stroke: '#3ee089', 'stroke-width': '2.4' }]], 58),
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
    chip: string;
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

      const top = el('div', 'top');
      const brand = el('div', 'brand');
      brand.append(I.shield(), el('span', '', BRAND));
      top.append(brand, el('span', `chip ${opts.tone}`, opts.chip));

      const hero = el('div', 'hero');
      const badge = el('div', `badge ${opts.tone === 'warn' ? 'warn' : ''}`);
      badge.append(opts.tone === 'warn' ? I.alert() : I.stop());
      const titleBox = el('div');
      titleBox.append(el('h1', '', opts.heading));
      if (v.domain) titleBox.append(el('div', 'domain', v.domain));
      hero.append(badge, titleBox);

      const list = el('ul', 'reasons');
      v.reasons.slice(0, 3).forEach((r: Reason, i) => {
        const li = el('li', 'reason');
        li.style.animationDelay = `${120 + i * 70}ms`;
        const icon = I.dot();
        icon.classList.add('ri');
        const txt = el('div');
        txt.append(el('b', '', r.title), el('span', '', r.detail));
        li.append(icon, txt);
        list.append(li);
      });

      const actions = el('div', 'actions');
      const back = el('button', 'primary', v.safeAlternative?.label ?? 'Take me to safety');
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
      foot.append(I.lock(), el('span', '', 'Checked on your device. Nothing you type leaves your computer.'));

      card.append(top, hero, list, actions, foot);
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
    const dot = el('div', `dot ${kind}`);
    dot.append(kind === 'safe' ? I.check(18) : kind === 'warn' ? I.alert() : I.shield(18));
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
      return modal({ v, heading: INPAGE.gateTitle(action), tone: 'warn', chip: allowContinue ? 'Paused' : 'Blocked', allowContinue, allowTrust: true });
    },

    async blockOverlay(v, o: GateOptions = {}) {
      const c = await modal({ v, heading: INPAGE.blockHeading, tone: 'danger', chip: 'Blocked', allowContinue: o.allowContinue !== false, allowTrust: false });
      return c === 'back' ? 'back' : 'continue';
    },

    highlight(target, reason) {
      mount();
      const box = el('div', 'hl');
      const tag = el('div', 'tag', `⚠ ${reason.title}`);
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
        const halo = el('div', 'halo');
        halo.append(I.bigShield());
        const h1 = el('h1');
        h1.append(el('em', '', 'This is a fake warning.'), el('br'), document.createTextNode('Your computer is fine.'));
        const lead = el('p', 'lead', 'Microsoft and Apple never show phone numbers in warnings. Please don’t call anyone.');
        const done = el('ul', 'done');
        ['We turned the sound off', 'We closed the full screen', 'Nothing was installed on your computer'].forEach((t, i) => {
          const li = el('li');
          li.style.animationDelay = `${250 + i * 120}ms`;
          li.append(I.check(), el('span', '', t));
          done.append(li);
        });
        const btn = el('button', 'primary', 'Take me to safety');
        const foot = el('div', 'foot');
        foot.append(I.shield(14), el('span', '', `Protected by ${BRAND}`));
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
      if (t.stopped) {
        const c = el('div', 'count');
        c.append(I.shield(13), el('span', '', `${t.stopped.toLocaleString()} threat${t.stopped === 1 ? '' : 's'} stopped`));
        body.append(c);
      }
      const bar = el('div', 'bar');
      bar.style.animationDuration = `${ms}ms`;
      body.append(bar);
      getStack().append(p);
      const timer = setTimeout(close, ms);
      p.addEventListener('mouseenter', () => {
        clearTimeout(timer);
        bar.style.animationPlayState = 'paused';
      });
    },
  };
}
