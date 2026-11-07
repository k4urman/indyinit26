import { browser } from 'wxt/browser';
import { IS_EXTENSION, sendMsg } from '@/src/ui/bridge';
import React, { useCallback, useEffect, useState } from 'react';
import { BRAND, type BlockedPage } from '@/src/shared/contract';
import { BLOCKED } from '@/src/ui/strings';
import { THEME_CSS } from '@/src/ui/theme';

const CSS = `
${THEME_CSS}
html, body { background: var(--surface); }
.page { min-height: 100vh; display: grid; place-items: center; padding: 48px 22px; }
.card { width: min(560px, 100%); text-align: center; animation: appear .4s cubic-bezier(.25,.1,.25,1) both; }
.symbol { width: 72px; height: 72px; margin: 0 auto 22px; color: var(--red); }
h1 { font-size: 40px; line-height: 1.1; letter-spacing: -.02em; font-weight: 600; }
.sub { color: var(--muted); font-size: 19px; line-height: 1.42; margin: 12px auto 0; max-width: 480px; }
.domain { margin-top: 10px; font-size: 15px; color: var(--muted); word-break: break-all; }
.reasons { list-style: none; text-align: left; margin: 32px 0; border-top: 1px solid var(--line); }
.reasons li { padding: 16px 0; border-bottom: 1px solid var(--line); }
.reasons b { display: block; font-size: 17px; font-weight: 600; }
.reasons span { display: block; color: var(--muted); font-size: 15px; margin-top: 2px; }
.actions { display: grid; gap: 8px; justify-items: center; }
.actions .btn-primary { min-height: 50px; padding: 0 30px; font-size: 17px; }
.secondary { min-height: 40px; padding: 0 12px; color: var(--link); font-size: 15px; }
.secondary:disabled { color: var(--dim); cursor: default; }
.secondary:not(:disabled):hover, .mistake:hover { text-decoration: underline; }
.warn { font-size: 13px; color: var(--orange); max-width: 380px; }
.mistake { font-size: 13px; color: var(--dim); }
.foot { margin-top: 36px; display: flex; gap: 6px; justify-content: center; align-items: center; color: var(--dim); font-size: 12px; }
.center { color: var(--muted); font-size: 17px; text-align: center; }
`;

function Logo() {
  return (
    <svg width="12" height="12" viewBox="0 0 24 24" aria-hidden="true">
      <path fill="currentColor" d="M12 2 4 5v6.2c0 5 3.4 9.4 8 10.8 4.6-1.4 8-5.8 8-10.8V5z" />
    </svg>
  );
}


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
        {!page && !error ? (
          <p className="center">Loading…</p>
        ) : (
          <main className="card" role="alert">
            <svg className="symbol" viewBox="0 0 24 24" aria-hidden="true">
              <path fill="currentColor" d="M8.2 2h7.6L22 8.2v7.6L15.8 22H8.2L2 15.8V8.2z" />
              <path d="m9 9 6 6m0-6-6 6" stroke="#fff" strokeWidth="2.2" strokeLinecap="round" />
            </svg>
            <h1>{error ? 'This page was blocked.' : `${v?.reasons[0]?.title ?? BLOCKED.defaultTitle}.`.replace(/\.\.$/, '.')}</h1>
            <p className="sub">{error || `${BRAND} stopped this page before it loaded. Nothing was sent to it.`}</p>
            {v?.domain && <div className="domain">{v.domain}</div>}

            {v && v.reasons.length > 0 && (
              <ul className="reasons">
                {v.reasons.map((r) => (
                  <li key={r.title}>
                    <b>{r.title}</b>
                    <span>{r.detail}</span>
                  </li>
                ))}
              </ul>
            )}

            <div className="actions" style={{ marginTop: v ? 0 : 28 }}>
              <button className="btn-primary" autoFocus onClick={goToSafety}>
                {v?.safeAlternative ? `Go to ${v.safeAlternative.url.replace(/^https?:\/\/|\/$/g, '')}` : 'Go back to safety'}
              </button>
              {page?.canContinue && (
                <>
                  <button className="secondary" disabled={countdown > 0} onClick={continueAnyway}>
                    {countdown > 0 ? `Continue anyway (${countdown})` : 'Continue anyway'}
                  </button>
                  {countdown === 0 && <p className="warn">{BLOCKED.continueWarning}</p>}
                  <button className="mistake" onClick={markSafe}>
                    {BLOCKED.mistakeText}
                  </button>
                </>
              )}
            </div>
            <div className="foot">
              <Logo />
              {BRAND} · Checked on this device
            </div>
          </main>
        )}
      </div>
    </>
  );
}
