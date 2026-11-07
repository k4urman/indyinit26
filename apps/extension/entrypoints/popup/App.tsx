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
import { ERRORS, OPTIONS, POPUP, SEVERITY_DESCRIPTIONS, formatEventTime } from '@/src/ui/strings';
import { THEME_CSS } from '@/src/ui/theme';

// ---------------------------------------------------------------------------
// Styles (popup only; shared tokens in src/ui/theme.ts)
// ---------------------------------------------------------------------------

const CSS = `
${THEME_CSS}
body { width: 380px; min-height: 560px; overflow-x: hidden; }
.app { position: relative; padding: 16px 16px 14px; display: grid; gap: 12px; }
.head { display: flex; align-items: center; justify-content: space-between; position: relative; }
.logo { display: flex; align-items: center; gap: 9px; font-weight: 750; font-size: 18px; letter-spacing: -.3px; }
.switch { display: inline-flex; align-items: center; gap: 8px; font-size: 12.5px; color: var(--muted); }
.track { position: relative; width: 44px; height: 26px; border-radius: 99px; background: rgba(255,255,255,.14); transition: background .2s; }
.track[aria-checked="true"] { background: linear-gradient(135deg, var(--a1), var(--a2)); }
.knob { position: absolute; top: 3px; left: 3px; width: 20px; height: 20px; border-radius: 50%; background: #fff; box-shadow: 0 2px 6px rgba(0,0,0,.35); transition: left .2s cubic-bezier(.2,.9,.25,1.2); }
.track[aria-checked="true"] .knob { left: 21px; }

.hero { position: relative; overflow: hidden; border-radius: 20px; padding: 16px 18px; border: 1px solid rgba(124,92,255,.35);
  background: linear-gradient(135deg, rgba(124,92,255,.22), rgba(34,211,238,.08)); animation: pop .35s cubic-bezier(.2,.9,.25,1.1) both; }
.hero .n { font-size: 40px; font-weight: 800; letter-spacing: -1.5px; line-height: 1.05; }
.hero .l { font-size: 13.5px; color: #cfd6ff; }
.hero .today { position: absolute; right: 16px; top: 16px; font-size: 12px; font-weight: 650; padding: 4px 9px; border-radius: 99px; background: rgba(255,255,255,.08); color: #e6e9ff; }
.hero .level { margin-top: 10px; font-size: 12.5px; color: var(--muted); }
.hero .level b { color: var(--text); font-weight: 650; }

.card { border-radius: 18px; padding: 14px; background: var(--panel); border: 1px solid var(--line); animation: rise .4s cubic-bezier(.2,.9,.25,1) both; }
.label { font-size: 11.5px; font-weight: 700; letter-spacing: 1.1px; text-transform: uppercase; color: var(--dim); margin-bottom: 10px; }
.site { display: grid; grid-template-columns: 52px 1fr; gap: 12px; align-items: center; }
.ring { width: 52px; height: 52px; border-radius: 16px; display: grid; place-items: center; }
.ring.safe { color: var(--safe); background: rgba(62,224,137,.12); box-shadow: 0 0 0 1px rgba(62,224,137,.35) inset, 0 0 24px rgba(62,224,137,.2); }
.ring.caution { color: var(--warn); background: rgba(255,181,71,.12); box-shadow: 0 0 0 1px rgba(255,181,71,.35) inset, 0 0 24px rgba(255,181,71,.2); }
.ring.danger { color: var(--danger); background: rgba(255,93,108,.12); box-shadow: 0 0 0 1px rgba(255,93,108,.4) inset, 0 0 24px rgba(255,93,108,.3); }
.ring.unknown { color: var(--dim); background: rgba(255,255,255,.05); box-shadow: 0 0 0 1px var(--line2) inset; }
.ring.loading svg { animation: spin 1s linear infinite; }
.domain { font: 600 13px/1.3 ui-monospace, "SF Mono", Menlo, Consolas, monospace; color: var(--muted); word-break: break-all; }
.verdict { font-size: 16.5px; font-weight: 700; margin-top: 2px; }
.verdict.safe { color: var(--safe); } .verdict.caution { color: var(--warn); } .verdict.danger { color: var(--danger); } .verdict.unknown { color: var(--text); }
.desc { font-size: 13px; color: var(--muted); margin-top: 2px; }
.reasons { list-style: none; display: grid; gap: 6px; margin-top: 12px; }
.reasons li { padding: 9px 11px; border-radius: 12px; background: rgba(255,255,255,.03); border: 1px solid var(--line); font-size: 13px; color: var(--muted); }
.reasons b { display: block; color: var(--text); font-size: 13.5px; font-weight: 650; }
.row { display: flex; gap: 8px; margin-top: 12px; flex-wrap: wrap; }
.row .btn-ghost { flex: 1; }

.check { display: flex; gap: 8px; }
.check input { flex: 1; min-width: 0; height: 44px; padding: 0 12px; border-radius: 12px; border: 1px solid var(--line2); background: rgba(0,0,0,.25); font-size: 14px; }
.check input::placeholder { color: var(--dim); }
.check .btn-primary { min-height: 44px; padding: 0 16px; font-size: 14px; }
.result { margin-top: 10px; padding: 10px 12px; border-radius: 12px; font-size: 13.5px; animation: rise .3s both; }
.result.safe, .result.unknown { background: rgba(62,224,137,.10); border: 1px solid rgba(62,224,137,.3); }
.result.caution { background: rgba(255,181,71,.10); border: 1px solid rgba(255,181,71,.3); }
.result.danger { background: rgba(255,93,108,.10); border: 1px solid rgba(255,93,108,.35); }
.result b { display: block; font-size: 14px; }
.result span { color: var(--muted); }
.err { margin-top: 8px; color: var(--danger); font-size: 13px; }

.events { list-style: none; display: grid; gap: 6px; }
.events li { display: grid; grid-template-columns: 1fr auto; gap: 2px 8px; font-size: 13px; }
.events .d { font-weight: 650; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
.events .a { font-size: 11.5px; font-weight: 700; padding: 2px 8px; border-radius: 99px; align-self: center; }
.events .a.block { color: #ffd6da; background: rgba(255,93,108,.16); } .events .a.warn { color: #ffe6bf; background: rgba(255,181,71,.14); }
.events .a.highlight { color: #ddd3ff; background: rgba(124,92,255,.18); }
.events .t { grid-column: 1 / -1; color: var(--dim); font-size: 12px; }

.foot { display: flex; align-items: center; justify-content: space-between; padding-top: 2px; font-size: 12.5px; color: var(--dim); }
.foot button { color: #b9a8ff; font-weight: 650; }
.off { filter: grayscale(.8) opacity(.6); }
`;

// ---------------------------------------------------------------------------
// Icons
// ---------------------------------------------------------------------------

function Logo({ size = 24 }: { size?: number }) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" aria-hidden="true">
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

function StatusIcon({ severity, loading }: { severity: Severity; loading: boolean }) {
  const common = { width: 26, height: 26, viewBox: '0 0 24 24', fill: 'none', stroke: 'currentColor', strokeWidth: 2, strokeLinecap: 'round' as const, strokeLinejoin: 'round' as const };
  if (loading) return <svg {...common}><path d="M12 3a9 9 0 1 1-9 9" /></svg>;
  if (severity === 'safe') return <svg {...common}><path d="M12 2.5 4.5 5.5v6c0 4.6 3.1 8.6 7.5 10 4.4-1.4 7.5-5.4 7.5-10v-6z" /><path d="m8.5 12 2.4 2.4 4.8-4.8" /></svg>;
  if (severity === 'danger') return <svg {...common}><path d="M8 2.5h8l5.5 5.5v8L16 21.5H8L2.5 16V8z" /><path d="M12 7.5v5.5M12 16.5h.01" /></svg>;
  if (severity === 'caution') return <svg {...common}><path d="M12 3 2.5 19.5h19z" /><path d="M12 10v4.5M12 17.5h.01" /></svg>;
  return <svg {...common}><circle cx="12" cy="12" r="9" /><path d="M12 8v5M12 16h.01" /></svg>;
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
      <div className="glow" />
      <main className={`app ${settings.enabled ? '' : 'off'}`}>
        <div className="head">
          <div className="logo">
            <Logo />
            {BRAND}
          </div>
          <label className="switch">
            {settings.enabled ? 'Protecting' : 'Paused'}
            <button className="track" role="switch" aria-checked={settings.enabled} aria-label={POPUP.toggleAriaLabel} onClick={toggle}>
              <span className="knob" />
            </button>
          </label>
        </div>

        <section className="hero" aria-label="Protection summary">
          {today > 0 && <span className="today">+{today} today</span>}
          <div className="n grad-text">{stopped.toLocaleString()}</div>
          <div className="l">{stopped === 1 ? 'scam stopped' : 'scams stopped'} so far</div>
          <div className="level">
            Protection level: <b>{stop.label}</b> · runs on your device
          </div>
        </section>

        <section className="card" aria-label={POPUP.currentPage}>
          <div className="label">{POPUP.currentPage}</div>
          {!isWeb && !loading ? (
            <p className="desc">{POPUP.noPage}</p>
          ) : (
            <>
              <div className="site">
                <div className={`ring ${loading ? 'unknown loading' : severity}`}>
                  <StatusIcon severity={severity} loading={loading} />
                </div>
                <div>
                  <div className="domain">{tab?.domain || '—'}</div>
                  <div className={`verdict ${severity}`}>{loading ? POPUP.checking : tab?.listed === 'allow' ? 'You trust this site' : VERDICT[severity]}</div>
                  {!loading && <div className="desc">{SEVERITY_DESCRIPTIONS[severity]}</div>}
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
                  <button className="btn-ghost" aria-pressed={tab?.listed === 'allow'} onClick={() => setList('allow')}>
                    {tab?.listed === 'allow' ? '✓ Trusted' : 'Trust site'}
                  </button>
                  <button className="btn-ghost" aria-pressed={tab?.listed === 'block'} onClick={() => setList('block')}>
                    {tab?.listed === 'block' ? '✓ Blocked' : 'Block site'}
                  </button>
                  <button className="btn-ghost" onClick={report} disabled={reported}>
                    {reported ? 'Reported' : 'Report scam'}
                  </button>
                </div>
              )}
              {reported && (
                <p className="desc" style={{ marginTop: 8 }}>
                  Thanks — blocked on this computer. You can also tell the FTC at reportfraud.ftc.gov.
                </p>
              )}
            </>
          )}
        </section>

        <section className="card" aria-label={POPUP.checkLinkLabel}>
          <div className="label">{POPUP.checkLinkLabel}</div>
          <form
            className="check"
            onSubmit={(e) => {
              e.preventDefault();
              void check();
            }}
          >
            <input value={link} onChange={(e) => setLink(e.target.value)} placeholder={POPUP.checkLinkPlaceholder} aria-label={POPUP.checkLinkPlaceholder} spellCheck={false} />
            <button className="btn-primary" disabled={linkBusy || !link.trim()}>
              {linkBusy ? '…' : 'Check'}
            </button>
          </form>
          {linkResult && (
            <div className={`result ${linkResult.severity}`}>
              <b>{LINK_VERDICT[linkResult.severity]}</b>
              <span>{linkResult.reasons[0] ? `${linkResult.reasons[0].title}. ${linkResult.reasons[0].detail}` : `${linkResult.domain} isn't on any scam list and looks normal.`}</span>
            </div>
          )}
          {error && <p className="err">{error}</p>}
        </section>

        {recent.length > 0 && (
          <section className="card" aria-label={POPUP.recentEvents}>
            <div className="label">{POPUP.recentEvents}</div>
            <ul className="events">
              {recent.map((e) => (
                <li key={e.id}>
                  <span className="d">{e.reasons[0]?.title ?? e.domain}</span>
                  <span className={`a ${e.action}`}>{OPTIONS.eventAction[e.userOverride ?? e.action] ?? e.action}</span>
                  <span className="t">{formatEventTime(e.ts)}</span>
                </li>
              ))}
            </ul>
          </section>
        )}

        <div className="foot">
          <span>🔒 Nothing leaves your computer</span>
          <button onClick={openSettings}>Settings →</button>
        </div>
      </main>
    </>
  );
}
