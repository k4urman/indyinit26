import { browser, type Browser } from 'wxt/browser';
import { EMPTY_STATS, IS_EXTENSION, readStorage, sendMsg, totalBlocked, writeStorage } from '@/src/ui/bridge';
import React, { useCallback, useEffect, useState } from 'react';
import {
  BRAND,
  DEFAULT_SETTINGS,
  STOPS,
  STORAGE_KEYS,
  type BlockEvent,
  type Settings,
  type Severity,
  type Stats,
  type TabStatus,
  type Verdict,
} from '@/src/shared/contract';
import { ERRORS, OPTIONS, POPUP, formatEventTime } from '@/src/ui/strings';
import { THEME_CSS } from '@/src/ui/theme';

// ---------------------------------------------------------------------------
// Styles (popup only; shared tokens in src/ui/theme.ts)
// ---------------------------------------------------------------------------

const CSS = `
${THEME_CSS}
body { width: 380px; min-height: 540px; overflow-x: hidden; }
.app { padding: 18px 16px 14px; display: grid; gap: 14px; }
.head { display: flex; align-items: center; justify-content: space-between; }
.logo { display: flex; align-items: center; gap: 7px; font-weight: 600; font-size: 17px; }
.switch { display: inline-flex; align-items: center; gap: 8px; font-size: 13px; color: var(--muted); }
.track { position: relative; width: 51px; height: 31px; border-radius: 99px; background: var(--line); transition: background .2s; }
.track[aria-checked="true"] { background: #34c759; }
.knob { position: absolute; top: 2px; left: 2px; width: 27px; height: 27px; border-radius: 50%; background: #fff; box-shadow: 0 3px 8px rgba(0,0,0,.15), 0 1px 1px rgba(0,0,0,.16); transition: left .2s; }
.track[aria-checked="true"] .knob { left: 22px; }

.hero { padding: 4px 2px 0; }
.hero .n { font-size: 48px; font-weight: 600; letter-spacing: -.03em; line-height: 1; }
.hero .l { font-size: 15px; color: var(--muted); margin-top: 4px; }
.hero .l b { color: var(--text); font-weight: 500; }

.group { border-radius: 12px; background: var(--surface); overflow: hidden; animation: appear .3s both; }
.label { font-size: 13px; color: var(--muted); padding: 0 4px 6px; }
.site { display: grid; grid-template-columns: 34px 1fr; gap: 12px; align-items: center; padding: 14px; }
.sym { width: 34px; height: 34px; }
.sym.safe { color: var(--green); } .sym.caution { color: var(--orange); } .sym.danger { color: var(--red); } .sym.unknown { color: var(--dim); }
.sym.loading { animation: spin 1s linear infinite; }
@keyframes spin { to { transform: rotate(360deg) } }
.domain { font-size: 13px; color: var(--muted); word-break: break-all; }
.verdict { font-size: 17px; font-weight: 600; }
.desc { font-size: 13px; color: var(--muted); }
.reasons { list-style: none; border-top: 1px solid var(--line-soft); margin-left: 14px; }
.reasons li { padding: 10px 14px 10px 0; border-bottom: 1px solid var(--line-soft); font-size: 13px; color: var(--muted); }
.reasons li:last-child { border-bottom: 0; }
.reasons b { display: block; color: var(--text); font-size: 14px; font-weight: 500; }
.row { display: grid; grid-template-columns: repeat(3, 1fr); border-top: 1px solid var(--line-soft); }
.row button { min-height: 44px; font-size: 14px; color: var(--link); border-right: 1px solid var(--line-soft); }
.row button:last-child { border-right: 0; }
.row button[aria-pressed="true"] { color: var(--text); font-weight: 600; }
.row button:disabled { color: var(--dim); cursor: default; }
.note { padding: 0 14px 12px; font-size: 12.5px; color: var(--muted); }

.check { display: flex; gap: 8px; padding: 10px; }
.check input { flex: 1; min-width: 0; height: 40px; padding: 0 12px; border-radius: 10px; border: 1px solid var(--line); background: var(--bg); font-size: 15px; }
.check input::placeholder { color: var(--dim); }
.check .btn-primary { min-height: 40px; padding: 0 18px; }
.result { margin: 0 10px 10px; padding: 10px 12px; border-radius: 10px; font-size: 13px; }
.result.safe, .result.unknown { background: var(--green-tint); } .result.caution { background: var(--orange-tint); } .result.danger { background: var(--red-tint); }
.result b { display: block; font-size: 14px; font-weight: 600; }
.result.danger b { color: var(--red); } .result.caution b { color: var(--orange); } .result.safe b, .result.unknown b { color: var(--green); }
.result span { color: var(--muted); }
.err { padding: 0 14px 12px; color: var(--red); font-size: 13px; }

.events { list-style: none; }
.events li { display: grid; grid-template-columns: 1fr auto; gap: 0 8px; padding: 10px 14px; border-bottom: 1px solid var(--line-soft); font-size: 13px; }
.events li:last-child { border-bottom: 0; }
.events .d { font-weight: 500; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
.events .a { font-size: 12px; color: var(--muted); }
.events .t { grid-column: 1 / -1; color: var(--dim); font-size: 12px; }

.foot { display: flex; align-items: center; justify-content: space-between; padding: 2px 4px 0; font-size: 12px; color: var(--dim); }
.foot button { color: var(--link); font-size: 13px; }
.off .hero, .off .group { opacity: .5; }
`;

// ---------------------------------------------------------------------------
// Icons
// ---------------------------------------------------------------------------

function Logo({ size = 20 }: { size?: number }) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" aria-hidden="true">
      <path fill="currentColor" d="M12 2 4 5v6.2c0 5 3.4 9.4 8 10.8 4.6-1.4 8-5.8 8-10.8V5z" />
    </svg>
  );
}

/** Solid symbols in the system style: checkmark.shield, exclamationmark.triangle, xmark.octagon. */
function StatusIcon({ severity, loading }: { severity: Severity; loading: boolean }) {
  const p = { width: 34, height: 34, viewBox: '0 0 24 24' };
  if (loading)
    return (
      <svg {...p} fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round">
        <path d="M12 3a9 9 0 1 1-9 9" />
      </svg>
    );
  if (severity === 'safe')
    return (
      <svg {...p}>
        <path fill="currentColor" d="M12 2 4 5v6.2c0 5 3.4 9.4 8 10.8 4.6-1.4 8-5.8 8-10.8V5z" />
        <path d="m8.3 12.2 2.6 2.6 5-5.2" fill="none" stroke="#fff" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" />
      </svg>
    );
  if (severity === 'danger')
    return (
      <svg {...p}>
        <path fill="currentColor" d="M8.2 2h7.6L22 8.2v7.6L15.8 22H8.2L2 15.8V8.2z" />
        <path d="m9 9 6 6m0-6-6 6" stroke="#fff" strokeWidth="2.2" strokeLinecap="round" />
      </svg>
    );
  if (severity === 'caution')
    return (
      <svg {...p}>
        <path fill="currentColor" d="M10.3 3.4a2 2 0 0 1 3.4 0l8.4 14.5a2 2 0 0 1-1.7 3H3.6a2 2 0 0 1-1.7-3z" />
        <path d="M12 9v4.5M12 17h.01" stroke="#fff" strokeWidth="2.2" strokeLinecap="round" />
      </svg>
    );
  return (
    <svg {...p}>
      <circle cx="12" cy="12" r="10" fill="currentColor" />
      <path d="M12 7.5v5.5M12 16.5h.01" stroke="#fff" strokeWidth="2.2" strokeLinecap="round" />
    </svg>
  );
}

const VERDICT: Record<Severity, string> = {
  safe: 'Looks safe',
  unknown: 'Not checked',
  caution: 'Be careful here',
  danger: 'Looks like a scam',
};

const LINK_VERDICT: Record<Severity, string> = {
  safe: 'No problems found',
  unknown: 'No problems found',
  caution: 'Be careful with this link',
  danger: 'Do not open this link',
};

// ---------------------------------------------------------------------------
// App
// ---------------------------------------------------------------------------

export default function App() {
  const [settings, setSettings] = useState<Settings>(DEFAULT_SETTINGS);
  const [stats, setStats] = useState<Stats>(EMPTY_STATS);
  const [tab, setTab] = useState<TabStatus | null>(null);
  const [loading, setLoading] = useState(true);
  const [link, setLink] = useState('');
  const [linkResult, setLinkResult] = useState<Verdict | null>(null);
  const [linkBusy, setLinkBusy] = useState(false);
  const [error, setError] = useState('');
  const [reported, setReported] = useState(false);

  useEffect(() => {
    void (async () => {
      try {
        const [s, st] = await Promise.all([
          readStorage<Partial<Settings>>(STORAGE_KEYS.settings, {}),
          readStorage<Stats>(STORAGE_KEYS.stats, EMPTY_STATS),
        ]);
        setSettings({ ...DEFAULT_SETTINGS, ...s, categories: { ...DEFAULT_SETTINGS.categories, ...s.categories } });
        setStats(st);
        if (IS_EXTENSION) {
          const [active] = await browser.tabs.query({ active: true, currentWindow: true });
          if (active?.id !== undefined) setTab(await sendMsg<TabStatus>({ type: 'getTabStatus', tabId: active.id }));
        } else {
          const { mockTabStatusDanger } = await import('@/src/ui/dev/mock-background');
          setTab(mockTabStatusDanger);
        }
      } catch (e) {
        console.error('[sentinel] popup load', e);
      } finally {
        setLoading(false);
      }
    })();
  }, []);

  useEffect(() => {
    if (!IS_EXTENSION) return;
    const onChange = (changes: Record<string, Browser.storage.StorageChange>) => {
      const s = changes[STORAGE_KEYS.settings]?.newValue as Partial<Settings> | undefined;
      if (s) setSettings({ ...DEFAULT_SETTINGS, ...s });
      const st = changes[STORAGE_KEYS.stats]?.newValue as Stats | undefined;
      if (st) setStats(st);
    };
    browser.storage.onChanged.addListener(onChange);
    return () => browser.storage.onChanged.removeListener(onChange);
  }, []);

  const toggle = useCallback(async () => {
    const next = { ...settings, enabled: !settings.enabled };
    setSettings(next);
    await writeStorage(STORAGE_KEYS.settings, next);
  }, [settings]);

  const setList = useCallback(
    async (kind: 'allow' | 'block') => {
      if (!tab?.domain) return;
      const next = tab.listed === kind ? null : kind;
      try {
        await sendMsg({ type: 'setList', pattern: tab.domain, kind: next });
        setTab({ ...tab, listed: next });
      } catch (e) {
        setError(e instanceof Error ? e.message : ERRORS.generic);
      }
    },
    [tab],
  );

  const report = useCallback(async () => {
    if (!tab?.url) return;
    try {
      await sendMsg({ type: 'reportScam', url: tab.url });
      setReported(true);
      setTab({ ...tab, listed: 'block' });
    } catch (e) {
      setError(e instanceof Error ? e.message : ERRORS.generic);
    }
  }, [tab]);

  const check = useCallback(async () => {
    setError('');
    setLinkResult(null);
    const raw = link.trim();
    if (!raw) return;
    setLinkBusy(true);
    try {
      setLinkResult(await sendMsg<Verdict>({ type: 'checkUrl', url: raw }));
    } catch (e) {
      setError(e instanceof Error ? e.message : ERRORS.invalidUrl);
    } finally {
      setLinkBusy(false);
    }
  }, [link]);

  const openSettings = () => (IS_EXTENSION ? void browser.runtime.openOptionsPage() : undefined);

  const v = tab?.verdict ?? null;
  const isWeb = Boolean(tab?.url && /^https?:/.test(tab.url));
  const severity: Severity = v?.severity ?? 'unknown';
  const stopped = totalBlocked(stats);
  const today = stats.today?.date === new Date().toISOString().slice(0, 10) ? stats.today.blocked : 0;
  const stop = STOPS.reduce((best, s) => (Math.abs(s.at - settings.aggressiveness) < Math.abs(best.at - settings.aggressiveness) ? s : best), STOPS[0]!);
  const recent: BlockEvent[] = (tab?.recent ?? []).slice(-3).reverse();

  return (
    <>
      <style>{CSS}</style>
      <main className={`app ${settings.enabled ? '' : 'off'}`}>
        <div className="head">
          <div className="logo">
            <Logo />
            {BRAND}
          </div>
          <label className="switch">
            {settings.enabled ? 'On' : 'Off'}
            <button className="track" role="switch" aria-checked={settings.enabled} aria-label={POPUP.toggleAriaLabel} onClick={toggle}>
              <span className="knob" />
            </button>
          </label>
        </div>

        <section className="hero" aria-label="Protection summary">
          <div className="n">{stopped.toLocaleString()}</div>
          <div className="l">
            {stopped === 1 ? 'scam stopped' : 'scams stopped'}
            {today > 0 ? `, ${today} today` : ''}. Protection level: <b>{stop.label}</b>.
          </div>
        </section>

        <div>
          <div className="label">{POPUP.currentPage}</div>
          <section className="group" aria-label={POPUP.currentPage}>
            {!isWeb && !loading ? (
              <p className="site desc" style={{ display: 'block' }}>
                {POPUP.noPage}
              </p>
            ) : (
              <>
                <div className="site">
                  <div className={`sym ${loading ? 'unknown loading' : severity}`}>
                    <StatusIcon severity={severity} loading={loading} />
                  </div>
                  <div>
                    <div className="verdict">{loading ? POPUP.checking : tab?.listed === 'allow' ? 'You trust this site' : VERDICT[severity]}</div>
                    <div className="domain">{tab?.domain || ''}</div>
                  </div>
                </div>
                {v && v.reasons.length > 0 && (
                  <ul className="reasons">
                    {v.reasons.slice(0, 3).map((r) => (
                      <li key={r.title}>
                        <b>{r.title}</b>
                        {r.detail}
                      </li>
                    ))}
                  </ul>
                )}
                {isWeb && (
                  <div className="row">
                    <button aria-pressed={tab?.listed === 'allow'} onClick={() => setList('allow')}>
                      {tab?.listed === 'allow' ? 'Trusted' : 'Trust'}
                    </button>
                    <button aria-pressed={tab?.listed === 'block'} onClick={() => setList('block')}>
                      {tab?.listed === 'block' ? 'Blocked' : 'Block'}
                    </button>
                    <button onClick={report} disabled={reported}>
                      {reported ? 'Reported' : 'Report'}
                    </button>
                  </div>
                )}
                {reported && <p className="note">Blocked on this computer. You can also tell the FTC at reportfraud.ftc.gov.</p>}
              </>
            )}
          </section>
        </div>

        <div>
          <div className="label">{POPUP.checkLinkLabel}</div>
          <section className="group" aria-label={POPUP.checkLinkLabel}>
            <form
              className="check"
              onSubmit={(e) => {
                e.preventDefault();
                void check();
              }}
            >
              <input value={link} onChange={(e) => setLink(e.target.value)} placeholder={POPUP.checkLinkPlaceholder} aria-label={POPUP.checkLinkPlaceholder} spellCheck={false} />
              <button className="btn-primary" disabled={linkBusy || !link.trim()}>
                Check
              </button>
            </form>
            {linkResult && (() => {
              // For an explicit link check, any reason is worth a "be careful", even if the
              // URL-only score sits below the page-block threshold.
              const sev = linkResult.reasons.length && (linkResult.severity === 'safe' || linkResult.severity === 'unknown') ? 'caution' : linkResult.severity;
              return (
              <div className={`result ${sev}`}>
                <b>{LINK_VERDICT[sev]}</b>
                <span>{linkResult.reasons[0] ? `${linkResult.reasons[0].title}. ${linkResult.reasons[0].detail}` : `${linkResult.domain} isn’t on any scam list and looks normal.`}</span>
              </div>
              );
            })()}
            {error && <p className="err">{error}</p>}
          </section>
        </div>

        {recent.length > 0 && (
          <div>
            <div className="label">{POPUP.recentEvents}</div>
            <section className="group" aria-label={POPUP.recentEvents}>
              <ul className="events">
                {recent.map((e) => (
                  <li key={e.id}>
                    <span className="d">{e.reasons[0]?.title ?? e.domain}</span>
                    <span className="a">{OPTIONS.eventAction[e.userOverride ?? e.action] ?? e.action}</span>
                    <span className="t">{formatEventTime(e.ts)}</span>
                  </li>
                ))}
              </ul>
            </section>
          </div>
        )}

        <div className="foot">
          <span>Checked on this device.</span>
          <button onClick={openSettings}>Settings</button>
        </div>
      </main>
    </>
  );
}
