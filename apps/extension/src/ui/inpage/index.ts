/**
 * PLACEHOLDER in-page UI so the engine can be tested end to end.
 * Owned by the frontend (docs/FRONTEND_AGENT.md §4): replace this whole file
 * with the real implementation; keep the `createInPageUI` export.
 */
import type { GateAction, GateChoice, InPageUI, Reason, Verdict } from '../../shared/contract';
import { BRAND } from '../../shared/contract';

const CSS = `
:host { all: initial; }
* { box-sizing: border-box; font-family: system-ui, sans-serif; }
.dim { position: fixed; inset: 0; background: rgba(15,23,42,.72); display: grid; place-items: center; z-index: 2147483647; pointer-events: auto; }
.card { background: #fff; color: #111827; max-width: 560px; width: calc(100% - 32px); border-radius: 16px; padding: 28px; font-size: 18px; line-height: 1.5; box-shadow: 0 20px 60px rgba(0,0,0,.4); }
.card h1 { font-size: 26px; margin: 0 0 12px; }
.card ul { padding-left: 20px; margin: 0 0 20px; }
.card li { margin-bottom: 10px; }
.card .brand { font-size: 14px; color: #6b7280; margin-bottom: 8px; }
.row { display: flex; gap: 12px; flex-wrap: wrap; }
button { font-size: 18px; min-height: 48px; padding: 0 20px; border-radius: 10px; border: 2px solid #1f2937; background: #fff; color: #111827; cursor: pointer; }
button.primary { background: #15803d; border-color: #15803d; color: #fff; font-weight: 600; }
button:disabled { opacity: .5; cursor: default; }
.link { border: 0; background: none; text-decoration: underline; padding: 0; min-height: 0; font-size: 16px; }
.banner { position: fixed; top: 0; left: 0; right: 0; background: #fef3c7; color: #78350f; border-bottom: 3px solid #b45309; padding: 12px 16px; font-size: 17px; display: flex; gap: 12px; align-items: center; z-index: 2147483647; pointer-events: auto; }
.banner b { flex: 1; }
.hl { position: absolute; border: 3px solid #b91c1c; border-radius: 6px; pointer-events: none; z-index: 2147483646; }
.hl span { position: absolute; top: -28px; left: 0; background: #b91c1c; color: #fff; font-size: 13px; padding: 3px 8px; border-radius: 6px; white-space: nowrap; pointer-events: auto; }
`;

function el<K extends keyof HTMLElementTagNameMap>(tag: K, props: Partial<HTMLElementTagNameMap[K]> = {}, ...kids: (Node | string)[]) {
  const e = Object.assign(document.createElement(tag), props);
  e.append(...kids);
  return e;
}

const GATE_TITLES: Record<GateAction, string> = {
  password: 'Wait before you type your password',
  card: 'Wait before you enter your card',
  bankDetails: 'Wait before you enter your bank details',
  crypto: 'Wait before you connect your wallet',
  giftCard: 'Wait before you pay with gift cards',
  download: 'Wait before you download this',
  upload: 'Wait before you send this file',
  personalInfo: 'Wait before you share this',
};

export function createInPageUI(): InPageUI {
  const host = document.createElement('scamshield-ui');
  const root = host.attachShadow({ mode: 'closed' });
  root.append(el('style', { textContent: CSS }));
  host.style.cssText = 'all: initial; position: fixed; inset: 0; pointer-events: none; z-index: 2147483647;';
  // Don't let clicks and keys on our UI reach the page: scareware re-enters fullscreen on any click.
  for (const type of ['click', 'mousedown', 'mouseup', 'pointerdown', 'pointerup', 'keydown', 'keyup', 'keypress']) {
    host.addEventListener(type, (e) => e.stopPropagation());
  }

  const mount = () => {
    if (!host.isConnected) (document.body ?? document.documentElement).append(host);
  };
  // Pages that remove or restyle our host get it back.
  new MutationObserver(() => {
    if (!host.isConnected || host.style.display === 'none') {
      host.style.display = '';
      mount();
    }
  }).observe(document.documentElement, { childList: true, subtree: true, attributes: true, attributeFilter: ['style'] });

  const reasonList = (reasons: Reason[]) =>
    el('ul', {}, ...reasons.map((r) => el('li', {}, el('b', { textContent: r.title }), el('br'), r.detail)));

  function modal(title: string, v: Verdict, allowTrust: boolean, allowContinue = true): Promise<GateChoice> {
    mount();
    return new Promise((resolve) => {
      const back = el('button', { className: 'primary', textContent: v.safeAlternative?.label ?? 'Go back to safety' });
      const cont = el('button', { textContent: 'Continue (3)', disabled: true });
      const trust = el('button', { className: 'link', textContent: 'I trust this website' });
      const box = el('div', { className: 'dim' },
        el('div', { className: 'card', role: 'alertdialog' },
          el('div', { className: 'brand', textContent: BRAND }),
          el('h1', { textContent: title }),
          reasonList(v.reasons),
          el('div', { className: 'row' }, back, ...(allowContinue ? [cont] : []), ...(allowTrust ? [trust] : []))));
      root.append(box);
      back.focus();
      let n = 3;
      const t = setInterval(() => {
        n--;
        cont.textContent = n > 0 ? `Continue (${n})` : 'Continue';
        if (n <= 0) {
          cont.disabled = false;
          clearInterval(t);
        }
      }, 1000);
      const done = (c: GateChoice) => {
        clearInterval(t);
        box.remove();
        resolve(c);
      };
      back.onclick = () => done('back');
      cont.onclick = () => done('continue');
      trust.onclick = () => done('trust');
    });
  }

  return {
    showBanner(v) {
      mount();
      const close = el('button', { textContent: 'Close' });
      const bar = el('div', { className: 'banner', role: 'status' }, el('b', { textContent: `Be careful: ${v.reasons[0]?.title ?? 'this website looks risky'}` }), close);
      root.append(bar);
      close.onclick = () => bar.remove();
      return { close: () => bar.remove() };
    },
    gate(v, action) {
      return modal(GATE_TITLES[action], v, true);
    },
    highlight(target, reason) {
      mount();
      const box = el('div', { className: 'hl' }, el('span', { textContent: reason.title, title: reason.detail }));
      root.append(box);
      const place = () => {
        const r = target.getBoundingClientRect();
        Object.assign(box.style, { position: 'fixed', top: `${r.top - 4}px`, left: `${r.left - 4}px`, width: `${r.width + 8}px`, height: `${r.height + 8}px` });
      };
      place();
      const timer = setInterval(place, 250);
      return { remove: () => (clearInterval(timer), box.remove()) };
    },
    async scarewareRescue(v) {
      // Only one way out of this screen: to safety.
      await modal('This is a fake warning. Your computer is fine.', v, false, false);
    },
    async blockOverlay(v) {
      const c = await modal('This website may be a scam', v, false);
      return c === 'back' ? 'back' : 'continue';
    },
  };
}
