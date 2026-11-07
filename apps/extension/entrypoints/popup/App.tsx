import { browser, type Browser } from 'wxt/browser';
import { EMPTY_STATS, IS_EXTENSION, readStorage, sendMsg, totalBlocked, writeStorage } from '@/src/ui/bridge';
import React, { useEffect, useState, useCallback, useRef } from 'react';
import {
  BRAND,
  DEFAULT_SETTINGS,
  type Settings,
  type TabStatus,
  type Verdict,
  type BlockEvent,
  type Stats,
  type Severity,
  STORAGE_KEYS,
} from '@/src/shared/contract';
import { OPTIONS, POPUP, BTN, SEVERITY_LABELS, SEVERITY_DESCRIPTIONS, ERRORS, formatEventTime } from '@/src/ui/strings';

// ---------------------------------------------------------------------------
// Helpers: chrome or mock
// ---------------------------------------------------------------------------





// ---------------------------------------------------------------------------
// Color palette
// ---------------------------------------------------------------------------

const COLORS = {
  safe: '#16a34a',
  caution: '#d97706',
  danger: '#dc2626',
  unknown: '#6b7280',
  primary: '#2563eb',
  text: '#111827',
  muted: '#6b7280',
  bg: '#ffffff',
  border: '#e5e7eb',
  headerBg: '#1e3a5f',
};

function severityColor(s: Severity | undefined): string {
  if (!s) return COLORS.unknown;
  return COLORS[s] ?? COLORS.unknown;
}

// ---------------------------------------------------------------------------
// Sub-components
// ---------------------------------------------------------------------------

function SeverityDot({ severity }: { severity: Severity | undefined }) {
  const color = severityColor(severity);
  return (
    <span
      aria-hidden="true"
      style={{
        display: 'inline-block',
        width: 14,
        height: 14,
        borderRadius: '50%',
        background: color,
        flexShrink: 0,
        marginRight: 8,
        marginTop: 3,
      }}
    />
  );
}

function Toggle({
  checked,
  onChange,
  ariaLabel,
}: {
  checked: boolean;
  onChange: (v: boolean) => void;
  ariaLabel: string;
}) {
  return (
    <button
      role="switch"
      aria-checked={checked}
      aria-label={ariaLabel}
      onClick={() => onChange(!checked)}
      style={{
        position: 'relative',
        display: 'inline-flex',
        alignItems: 'center',
        width: 48,
        height: 28,
        background: checked ? COLORS.primary : COLORS.border,
        borderRadius: 14,
        border: 'none',
        cursor: 'pointer',
        padding: 0,
        transition: 'background 0.2s',
        flexShrink: 0,
      }}
    >
      <span
        style={{
          position: 'absolute',
          left: checked ? 22 : 2,
          width: 24,
          height: 24,
          borderRadius: '50%',
          background: '#fff',
          boxShadow: '0 1px 3px rgba(0,0,0,0.3)',
          transition: 'left 0.2s',
        }}
      />
    </button>
  );
}

function ReasonsList({ reasons }: { reasons: Verdict['reasons'] }) {
  if (!reasons.length) return null;
  const top = reasons.slice(0, 3);
  return (
    <ul style={{ margin: '8px 0 0', padding: 0, listStyle: 'none' }}>
      {top.map((r, i) => (
        <li
          key={i}
          style={{
            display: 'flex',
            alignItems: 'flex-start',
            padding: '6px 0',
            borderTop: i > 0 ? `1px solid ${COLORS.border}` : 'none',
            fontSize: 14,
            color: COLORS.text,
          }}
        >
          <span style={{ marginRight: 6, marginTop: 2, color: COLORS.danger }}>&#9888;</span>
          <span>
            <strong style={{ display: 'block', fontSize: 14 }}>{r.title}</strong>
            <span style={{ color: COLORS.muted, fontSize: 13 }}>{r.detail}</span>
          </span>
        </li>
      ))}
    </ul>
  );
}

function EventItem({ event }: { event: BlockEvent }) {
  return (
    <li
      style={{
        padding: '8px 0',
        borderTop: `1px solid ${COLORS.border}`,
        fontSize: 13,
      }}
    >
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
        <span style={{ fontWeight: 600, color: COLORS.text }}>{event.domain}</span>
        <span
          style={{
            fontSize: 11,
            padding: '2px 6px',
            borderRadius: 10,
            background: event.action === 'block' ? '#fee2e2' : '#fef3c7',
            color: event.action === 'block' ? COLORS.danger : COLORS.caution,
            fontWeight: 600,
          }}
        >
          {OPTIONS.eventAction[event.userOverride ?? event.action] ?? event.action}
        </span>
      </div>
      {event.reasons[0] && (
        <div style={{ color: COLORS.muted, fontSize: 12, marginTop: 2 }}>{event.reasons[0].title}</div>
      )}
      <div style={{ color: COLORS.muted, fontSize: 11, marginTop: 2 }}>{formatEventTime(event.ts)}</div>
    </li>
  );
}

function ActionButtons({
  domain,
  listed,
  onTrust,
  onBlock,
  onReport,
}: {
  domain: string;
  listed: TabStatus['listed'];
  onTrust: () => void;
  onBlock: () => void;
  onReport: () => void;
}) {
  const btnBase: React.CSSProperties = {
    flex: 1,
    minHeight: 40,
    border: `1px solid ${COLORS.border}`,
    borderRadius: 8,
    background: '#fff',
    cursor: 'pointer',
    fontSize: 13,
    color: COLORS.text,
    padding: '0 8px',
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 4,
  };

  return (
    <div style={{ display: 'flex', gap: 6 }}>
      <button
        onClick={onTrust}
        aria-label={POPUP.trustSiteAriaLabel}
        title={domain ? `${BTN.trustSite}: ${domain}` : BTN.trustSite}
        style={{
          ...btnBase,
          color: listed === 'allow' ? COLORS.safe : COLORS.text,
          borderColor: listed === 'allow' ? COLORS.safe : COLORS.border,
        }}
      >
        {listed === 'allow' ? '✓' : '🛡'} Trust
      </button>
      <button
        onClick={onBlock}
        aria-label={POPUP.blockSiteAriaLabel}
        title={domain ? `${BTN.blockSite}: ${domain}` : BTN.blockSite}
        style={{
          ...btnBase,
          color: listed === 'block' ? COLORS.danger : COLORS.text,
          borderColor: listed === 'block' ? COLORS.danger : COLORS.border,
        }}
      >
        🚫 Block
      </button>
      <button
        onClick={onReport}
        aria-label={POPUP.reportScamAriaLabel}
        style={{ ...btnBase, color: COLORS.danger }}
      >
        ⚑ Report
      </button>
    </div>
  );
}

// ---------------------------------------------------------------------------
// Main App
// ---------------------------------------------------------------------------

export default function App() {
  const [settings, setSettings] = useState<Settings>(DEFAULT_SETTINGS);
  const [tabStatus, setTabStatus] = useState<TabStatus | null>(null);
  const [stats, setStats] = useState<Stats>(EMPTY_STATS);
  const [loading, setLoading] = useState(true);
  const [linkInput, setLinkInput] = useState('');
  const [linkResult, setLinkResult] = useState<Verdict | null>(null);
  const [linkChecking, setLinkChecking] = useState(false);
  const [linkError, setLinkError] = useState('');

  // Load initial data
  useEffect(() => {
    async function load() {
      try {
        const [savedSettings, savedStats] = await Promise.all([
          readStorage<Settings>(STORAGE_KEYS.settings, DEFAULT_SETTINGS),
          readStorage<Stats>(STORAGE_KEYS.stats, EMPTY_STATS),
        ]);
        setSettings({ ...DEFAULT_SETTINGS, ...savedSettings, categories: { ...DEFAULT_SETTINGS.categories, ...savedSettings.categories } });
        setStats(savedStats);

        if (IS_EXTENSION) {
          const tabs = await browser.tabs.query({ active: true, currentWindow: true });
          const tab = tabs[0];
          if (tab?.id) {
            const status = await sendMsg<TabStatus>({ type: 'getTabStatus', tabId: tab.id });
            setTabStatus(status);
          }
        } else {
          const { mockTabStatusDanger } = await import('@/src/ui/dev/mock-background');
          setTabStatus(mockTabStatusDanger);
        }
      } catch (e) {
        console.error('Popup load error:', e);
      } finally {
        setLoading(false);
      }
    }
    load();
  }, []);

  // Watch storage changes
  useEffect(() => {
    if (!IS_EXTENSION) return;
    const handler = (changes: Record<string, Browser.storage.StorageChange>) => {
      if (changes[STORAGE_KEYS.settings]?.newValue) {
        setSettings({ ...DEFAULT_SETTINGS, ...(changes[STORAGE_KEYS.settings]!.newValue as Partial<Settings>) });
      }
      if (changes[STORAGE_KEYS.stats]?.newValue) {
        setStats(changes[STORAGE_KEYS.stats]!.newValue as Stats);
      }
    };
    browser.storage.onChanged.addListener(handler);
    return () => browser.storage.onChanged.removeListener(handler);
  }, []);

  const toggleEnabled = useCallback(async (val: boolean) => {
    const next = { ...settings, enabled: val };
    setSettings(next);
    await writeStorage(STORAGE_KEYS.settings, next);
  }, [settings]);

  const handleTrustSite = useCallback(async () => {
    if (!tabStatus?.domain) return;
    const isCurrentlyTrusted = tabStatus.listed === 'allow';
    await sendMsg({ type: 'setList', pattern: tabStatus.domain, kind: isCurrentlyTrusted ? null : 'allow' });
    setTabStatus((prev) => prev ? { ...prev, listed: isCurrentlyTrusted ? null : 'allow' } : prev);
  }, [tabStatus]);

  const handleBlockSite = useCallback(async () => {
    if (!tabStatus?.domain) return;
    const isCurrentlyBlocked = tabStatus.listed === 'block';
    await sendMsg({ type: 'setList', pattern: tabStatus.domain, kind: isCurrentlyBlocked ? null : 'block' });
    setTabStatus((prev) => prev ? { ...prev, listed: isCurrentlyBlocked ? null : 'block' } : prev);
  }, [tabStatus]);

  const handleReportScam = useCallback(async () => {
    if (!tabStatus?.url) return;
    await sendMsg({ type: 'reportScam', url: tabStatus.url });
  }, [tabStatus]);

  const handleCheckLink = useCallback(async () => {
    setLinkError('');
    setLinkResult(null);
    if (!linkInput.trim()) return;
    let url = linkInput.trim();
    if (!/^https?:\/\//i.test(url)) url = 'https://' + url;
    try {
      new URL(url);
    } catch {
      setLinkError(ERRORS.invalidUrl);
      return;
    }
    setLinkChecking(true);
    try {
      const verdict = await sendMsg<Verdict>({ type: 'checkUrl', url });
      setLinkResult(verdict);
    } catch {
      setLinkError(POPUP.linkCheckError);
    } finally {
      setLinkChecking(false);
    }
  }, [linkInput]);

  const openSettings = useCallback(() => {
    if (IS_EXTENSION) browser.runtime.openOptionsPage();
  }, []);

  // Dark mode
  const prefersDark = window.matchMedia('(prefers-color-scheme: dark)').matches;
  const bg = prefersDark ? '#1f2937' : '#ffffff';
  const textColor = prefersDark ? '#f9fafb' : COLORS.text;
  const borderColor = prefersDark ? '#374151' : COLORS.border;
  const cardBg = prefersDark ? '#111827' : '#f9fafb';

  const verdict = tabStatus?.verdict;
  const severity = verdict?.severity;

  return (
    <div
      style={{
        width: 380,
        minHeight: 600,
        background: bg,
        color: textColor,
        fontFamily: 'system-ui, -apple-system, sans-serif',
        display: 'flex',
        flexDirection: 'column',
        fontSize: 16,
      }}
    >
      {/* Header */}
      <header
        style={{
          background: COLORS.headerBg,
          color: '#fff',
          padding: '14px 16px',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'space-between',
        }}
      >
        <span style={{ fontWeight: 700, fontSize: 20, letterSpacing: '-0.3px' }}>{BRAND}</span>
        <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
          <span style={{ fontSize: 13, color: settings.enabled ? '#86efac' : '#9ca3af' }}>
            {settings.enabled ? POPUP.onLabel : POPUP.offLabel}
          </span>
          <Toggle
            checked={settings.enabled}
            onChange={toggleEnabled}
            ariaLabel={POPUP.toggleAriaLabel}
          />
        </div>
      </header>

      {/* Stats bar */}
      <div
        style={{
          background: COLORS.primary,
          color: '#fff',
          padding: '8px 16px',
          fontSize: 13,
          display: 'flex',
          alignItems: 'center',
          gap: 6,
        }}
      >
        <strong>{totalBlocked(stats)}</strong>
        <span>{POPUP.threatsStopped}</span>
      </div>

      {/* Main content */}
      <div style={{ flex: 1, padding: '16px', display: 'flex', flexDirection: 'column', gap: 16, overflowY: 'auto' }}>

        {/* Current page status */}
        <section aria-label={POPUP.currentPage}>
          <h2
            style={{
              margin: '0 0 10px',
              fontSize: 13,
              fontWeight: 600,
              textTransform: 'uppercase',
              letterSpacing: '0.05em',
              color: COLORS.muted,
            }}
          >
            {POPUP.currentPage}
          </h2>

          {loading ? (
            <div style={{ padding: '20px 0', textAlign: 'center', color: COLORS.muted }}>
              {POPUP.checking}
            </div>
          ) : !tabStatus ? (
            <div style={{ color: COLORS.muted, fontSize: 15 }}>{POPUP.noPage}</div>
          ) : !verdict ? (
            <div style={{ padding: '20px 0', textAlign: 'center', color: COLORS.muted }}>
              {POPUP.checking}
            </div>
          ) : (
            <div
              style={{
                background: cardBg,
                borderRadius: 12,
                padding: 14,
                border: `2px solid ${severityColor(severity)}`,
              }}
            >
              {/* Domain + severity */}
              <div style={{ display: 'flex', alignItems: 'flex-start', gap: 8 }}>
                <SeverityDot severity={severity} />
                <div style={{ flex: 1, minWidth: 0 }}>
                  <div
                    style={{
                      fontWeight: 700,
                      fontSize: 18,
                      color: severityColor(severity),
                      wordBreak: 'break-all',
                    }}
                  >
                    {verdict.domain}
                  </div>
                  <div style={{ fontSize: 15, marginTop: 2, color: textColor }}>
                    {SEVERITY_LABELS[severity!]}
                  </div>
                  <div style={{ fontSize: 13, color: COLORS.muted, marginTop: 2 }}>
                    {SEVERITY_DESCRIPTIONS[severity!]}
                  </div>
                </div>
              </div>

              {/* Listed status */}
              {tabStatus.listed && (
                <div
                  style={{
                    marginTop: 8,
                    fontSize: 13,
                    color: tabStatus.listed === 'allow' ? COLORS.safe : COLORS.danger,
                    fontWeight: 600,
                  }}
                >
                  {tabStatus.listed === 'allow' ? POPUP.listedAllow : POPUP.listedBlock}
                </div>
              )}

              {/* Safe alternative */}
              {verdict.safeAlternative && (
                <div
                  style={{
                    marginTop: 10,
                    padding: '8px 12px',
                    background: '#dcfce7',
                    borderRadius: 8,
                    fontSize: 14,
                    color: '#166534',
                  }}
                >
                  {POPUP.safeAlternative(verdict.safeAlternative.label)}{' '}
                  <a
                    href={verdict.safeAlternative.url}
                    style={{ color: COLORS.primary, fontWeight: 600 }}
                    target="_blank"
                    rel="noreferrer"
                  >
                    {verdict.safeAlternative.url}
                  </a>
                </div>
              )}

              {/* Depth indicator */}
              {verdict.depth === 'basic' && (
                <div style={{ marginTop: 6, fontSize: 12, color: COLORS.muted, fontStyle: 'italic' }}>
                  {POPUP.depthBasic}
                </div>
              )}

              {/* Reasons */}
              {verdict.reasons.length > 0 && <ReasonsList reasons={verdict.reasons} />}

              {/* Action buttons */}
              <div style={{ marginTop: 12 }}>
                <ActionButtons
                  domain={verdict.domain}
                  listed={tabStatus.listed}
                  onTrust={handleTrustSite}
                  onBlock={handleBlockSite}
                  onReport={handleReportScam}
                />
              </div>
            </div>
          )}
        </section>

        {/* Link checker */}
        <section aria-label={POPUP.checkLinkLabel}>
          <h2
            style={{
              margin: '0 0 8px',
              fontSize: 13,
              fontWeight: 600,
              textTransform: 'uppercase',
              letterSpacing: '0.05em',
              color: COLORS.muted,
            }}
          >
            {POPUP.checkLinkLabel}
          </h2>
          <div style={{ display: 'flex', gap: 8 }}>
            <input
              type="url"
              value={linkInput}
              onChange={(e) => setLinkInput(e.target.value)}
              onKeyDown={(e) => e.key === 'Enter' && handleCheckLink()}
              placeholder={POPUP.checkLinkPlaceholder}
              aria-label={POPUP.checkLinkLabel}
              style={{
                flex: 1,
                height: 44,
                padding: '0 12px',
                fontSize: 15,
                border: `1px solid ${borderColor}`,
                borderRadius: 8,
                background: bg,
                color: textColor,
                outline: 'none',
              }}
            />
            <button
              onClick={handleCheckLink}
              disabled={linkChecking || !linkInput.trim()}
              style={{
                height: 44,
                padding: '0 18px',
                background: COLORS.primary,
                color: '#fff',
                border: 'none',
                borderRadius: 8,
                fontSize: 15,
                fontWeight: 600,
                cursor: linkChecking || !linkInput.trim() ? 'not-allowed' : 'pointer',
                opacity: linkChecking || !linkInput.trim() ? 0.6 : 1,
              }}
            >
              {linkChecking ? '…' : BTN.checkLink}
            </button>
          </div>

          {linkError && (
            <div style={{ marginTop: 8, fontSize: 13, color: COLORS.danger }}>{linkError}</div>
          )}

          {linkResult && (
            <div
              style={{
                marginTop: 10,
                padding: 12,
                borderRadius: 10,
                border: `2px solid ${severityColor(linkResult.severity)}`,
                background: cardBg,
              }}
            >
              <div style={{ fontWeight: 700, color: severityColor(linkResult.severity), fontSize: 15 }}>
                {SEVERITY_LABELS[linkResult.severity]}
              </div>
              <div style={{ fontSize: 13, color: COLORS.muted, marginTop: 2 }}>{linkResult.domain}</div>
              {linkResult.reasons[0] && (
                <div style={{ marginTop: 6, fontSize: 13, color: textColor }}>
                  {linkResult.reasons[0].title}
                </div>
              )}
            </div>
          )}
        </section>

        {/* Recent events */}
        {tabStatus?.recent && tabStatus.recent.length > 0 && (
          <section aria-label={POPUP.recentEvents}>
            <h2
              style={{
                margin: '0 0 4px',
                fontSize: 13,
                fontWeight: 600,
                textTransform: 'uppercase',
                letterSpacing: '0.05em',
                color: COLORS.muted,
              }}
            >
              {POPUP.recentEvents}
            </h2>
            <ul style={{ margin: 0, padding: 0, listStyle: 'none' }}>
              {tabStatus.recent.slice(0, 5).map((ev) => (
                <EventItem key={ev.id} event={ev} />
              ))}
            </ul>
          </section>
        )}
      </div>

      {/* Footer */}
      <footer
        style={{
          borderTop: `1px solid ${borderColor}`,
          padding: '10px 16px',
          display: 'flex',
          justifyContent: 'flex-end',
        }}
      >
        <button
          onClick={openSettings}
          style={{
            background: 'none',
            border: 'none',
            color: COLORS.primary,
            cursor: 'pointer',
            fontSize: 14,
            fontWeight: 600,
            padding: '6px 0',
          }}
        >
          {POPUP.settingsLink} →
        </button>
      </footer>
    </div>
  );
}
