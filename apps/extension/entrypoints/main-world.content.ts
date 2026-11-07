/**
 * Runs in the page's own JavaScript world, before any page script, to see the
 * calls scareware and wallet drainers make (plan.md P6, P4). It reports to the
 * isolated content script over a private MessageChannel set up before the page
 * can listen, so the page can't read or forge our messages.
 *
 * Keep this tiny and dependency-free: it ships into every page.
 */
import type { MainWorldMessage, MainWorldReply } from '@/src/engine/main-world-protocol';

export default defineContentScript({
  matches: ['<all_urls>'],
  world: 'MAIN',
  runAt: 'document_start',
  allFrames: true,
  matchAboutBlank: true,
  main() {
    const TAG = '__scamshield';
    const channel = new MessageChannel();
    const port = channel.port1;
    const queue: MainWorldMessage[] = [];
    let connected = false;
    let handedOver = false;

    const send = (m: MainWorldMessage) => (connected ? port.postMessage(m) : queue.push(m));

    // Handshake: whichever script loads second triggers it; the port is handed over once.
    const onWindowMessage = (e: MessageEvent) => {
      if (e.source !== window || e.data?.[TAG] !== 'hello' || handedOver) return;
      handedOver = true;
      window.removeEventListener('message', onWindowMessage);
      window.postMessage({ [TAG]: 'port' }, '*', [channel.port2]);
      connected = true;
      for (const m of queue.splice(0)) port.postMessage(m);
    };
    window.addEventListener('message', onWindowMessage);
    window.postMessage({ [TAG]: 'ready' }, '*');

    const pending = new Map<number, (allow: boolean) => void>();
    let lockdown = false;
    port.onmessage = (e: MessageEvent<MainWorldReply>) => {
      const r = e.data;
      if (r.kind === 'lockdown') lockdown = true;
      if (r.kind === 'walletDecision') {
        pending.get(r.id)?.(r.allow);
        pending.delete(r.id);
      }
    };

    const once = new Set<string>();
    const report = (kind: MainWorldMessage['kind']) => {
      if (once.has(kind)) return;
      once.add(kind);
      send({ kind } as MainWorldMessage);
    };

    const wrap = <T extends object, K extends keyof T>(obj: T | undefined, key: K, before: (...args: unknown[]) => void) => {
      const orig = obj?.[key];
      if (typeof orig !== 'function' || !obj) return;
      const wrapped = function (this: unknown, ...args: unknown[]) {
        before(...args);
        return (orig as (...a: unknown[]) => unknown).apply(this, args);
      };
      Object.defineProperty(wrapped, 'toString', { value: () => Function.prototype.toString.call(orig) });
      try {
        (obj as Record<PropertyKey, unknown>)[key as PropertyKey] = wrapped;
      } catch {
        // Non-writable in this browser; skip.
      }
    };

    // Screen takeover. After a scareware verdict these calls are refused outright.
    const refuse = <T extends object, K extends keyof T>(obj: T | undefined, key: K, kind: MainWorldMessage['kind']) => {
      const orig = obj?.[key];
      if (typeof orig !== 'function' || !obj) return;
      const wrapped = function (this: unknown, ...args: unknown[]) {
        report(kind);
        if (lockdown) return Promise.reject(new DOMException('Blocked by ScamShield', 'NotAllowedError'));
        return (orig as (...a: unknown[]) => unknown).apply(this, args);
      };
      Object.defineProperty(wrapped, 'toString', { value: () => Function.prototype.toString.call(orig) });
      try {
        (obj as Record<PropertyKey, unknown>)[key as PropertyKey] = wrapped;
      } catch {
        // Non-writable in this browser; skip.
      }
    };
    refuse(Element.prototype, 'requestFullscreen', 'fullscreen');
    refuse(Element.prototype as Element & { webkitRequestFullscreen?: () => void }, 'webkitRequestFullscreen', 'fullscreen');
    refuse(Element.prototype, 'requestPointerLock', 'pointerLock');
    const kb = (navigator as Navigator & { keyboard?: { lock?: () => Promise<void> } }).keyboard;
    refuse(kb, 'lock', 'keyboardLock');
    wrap(Notification, 'requestPermission', () => report('notificationPrompt'));

    // Alert loops: after 3 dialogs in 10 s, report and stop showing them.
    const dialogTimes: number[] = [];
    let suppress = false;
    for (const name of ['alert', 'confirm', 'prompt'] as const) {
      const orig = window[name];
      const fallback = name === 'alert' ? undefined : name === 'confirm' ? false : null;
      const wrapped = function (this: Window, ...args: unknown[]) {
        const now = Date.now();
        dialogTimes.push(now);
        while (dialogTimes.length && now - dialogTimes[0]! > 10_000) dialogTimes.shift();
        if (dialogTimes.length >= 3) {
          suppress = true;
          report('alertLoop');
        }
        if (suppress) return fallback;
        return (orig as (...a: unknown[]) => unknown).apply(this, args);
      };
      Object.defineProperty(wrapped, 'toString', { value: () => Function.prototype.toString.call(orig) });
      (window as unknown as Record<string, unknown>)[name] = wrapped;
    }

    // Back-button hijack.
    const pushTimes: number[] = [];
    wrap(History.prototype, 'pushState', () => {
      const now = Date.now();
      pushTimes.push(now);
      while (pushTimes.length && now - pushTimes[0]! > 2_000) pushTimes.shift();
      if (pushTimes.length >= 10) report('historySpam');
    });

    // "Are you sure you want to leave?" traps.
    wrap(EventTarget.prototype, 'addEventListener', (type) => {
      if (type === 'beforeunload') report('beforeunloadTrap');
    });

    // Sound before the user has touched the page.
    const activation = (navigator as Navigator & { userActivation?: { hasBeenActive: boolean } }).userActivation;
    wrap(HTMLMediaElement.prototype, 'play', function (this: unknown) {
      const el = this as HTMLMediaElement | undefined;
      if (activation && !activation.hasBeenActive && el && !el.muted) report('autoplayAudio');
    });

    // Wallets (EIP-1193). Wallet extensions inject `window.ethereum` around now, so wrap lazily.
    const RISKY_METHODS = new Set([
      'eth_requestAccounts', 'eth_sendTransaction', 'eth_sign', 'personal_sign', 'eth_signTypedData',
      'eth_signTypedData_v3', 'eth_signTypedData_v4', 'wallet_requestPermissions', 'wallet_sendCalls',
    ]);
    let nextId = 1;
    const askContent = (method: string) =>
      new Promise<boolean>((resolve) => {
        const id = nextId++;
        pending.set(id, resolve);
        send({ kind: 'walletRequest', id, method });
        // No reply means our content script isn't running; don't break the page.
        setTimeout(() => {
          if (pending.delete(id)) resolve(true);
        }, connected ? 600_000 : 3_000);
      });

    const wrapped = new WeakSet<object>();
    const hookProvider = () => {
      const eth = (window as unknown as { ethereum?: { request?: (a: { method: string }) => Promise<unknown> } }).ethereum;
      if (!eth?.request || wrapped.has(eth)) return;
      wrapped.add(eth);
      const orig = eth.request.bind(eth);
      try {
        eth.request = async (args: { method: string }) => {
          if (args && RISKY_METHODS.has(args.method)) {
            report('walletRequest');
            if (!(await askContent(args.method))) {
              throw Object.assign(new Error('User rejected the request.'), { code: 4001 });
            }
          }
          return orig(args);
        };
      } catch {
        // Frozen provider; can't gate, but we still reported it.
      }
    };
    hookProvider();
    window.addEventListener('ethereum#initialized', hookProvider, { once: true });
    document.addEventListener('DOMContentLoaded', hookProvider, { once: true });
    setTimeout(hookProvider, 1500);
  },
});
