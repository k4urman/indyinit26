/**
 * Isolated-world content script (plan.md §3): collects page signals, applies
 * the background's verdict (banner / block / highlights / scareware rescue) and
 * pauses risky actions — typing a password, card or ID number, uploading a file,
 * submitting a form, connecting a wallet.
 *
 * Typed values are inspected in memory to recognise card numbers, SSNs and
 * recovery phrases. They are never stored, logged or sent anywhere.
 */
import { browser } from 'wxt/browser';
import type { ContentRequest, GateReply, InternalRequest, PageResult } from '@/src/engine/messages';
import type { MainWorldMessage, MainWorldReply } from '@/src/engine/main-world-protocol';
import { R } from '@/src/engine/reasons';
import { EMPTY_BEHAVIOR, type BehaviorSignals, type ElementHint, type ElementKind, type PageSignals } from '@/src/engine/signals';
import { isBip39Word, kindFromFieldHint, kindFromValue, type PiiKind } from '@/src/detectors/pii';
import type { Category, EventCategory, GateAction, GateChoice, Reason, Response, Verdict } from '@/src/shared/contract';
import { createInPageUI } from '@/src/ui/inpage';

const TAG = '__scamshield';
const TEXT_CAP = 20_000;
const EXEC_LINK_RE = /\.(exe|msi|msix|scr|bat|cmd|vbs|js|jar|ps1|hta|apk|dmg|pkg|iso|zip|rar|7z)(\?|#|$)/i;
const PHONE_RE = /(?:\+?1[\s.-]?)?\(?\b[2-9]\d{2}\)?[\s.-]\d{3}[\s.-]\d{4}\b/;

/** Lifetime "threats stopped", for toasts. */
async function stoppedCount(): Promise<number> {
  try {
    const { stats } = (await browser.storage.local.get('stats')) as { stats?: { blocked?: Record<string, number> } };
    return Object.values(stats?.blocked ?? {}).reduce((a, b) => a + b, 0);
  } catch {
    return 0;
  }
}

async function send<T>(msg: InternalRequest): Promise<T | null> {
  try {
    const r = (await browser.runtime.sendMessage(msg)) as Response<T> | undefined;
    return r?.ok ? r.data : null;
  } catch {
    return null; // Extension reloaded or background unavailable: fail open.
  }
}

export default defineContentScript({
  matches: ['<all_urls>'],
  runAt: 'document_start',
  main() {
    if (!/^https?:$/.test(location.protocol)) return;
    if (window.top !== window) return; // Top frame only for the MVP.

    const ui = createInPageUI();
    const behavior: BehaviorSignals = { ...EMPTY_BEHAVIOR };
    let elements = new Map<number, Element>();
    let lastHints: ElementHint[] = [];
    let result: PageResult | null = null;
    let highlightHandles: { remove(): void }[] = [];
    let bannerShown = false;
    let pageHandled = false;
    let rescued = false;
    const approved = new Set<string>(); // gate kinds the user already allowed on this page
    let mainPort: MessagePort | null = null;
    let notificationsDenied = false;
    let checkoutToastShown = false;

    // ---------------------------------------------------------------- main world
    window.addEventListener('message', (e) => {
      if (e.source !== window || !e.data || typeof e.data !== 'object') return;
      const tag = (e.data as Record<string, unknown>)[TAG];
      if (tag === 'ready' && !mainPort) window.postMessage({ [TAG]: 'hello' }, '*');
      if (tag === 'port' && !mainPort && e.ports[0]) {
        mainPort = e.ports[0];
        mainPort.onmessage = (m: MessageEvent<MainWorldMessage>) => void onMainWorld(m.data);
      }
    });
    window.postMessage({ [TAG]: 'hello' }, '*');

    async function onMainWorld(m: MainWorldMessage): Promise<void> {
      if (m.kind === 'walletRequest') {
        behavior.walletRequest = true;
        if (m.id !== undefined) {
          const allow = await gateWallet();
          const reply: MainWorldReply = { kind: 'walletDecision', id: m.id, allow };
          mainPort?.postMessage(reply);
        }
        return;
      }
      if (behavior[m.kind]) return;
      behavior[m.kind] = true;
      if (m.kind === 'clipboardCommand') {
        ui.toast({ tone: 'info', title: 'Removed a hidden command from your clipboard', detail: 'This page tried to get you to paste and run it.', stopped: (await stoppedCount()) + 1 });
      }
      if (m.kind === 'notificationPrompt' && notificationsDenied) {
        ui.toast({ tone: 'info', title: 'Blocked a sneaky notification request', detail: 'Risky sites use notifications to send fake alerts later.' });
      }
      scheduleScan(150); // Hostile behaviour: re-judge quickly.
    }

    // ---------------------------------------------------------------- signals
    function hintOf(el: HTMLInputElement | HTMLTextAreaElement): string {
      const label = el.id ? document.querySelector(`label[for="${CSS.escape(el.id)}"]`)?.textContent : '';
      return [el.name, el.id, el.getAttribute('autocomplete'), el.getAttribute('placeholder'), el.getAttribute('aria-label'), label]
        .filter(Boolean)
        .join(' ');
    }

    function fieldKind(el: Element): PiiKind | 'password' | null {
      if (!(el instanceof HTMLInputElement || el instanceof HTMLTextAreaElement)) return null;
      if (el instanceof HTMLInputElement) {
        if (el.type === 'password') return 'password';
        if (['hidden', 'checkbox', 'radio', 'submit', 'button', 'file', 'image', 'range', 'color'].includes(el.type)) return null;
        if (el.autocomplete?.startsWith('cc-number')) return 'card';
      }
      return kindFromFieldHint(hintOf(el));
    }

    /** A grid of 12+ small text inputs is a recovery-phrase form even without labels. */
    function seedGrids(): Element[] {
      const out: Element[] = [];
      for (const container of document.querySelectorAll('form, div, section')) {
        const inputs = container.querySelectorAll(':scope > * input[type=text], :scope > input[type=text], :scope input:not([type])');
        if (inputs.length >= 12 && inputs.length <= 24 && container.querySelectorAll('input').length <= 30) {
          out.push(container);
          if (out.length >= 2) break;
        }
      }
      return out;
    }

    function identity(): string[] {
      const out: string[] = [];
      const meta = (sel: string) => document.querySelector<HTMLMetaElement>(sel)?.content;
      for (const v of [meta('meta[property="og:site_name"]'), meta('meta[property="og:title"]'), meta('meta[name="application-name"]')]) {
        if (v) out.push(v);
      }
      for (const h of [...document.querySelectorAll('h1, h2')].slice(0, 5)) out.push((h.textContent ?? '').trim().slice(0, 120));
      for (const img of [...document.querySelectorAll<HTMLImageElement>('img, svg[aria-label]')].slice(0, 40)) {
        const alt = img.getAttribute('alt') ?? img.getAttribute('aria-label') ?? '';
        const src = img instanceof HTMLImageElement ? (img.currentSrc || img.src).split(/[?#]/)[0]!.split('/').pop() ?? '' : '';
        if (/logo|brand/i.test(alt + src + img.className) || img.closest('header, nav, form')) out.push(`${alt} ${src}`.trim());
      }
      const icon = document.querySelector<HTMLLinkElement>('link[rel~="icon"]')?.href;
      if (icon) out.push(icon.split('/').pop() ?? '');
      return out.filter(Boolean).slice(0, 30);
    }

    function collect(): PageSignals {
      elements = new Map();
      const hints: ElementHint[] = [];
      const register = (el: Element, kind: ElementKind, extra: Omit<ElementHint, 'id' | 'kind'> = {}) => {
        const id = hints.length;
        elements.set(id, el);
        hints.push({ id, kind, ...extra });
      };

      const forms = { password: 0, passwordActionHosts: [] as string[], card: 0, bank: 0, seed: 0, ssn: 0, file: 0 };
      const formFor = new Set<Element>();
      for (const el of document.querySelectorAll<HTMLInputElement | HTMLTextAreaElement>('input, textarea')) {
        if (el instanceof HTMLInputElement && el.type === 'file') {
          forms.file++;
          register(el, 'fileInput');
          continue;
        }
        const kind = fieldKind(el);
        if (!kind) continue;
        const box = el.form ?? el.parentElement ?? el;
        if (kind === 'password') {
          forms.password++;
          const action = el.form?.getAttribute('action');
          if (action) {
            try {
              forms.passwordActionHosts.push(new URL(action, location.href).hostname);
            } catch {
              /* ignore */
            }
          }
          if (!formFor.has(box)) register(box, 'passwordForm', action ? { href: action } : {});
        } else if (kind === 'card') {
          forms.card++;
          if (!formFor.has(box)) register(box, 'cardForm');
        } else if (kind === 'bankAccount') {
          forms.bank++;
          if (!formFor.has(box)) register(box, 'bankForm');
        } else if (kind === 'seedPhrase') {
          forms.seed++;
          if (!formFor.has(box)) register(box, 'seedForm');
        } else if (kind === 'ssn') forms.ssn++;
        formFor.add(box);
      }
      for (const grid of seedGrids()) {
        forms.seed++;
        register(grid, 'seedForm');
      }

      for (const a of [...document.querySelectorAll<HTMLAnchorElement>('a[href]')].slice(0, 2000)) {
        if (EXEC_LINK_RE.test(a.href) || (a.hasAttribute('download') && EXEC_LINK_RE.test(a.getAttribute('download') || a.href))) {
          register(a, 'downloadLink', { text: a.href.split(/[?#]/)[0]!.split('/').pop() ?? '', href: a.href });
          if (hints.filter((h) => h.kind === 'downloadLink').length >= 10) break;
        }
      }
      for (const b of [...document.querySelectorAll('button, a, [role=button]')].slice(0, 500)) {
        if (/connect\s*wallet/i.test(b.textContent ?? '')) register(b, 'walletButton');
      }

      // Phone numbers in visible text (scare pages).
      const walker = document.createTreeWalker(document.body ?? document.documentElement, NodeFilter.SHOW_TEXT);
      let phones = 0;
      for (let n = walker.nextNode(); n && phones < 10; n = walker.nextNode()) {
        const m = PHONE_RE.exec(n.nodeValue ?? '');
        if (m && n.parentElement) {
          register(n.parentElement, 'phone', { text: m[0] });
          phones++;
        }
      }

      const text = (document.body?.innerText ?? '').toLowerCase().replace(/\s+/g, ' ').slice(0, TEXT_CAP);
      lastHints = hints;
      return { url: location.href, title: document.title, identity: identity(), text, forms, behavior: { ...behavior }, elements: hints };
    }

    // ---------------------------------------------------------------- apply
    async function goSafe(v: Verdict): Promise<void> {
      await send({ type: 'ss:goSafe', ...(v.safeAlternative ? { url: v.safeAlternative.url } : {}) });
    }

    async function apply(r: PageResult): Promise<void> {
      result = r;
      const { decision: d, verdict: v } = r;

      if (v.severity === 'caution' || v.severity === 'danger') {
        const deny: MainWorldReply = { kind: 'denyNotifications' };
        mainPort?.postMessage(deny);
        notificationsDenied = true;
      }
      // Good news is part of the job: a checkout that passes every check says so.
      if (v.severity === 'safe' && !checkoutToastShown && [...elements.keys()].some((id) => lastHints[id]?.kind === 'cardForm')) {
        checkoutToastShown = true;
        ui.toast({ tone: 'safe', title: 'This checkout looks safe', detail: `No scam signs on ${v.domain}.`, stopped: await stoppedCount() });
      }

      for (const h of highlightHandles) h.remove();
      highlightHandles = [];
      for (const h of d.highlights) {
        const el = elements.get(h.id);
        if (el?.isConnected) highlightHandles.push(ui.highlight(el, h.reason));
      }

      if (rescued) return; // The rescue screen is up; nothing may stack on top of it.
      if (d.scarewareRescue) {
        rescued = true;
        pageHandled = true;
        const lockdown: MainWorldReply = { kind: 'lockdown' };
        mainPort?.postMessage(lockdown);
        if (document.fullscreenElement) await document.exitFullscreen().catch(() => {});
        (navigator as Navigator & { keyboard?: { unlock?: () => void } }).keyboard?.unlock?.();
        document.exitPointerLock?.();
        void send({ type: 'ss:scareware' });
        await ui.scarewareRescue(v);
        await goSafe(v);
        return;
      }
      if (d.page === 'block' && !pageHandled) {
        pageHandled = true;
        if (document.fullscreenElement) await document.exitFullscreen().catch(() => {});
        const choice = await ui.blockOverlay(v, { allowContinue: !d.hardBlock });
        if (choice === 'back') await goSafe(v);
        else if (r.eventId) await send({ type: 'ss:override', eventId: r.eventId, userOverride: 'continued' });
        return;
      }
      if (d.page === 'banner' && !bannerShown) {
        bannerShown = true;
        ui.showBanner(v);
      }
    }

    let scans = 0;
    let scanTimer: ReturnType<typeof setTimeout> | undefined;
    async function scan(): Promise<void> {
      if (!document.body) return;
      scans++;
      const r = await send<PageResult>({ type: 'ss:page', signals: collect() });
      if (r) await apply(r);
    }
    function scheduleScan(delay: number): void {
      clearTimeout(scanTimer);
      scanTimer = setTimeout(() => void scan(), delay);
    }

    const start = () => {
      void scan();
      // Late-rendered forms (SPAs, scam kits that build the page with JS).
      const observer = new MutationObserver((records) => {
        if (scans >= 8) return observer.disconnect();
        for (const rec of records) {
          for (const n of rec.addedNodes) {
            if (n instanceof Element && (n.matches('input, form, iframe') || n.querySelector('input'))) return scheduleScan(800);
          }
        }
      });
      observer.observe(document.documentElement, { childList: true, subtree: true });
      setTimeout(() => scans < 2 && scheduleScan(0), 2500);
    };
    if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', start, { once: true });
    else start();

    // ---------------------------------------------------------------- gates
    const gating = new Set<string>();

    function gateFor(category: Category): boolean {
      return Boolean(result?.decision.gates[category]);
    }

    function verdictWith(extra?: Reason): Verdict | null {
      if (!result) return null;
      const v = result.verdict;
      const reasons = v.reasons.length ? v.reasons : [R.unfamiliar(v.domain)];
      return { ...v, reasons: extra ? [extra, ...reasons].slice(0, 3) : reasons };
    }

    const EVENT_CATEGORY: Record<Category, EventCategory> = {
      transactions: 'transaction', personalInfo: 'personalInfo', uploads: 'upload', downloads: 'download',
    };

    /** Ask once per kind per page. Resolves true if the action may go ahead. */
    async function gate(kind: string, category: Category, action: GateAction, extra?: Reason): Promise<boolean> {
      if (!gateFor(category) || approved.has(kind)) return true;
      if (gating.has(kind)) return false;
      const v = verdictWith(extra);
      if (!v) return true;
      gating.add(kind);
      const logged = await send<{ id?: string }>({ type: 'ss:event', category: EVENT_CATEGORY[category], action: 'block', reasons: v.reasons });
      let choice: GateChoice;
      try {
        choice = await ui.gate(v, action, { allowContinue: !result?.decision.hardBlock });
      } finally {
        gating.delete(kind);
      }
      if (choice === 'back') {
        await goSafe(v);
        return false;
      }
      if (choice === 'trust') {
        await send({ type: 'ss:trust' });
        for (const c of ['transactions', 'personalInfo', 'uploads', 'downloads'] as Category[]) if (result) result.decision.gates[c] = false;
      }
      approved.add(kind);
      if (logged?.id) await send({ type: 'ss:override', eventId: logged.id, userOverride: choice === 'trust' ? 'trusted' : 'continued' });
      return true;
    }

    const GATE_OF: Record<PiiKind | 'password', [Category, GateAction, Reason | undefined]> = {
      password: ['personalInfo', 'password', undefined],
      card: ['transactions', 'card', undefined],
      bankAccount: ['transactions', 'bankDetails', undefined],
      seedPhrase: ['personalInfo', 'crypto', R.asksSeed()],
      ssn: ['personalInfo', 'personalInfo', R.asksSsn()],
      passport: ['personalInfo', 'personalInfo', R.piiTyped('passport number')],
    };

    // Focusing a sensitive field.
    document.addEventListener(
      'focusin',
      (e) => {
        const el = e.target as Element;
        const kind = fieldKind(el);
        if (!kind) return;
        const [category, action, extra] = GATE_OF[kind];
        if (!gateFor(category) || approved.has(kind)) return;
        (el as HTMLElement).blur();
        void gate(kind, category, action, extra).then((ok) => ok && (el as HTMLElement).focus());
      },
      true,
    );

    // Typing or pasting something sensitive into an ordinary field.
    const VALUE_LABEL: Record<PiiKind, string> = {
      card: 'card number', ssn: 'Social Security number', seedPhrase: 'wallet recovery phrase', bankAccount: 'bank details', passport: 'passport number',
    };
    function checkValue(el: Element, value: string): void {
      if (!gateFor('personalInfo') && !gateFor('transactions')) return;
      // Cheap pre-checks before the full ones: enough digits, or enough wallet words.
      const digits = value.replace(/\D/g, '').length;
      const words = value.trim().split(/\s+/);
      if (digits < 9 && !(words.length >= 12 && words.slice(0, 3).every(isBip39Word))) return;
      const kind = kindFromValue(value);
      if (!kind || approved.has(kind)) return;
      const [category, action] = GATE_OF[kind];
      if (!gateFor(category)) return;
      (el as HTMLElement).blur();
      void gate(kind, category, action, R.piiTyped(VALUE_LABEL[kind]));
    }
    document.addEventListener(
      'input',
      (e) => {
        const el = e.target;
        if ((el instanceof HTMLInputElement && el.type !== 'password') || el instanceof HTMLTextAreaElement) checkValue(el, el.value);
      },
      true,
    );
    document.addEventListener(
      'paste',
      (e) => {
        const text = e.clipboardData?.getData('text') ?? '';
        if (e.target instanceof Element && text) checkValue(e.target, text);
      },
      true,
    );

    // Choosing a file to upload.
    document.addEventListener(
      'change',
      (e) => {
        const el = e.target;
        if (!(el instanceof HTMLInputElement) || el.type !== 'file' || !el.files?.length) return;
        if (!gateFor('uploads') || approved.has('upload')) return;
        void gate('upload', 'uploads', 'upload').then((ok) => {
          if (!ok) el.value = '';
        });
      },
      true,
    );

    // Submitting a sensitive form without focusing a field (autofill).
    document.addEventListener(
      'submit',
      (e) => {
        const form = e.target as HTMLFormElement;
        const kinds = [...form.elements].map(fieldKind).filter((k): k is PiiKind | 'password' => k !== null);
        const pending = kinds.find((k) => gateFor(GATE_OF[k][0]) && !approved.has(k));
        if (!pending) return;
        e.preventDefault();
        e.stopImmediatePropagation();
        const [category, action, extra] = GATE_OF[pending];
        void gate(pending, category, action, extra).then((ok) => ok && form.requestSubmit());
      },
      true,
    );

    async function gateWallet(): Promise<boolean> {
      return gate('wallet', 'transactions', 'crypto', R.wallet());
    }

    // Downloads: the background pauses the download and asks us to show the question.
    browser.runtime.onMessage.addListener((msg: unknown, _sender, sendResponse: (r: GateReply) => void) => {
      const m = msg as ContentRequest;
      if (m?.type !== 'ss:gate') return;
      ui.gate(m.verdict, m.action).then(async (choice) => {
        sendResponse({ choice });
        if (choice === 'back') ui.toast({ tone: 'safe', title: 'Download stopped', detail: 'Nothing was saved to your computer.', stopped: await stoppedCount() });
      });
      return true;
    });
  },
});
