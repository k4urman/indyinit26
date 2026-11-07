import { browser } from 'wxt/browser';
import { IS_EXTENSION, sendMsg } from '@/src/ui/bridge';
import React, { useCallback, useEffect, useState } from 'react';
import { BRAND, type BlockedPage } from '@/src/shared/contract';
import { BLOCKED } from '@/src/ui/strings';
import { THEME_CSS } from '@/src/ui/theme';

const CSS = `
${THEME_CSS}
body { min-height: 100vh; }
.page { position: relative; min-height: 100vh; display: grid; place-items: center; padding: 32px 16px; overflow: hidden; }
.bg { position: fixed; inset: 0; pointer-events: none;
  background: radial-gradient(700px 420px at 50% 0%, rgba(255,93,108,.22), transparent 65%), radial-gradient(700px 500px at 85% 100%, rgba(124,92,255,.22), transparent 60%); }
.card { position: relative; width: min(600px, 100%); border-radius: 28px; padding: 34px 34px 26px; text-align: center;
  background: rgba(15,20,38,.82); border: 1px solid var(--line); box-shadow: 0 40px 100px rgba(0,0,0,.55);
  backdrop-filter: blur(24px) saturate(160%); animation: pop .45s cubic-bezier(.2,.9,.25,1.12) both; }
.brand { display: inline-flex; align-items: center; gap: 8px; font-weight: 700; color: var(--muted); font-size: 14px; }
.badge { width: 92px; height: 92px; margin: 22px auto 18px; border-radius: 28px; display: grid; place-items: center; color: var(--danger);
  background: linear-gradient(135deg, rgba(255,93,108,.24), rgba(255,93,108,.05)); border: 1px solid rgba(255,93,108,.4);
  box-shadow: 0 0 60px rgba(255,93,108,.35); }
h1 { font-size: 34px; line-height: 1.15; letter-spacing: -.8px; font-weight: 800; }
.sub { color: var(--muted); font-size: 17px; margin: 10px auto 0; max-width: 460px; }
.domain { display: inline-block; margin-top: 16px; font: 600 15px ui-monospace, "SF Mono", Menlo, Consolas, monospace; color: #ffc2c8;
  background: rgba(255,93,108,.1); border: 1px solid rgba(255,93,108,.28); padding: 6px 12px; border-radius: 10px; word-break: break-all; }
.reasons { list-style: none; text-align: left; display: grid; gap: 10px; margin: 24px 0; }
.reasons li { display: grid; grid-template-columns: 22px 1fr; gap: 12px; padding: 14px 16px; border-radius: 16px; background: rgba(255,255,255,.035); border: 1px solid var(--line);
  animation: rise .45s cubic-bezier(.2,.9,.25,1) both; }
.reasons svg { color: var(--danger); margin-top: 2px; }
.reasons b { display: block; font-size: 16.5px; }
.reasons span { display: block; color: var(--muted); font-size: 15px; }
.actions { display: grid; gap: 10px; }
.actions .btn-primary { min-height: 58px; font-size: 18px; }
.secondary { min-height: 50px; border-radius: 14px; font-weight: 600; color: var(--muted); border: 1px solid var(--line2); background: rgba(255,255,255,.03); }
.secondary:disabled { opacity: .45; cursor: default; }
.warn { font-size: 13.5px; color: var(--warn); }
.mistake { margin-top: 6px; font-size: 14px; color: var(--dim); text-decoration: underline; text-underline-offset: 3px; }
.foot { margin-top: 18px; padding-top: 14px; border-top: 1px solid var(--line); color: var(--dim); font-size: 13px; }
.center { color: var(--muted); font-size: 17px; text-align: center; }
`;

function Logo() {
  return (
    <svg width="20" height="20" viewBox="0 0 24 24" aria-hidden="true">
      <defs>
        <linearGradient id="lg" x1="0" y1="0" x2="1" y2="1">
          <stop offset="0" stopColor="#7c5cff" />
          <stop offset="1" stopColor="#22d3ee" />
        </linearGradient>
      </defs>
      <path d="M12 2.5 4.5 5.5v6c0 4.6 3.1 8.6 7.5 10 4.4-1.4 7.5-5.4 7.5-10v-6z" fill="url(#lg)" />
      <path d="m8.5 12 2.4 2.4 4.8-4.8" fill="none" stroke="#fff" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  );
}

const icon = { fill: 'none', stroke: 'currentColor', strokeWidth: 2, strokeLinecap: 'round' as const, strokeLinejoin: 'round' as const, viewBox: '0 0 24 24' };

export default function App() {
  const blockId = new URLSearchParams(location.search).get('id');
  const [page, setPage] = useState<BlockedPage | null>(null);
  const [error, setError] = useState('');
  const [countdown, setCountdown] = useState(3);

  useEffect(() => {
    void (async () => {
      try {
        if (blockId && IS_EXTENSION) setPage(await sendMsg<BlockedPage>({ type: 'getBlocked', blockId }));
        else setPage((await import('@/src/ui/dev/mock-background')).mockBlockedPage); // dev preview only
      } catch (e) {
        // Never show example data for a real block: say what happened instead.
        setError(e instanceof Error ? e.message : 'This warning has expired. Close this tab to stay safe.');
      }
    })();
  }, [blockId]);

  useEffect(() => {
    if (!page?.canContinue) return;
    const t = setInterval(() => setCountdown((n) => (n <= 1 ? (clearInterval(t), 0) : n - 1)), 1000);
    return () => clearInterval(t);
  }, [page]);

  const goToSafety = useCallback(() => {
    const safe = page?.verdict.safeAlternative?.url;
    if (safe) location.href = safe;
    else if (IS_EXTENSION) void browser.tabs.update({ url: import.meta.env.FIREFOX ? 'about:blank' : 'chrome://newtab/' });
    else history.back();
  }, [page]);

  const continueAnyway = useCallback(async () => {
    if (!blockId) return;
    try {
      location.href = (await sendMsg<{ url: string }>({ type: 'continueAnyway', blockId })).url;
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    }
  }, [blockId]);

  // "I was wrong": trust the site, then take the user to it.
  const markSafe = useCallback(async () => {
    if (!blockId) return;
    try {
      await sendMsg({ type: 'reportMistake', eventId: blockId });
      await continueAnyway();
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    }
  }, [blockId, continueAnyway]);

  const v = page?.verdict;
  return (
    <>
      <style>{CSS}</style>
      <div className="page">
        <div className="bg" />
        {!page && !error ? (
          <p className="center">Loading…</p>
        ) : (
          <main className="card" role="alert">
            <div className="brand">
              <Logo />
              {BRAND}
            </div>
            <div className="badge">
              <svg width="44" height="44" {...icon}>
                <path d="M8 2.5h8l5.5 5.5v8L16 21.5H8L2.5 16V8z" />
                <path d="M12 7.5v5.5M12 16.5h.01" />
              </svg>
            </div>
            <h1>{error ? 'This page was blocked' : v?.reasons[0]?.title ?? BLOCKED.defaultTitle}</h1>
            <p className="sub">{error || `${BRAND} stopped this page before it could load. Nothing was sent to it.`}</p>
            {v?.domain && <div className="domain">{v.domain}</div>}

            {v && v.reasons.length > 0 && (
              <ul className="reasons">
                {v.reasons.map((r, i) => (
                  <li key={r.title} style={{ animationDelay: `${120 + i * 80}ms` }}>
                    <svg width="20" height="20" {...icon}>
                      <circle cx="12" cy="12" r="9" />
                      <path d="M12 8v5M12 16h.01" />
                    </svg>
                    <div>
                      <b>{r.title}</b>
                      <span>{r.detail}</span>
                    </div>
                  </li>
                ))}
              </ul>
            )}

            <div className="actions" style={{ marginTop: v ? 0 : 24 }}>
              <button className="btn-primary" autoFocus onClick={goToSafety}>
                {v?.safeAlternative?.label ?? 'Take me to safety'}
              </button>
              {page?.canContinue && (
                <>
                  <button className="secondary" disabled={countdown > 0} onClick={continueAnyway}>
                    {countdown > 0 ? BLOCKED.countdown(countdown) : 'Continue anyway'}
                  </button>
                  {countdown === 0 && <p className="warn">{BLOCKED.continueWarning}</p>}
                  <button className="mistake" onClick={markSafe}>
                    {BLOCKED.mistakeText}
                  </button>
                </>
              )}
            </div>
            <div className="foot">🔒 Checked on your device. Nothing you type leaves your computer.</div>
          </main>
        )}
      </div>
    </>
  );
}
