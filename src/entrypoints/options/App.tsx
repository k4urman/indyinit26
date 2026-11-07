import React, { useEffect, useState, useCallback, useRef } from 'react';
import {
  BRAND,
  DEFAULT_SETTINGS,
  LEVELS,
  GUARDS,
  type Level,
  type Guard,
  type AdsMode,
  type Settings,
  type ThreatEvent,
  type Stats,
  STORAGE_KEYS,
} from '../../shared/contract';
import { OPTIONS, BTN, formatEventTime } from '../../ui/strings';

// ---------------------------------------------------------------------------
// Feature flag
// ---------------------------------------------------------------------------
const ADS_SUPPORTED = false;

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

const IS_EXTENSION = typeof chrome !== 'undefined' && !!chrome.runtime?.id;

async function readStorage<T>(key: string, fallback: T): Promise<T> {
  if (IS_EXTENSION) {
    const result = await chrome.storage.local.get(key);
    return (result[key] as T) ?? fallback;
  }
  const { getMockState } = await import('../../ui/dev/mock-background');
  const state = getMockState();
  if (key === STORAGE_KEYS.settings) return (state.settings as unknown as T) ?? fallback;
  if (key === STORAGE_KEYS.stats) return (state.stats as unknown as T) ?? fallback;
  if (key === STORAGE_KEYS.events) return (state.events as unknown as T) ?? fallback;
  return fallback;
}

async function writeStorage(key: string, value: unknown): Promise<void> {
  if (IS_EXTENSION) {
    await chrome.storage.local.set({ [key]: value });
  }
}

async function sendMsg<T>(req: Record<string, unknown>): Promise<T> {
  if (IS_EXTENSION) {
    return chrome.runtime.sendMessage(req);
  }
  const { sendMessage } = await import('../../ui/dev/mock-background');
  return sendMessage(req as never) as Promise<T>;
}

function isValidDomain(d: string): boolean {
  const trimmed = d.trim();
  if (!trimmed) return false;
  if (trimmed.includes('/') || trimmed.includes(' ') || trimmed.startsWith('http')) return false;
  return /^[a-z0-9]([a-z0-9-]{0,61}[a-z0-9])?(\.[a-z0-9]([a-z0-9-]{0,61}[a-z0-9])?)+$/i.test(trimmed);
}

// ---------------------------------------------------------------------------
// Color palette
// ---------------------------------------------------------------------------
const C = {
  safe: '#16a34a',
  caution: '#d97706',
  danger: '#dc2626',
  primary: '#2563eb',
  text: '#111827',
  muted: '#6b7280',
  bg: '#ffffff',
  pageBg: '#f3f4f6',
  border: '#e5e7eb',
  headerBg: '#1e3a5f',
};

// ---------------------------------------------------------------------------
// Reusable UI
// ---------------------------------------------------------------------------

function Section({ title, description, children }: { title: string; description?: string; children: React.ReactNode }) {
  return (
    <section
      style={{
        background: C.bg,
        borderRadius: 12,
        padding: '24px 28px',
        marginBottom: 20,
        border: `1px solid ${C.border}`,
      }}
    >
      <h2 style={{ margin: '0 0 4px', fontSize: 20, fontWeight: 700, color: C.text }}>{title}</h2>
      {description && <p style={{ margin: '0 0 20px', color: C.muted, fontSize: 15 }}>{description}</p>}
      {children}
    </section>
  );
}

function Toggle({
  checked,
  onChange,
  ariaLabel,
  label,
}: {
  checked: boolean;
  onChange: (v: boolean) => void;
  ariaLabel: string;
  label?: string;
}) {
  return (
    <label
      style={{
        display: 'flex',
        alignItems: 'center',
        gap: 12,
        cursor: 'pointer',
        userSelect: 'none',
      }}
    >
      <button
        role="switch"
        aria-checked={checked}
        aria-label={ariaLabel}
        onClick={() => onChange(!checked)}
        style={{
          position: 'relative',
          display: 'inline-flex',
          alignItems: 'center',
          width: 52,
          height: 30,
          background: checked ? C.primary : C.border,
          borderRadius: 15,
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
            left: checked ? 24 : 2,
            width: 26,
            height: 26,
            borderRadius: '50%',
            background: '#fff',
            boxShadow: '0 1px 3px rgba(0,0,0,0.3)',
            transition: 'left 0.2s',
          }}
        />
      </button>
      {label && <span style={{ fontSize: 16, color: C.text, fontWeight: 500 }}>{label}</span>}
    </label>
  );
}

function DomainListEditor({
  domains,
  placeholder,
  emptyText,
  onAdd,
  onRemove,
}: {
  domains: string[];
  placeholder: string;
  emptyText: string;
  onAdd: (d: string) => void;
  onRemove: (d: string) => void;
}) {
  const [input, setInput] = useState('');
  const [error, setError] = useState('');

  const handleAdd = () => {
    const val = input.trim().toLowerCase();
    if (!isValidDomain(val)) {
      setError(OPTIONS.domainError);
      return;
    }
    setError('');
    onAdd(val);
    setInput('');
  };

  return (
    <div>
      <div style={{ display: 'flex', gap: 8, marginBottom: 12 }}>
        <input
          type="text"
          value={input}
          onChange={(e) => { setInput(e.target.value); setError(''); }}
          onKeyDown={(e) => e.key === 'Enter' && handleAdd()}
          placeholder={placeholder}
          style={{
            flex: 1,
            height: 44,
            padding: '0 12px',
            fontSize: 15,
            border: `1px solid ${error ? C.danger : C.border}`,
            borderRadius: 8,
            outline: 'none',
          }}
        />
        <button
          onClick={handleAdd}
          style={{
            height: 44,
            padding: '0 20px',
            background: C.primary,
            color: '#fff',
            border: 'none',
            borderRadius: 8,
            fontSize: 15,
            fontWeight: 600,
            cursor: 'pointer',
          }}
        >
          {BTN.addDomain}
        </button>
      </div>
      {error && <div style={{ color: C.danger, fontSize: 13, marginBottom: 8 }}>{error}</div>}
      {domains.length === 0 ? (
        <p style={{ color: C.muted, fontSize: 14, margin: 0 }}>{emptyText}</p>
      ) : (
        <ul style={{ margin: 0, padding: 0, listStyle: 'none' }}>
          {domains.map((d) => (
            <li
              key={d}
              style={{
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'space-between',
                padding: '10px 12px',
                background: C.pageBg,
                borderRadius: 8,
                marginBottom: 6,
                fontSize: 15,
              }}
            >
              <span style={{ color: C.text, fontFamily: 'monospace' }}>{d}</span>
              <button
                onClick={() => onRemove(d)}
                aria-label={`Remove ${d}`}
                style={{
                  background: 'none',
                  border: 'none',
                  color: C.danger,
                  cursor: 'pointer',
                  fontSize: 20,
                  lineHeight: 1,
                  padding: '2px 6px',
                }}
              >
                ×
              </button>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}

// ---------------------------------------------------------------------------
// Main App
// ---------------------------------------------------------------------------

export default function App() {
  const [settings, setSettings] = useState<Settings>(DEFAULT_SETTINGS);
  const [events, setEvents] = useState<ThreatEvent[]>([]);
  const [stats, setStats] = useState<Stats>({ blocked: 0, warned: 0, since: Date.now() });
  const [incognitoAllowed, setIncognitoAllowed] = useState<boolean | null>(null);
  const [savedFlash, setSavedFlash] = useState(false);
  const debounceRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  // Load data on mount
  useEffect(() => {
    async function load() {
      const [s, e, st] = await Promise.all([
        readStorage<Settings>(STORAGE_KEYS.settings, DEFAULT_SETTINGS),
        readStorage<ThreatEvent[]>(STORAGE_KEYS.events, []),
        readStorage<Stats>(STORAGE_KEYS.stats, { blocked: 0, warned: 0, since: Date.now() }),
      ]);
      setSettings(s);
      setEvents(e);
      setStats(st);

      try {
        const access = await sendMsg<{ allowed: boolean }>({ type: 'getIncognitoAccess' });
        setIncognitoAllowed(access.allowed);
      } catch {
        setIncognitoAllowed(false);
      }
    }
    load();
  }, []);

  // Watch storage
  useEffect(() => {
    if (!IS_EXTENSION) return;
    const handler = (changes: Record<string, chrome.storage.StorageChange>) => {
      if (changes[STORAGE_KEYS.settings]?.newValue) {
        setSettings(changes[STORAGE_KEYS.settings].newValue as Settings);
      }
      if (changes[STORAGE_KEYS.events]?.newValue) {
        setEvents(changes[STORAGE_KEYS.events].newValue as ThreatEvent[]);
      }
      if (changes[STORAGE_KEYS.stats]?.newValue) {
        setStats(changes[STORAGE_KEYS.stats].newValue as Stats);
      }
    };
    chrome.storage.onChanged.addListener(handler);
    return () => chrome.storage.onChanged.removeListener(handler);
  }, []);

  // Debounced write
  const persistSettings = useCallback((next: Settings) => {
    if (debounceRef.current) clearTimeout(debounceRef.current);
    debounceRef.current = setTimeout(async () => {
      await writeStorage(STORAGE_KEYS.settings, next);
      setSavedFlash(true);
      setTimeout(() => setSavedFlash(false), 1500);
    }, 300);
  }, []);

  const updateSettings = useCallback((patch: Partial<Settings>) => {
    setSettings((prev) => {
      const next = { ...prev, ...patch };
      persistSettings(next);
      return next;
    });
  }, [persistSettings]);

  const handleClearHistory = useCallback(async () => {
    if (!window.confirm(OPTIONS.clearHistoryConfirm)) return;
    await sendMsg({ type: 'clearHistory' });
    setEvents([]);
  }, []);

  const handleAddAllowlist = useCallback((domain: string) => {
    updateSettings({ allowlist: [...settings.allowlist.filter((d) => d !== domain), domain] });
  }, [settings.allowlist, updateSettings]);

  const handleRemoveAllowlist = useCallback((domain: string) => {
    updateSettings({ allowlist: settings.allowlist.filter((d) => d !== domain) });
  }, [settings.allowlist, updateSettings]);

  const handleAddBlocklist = useCallback((domain: string) => {
    updateSettings({ blocklist: [...settings.blocklist.filter((d) => d !== domain), domain] });
  }, [settings.blocklist, updateSettings]);

  const handleRemoveBlocklist = useCallback((domain: string) => {
    updateSettings({ blocklist: settings.blocklist.filter((d) => d !== domain) });
  }, [settings.blocklist, updateSettings]);

  const openExtensionsPage = useCallback(() => {
    if (IS_EXTENSION) {
      const id = chrome.runtime.id;
      chrome.tabs.create({ url: `chrome://extensions/?id=${id}` });
    }
  }, []);

  return (
    <div
      style={{
        minHeight: '100vh',
        background: C.pageBg,
        fontFamily: 'system-ui, -apple-system, sans-serif',
        color: C.text,
        fontSize: 16,
      }}
    >
      {/* Page header */}
      <header
        style={{
          background: C.headerBg,
          color: '#fff',
          padding: '20px 32px',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'space-between',
        }}
      >
        <span style={{ fontWeight: 700, fontSize: 24 }}>{OPTIONS.pageTitle}</span>
        {savedFlash && (
          <span
            style={{
              background: '#16a34a',
              color: '#fff',
              padding: '6px 16px',
              borderRadius: 20,
              fontSize: 14,
              fontWeight: 600,
            }}
          >
            {OPTIONS.saved}
          </span>
        )}
      </header>

      <main style={{ maxWidth: 760, margin: '0 auto', padding: '32px 24px' }}>

        {/* 1. Master switch */}
        <Section title={OPTIONS.sectionMaster} description={OPTIONS.masterDescription}>
          <Toggle
            checked={settings.enabled}
            onChange={(v) => updateSettings({ enabled: v })}
            ariaLabel={settings.enabled ? OPTIONS.masterOnLabel : OPTIONS.masterOffLabel}
            label={settings.enabled ? OPTIONS.masterOnLabel : OPTIONS.masterOffLabel}
          />
        </Section>

        {/* 2. Protection level */}
        <Section title={OPTIONS.sectionLevel} description={OPTIONS.levelDescription}>
          <div style={{ marginBottom: 16 }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 8 }}>
              <span style={{ fontSize: 13, color: C.muted }}>Chill</span>
              <span style={{ fontSize: 13, color: C.muted }}>Paranoid</span>
            </div>
            <input
              type="range"
              min={1}
              max={5}
              step={1}
              value={settings.level}
              onChange={(e) => updateSettings({ level: Number(e.target.value) as Level })}
              aria-label="Protection level"
              style={{ width: '100%', accentColor: C.primary, height: 8, cursor: 'pointer' }}
            />
            <div style={{ display: 'flex', justifyContent: 'space-between', marginTop: 4 }}>
              {([1, 2, 3, 4, 5] as Level[]).map((l) => (
                <span
                  key={l}
                  style={{
                    fontSize: 12,
                    color: settings.level === l ? C.primary : C.muted,
                    fontWeight: settings.level === l ? 700 : 400,
                    cursor: 'pointer',
                  }}
                  onClick={() => updateSettings({ level: l })}
                >
                  {LEVELS[l].label}
                </span>
              ))}
            </div>
          </div>
          <div
            style={{
              padding: '12px 16px',
              background: '#eff6ff',
              borderRadius: 10,
              borderLeft: `4px solid ${C.primary}`,
            }}
          >
            <div style={{ fontWeight: 700, fontSize: 17, marginBottom: 4 }}>
              {LEVELS[settings.level].label}
            </div>
            <div style={{ fontSize: 15, color: C.text }}>
              {LEVELS[settings.level].description}
            </div>
          </div>
        </Section>

        {/* 3. Guards */}
        <Section title={OPTIONS.sectionGuards} description={OPTIONS.guardsDescription}>
          <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
            {(Object.keys(GUARDS) as Guard[]).map((g) => (
              <label
                key={g}
                style={{ display: 'flex', alignItems: 'flex-start', gap: 14, cursor: 'pointer' }}
              >
                <input
                  type="checkbox"
                  checked={settings.guards[g]}
                  onChange={(e) =>
                    updateSettings({ guards: { ...settings.guards, [g]: e.target.checked } })
                  }
                  aria-label={GUARDS[g].label}
                  style={{ width: 20, height: 20, marginTop: 2, accentColor: C.primary, flexShrink: 0, cursor: 'pointer' }}
                />
                <div>
                  <div style={{ fontWeight: 600, fontSize: 16, color: C.text }}>{GUARDS[g].label}</div>
                  <div style={{ fontSize: 14, color: C.muted, marginTop: 2 }}>{GUARDS[g].description}</div>
                </div>
              </label>
            ))}
          </div>
        </Section>

        {/* 4. History */}
        <Section title={OPTIONS.sectionHistory} description={OPTIONS.historyDescription}>
          {/* Stats */}
          <div
            style={{
              display: 'flex',
              gap: 20,
              marginBottom: 20,
              padding: '16px',
              background: C.pageBg,
              borderRadius: 10,
            }}
          >
            <div style={{ textAlign: 'center' }}>
              <div style={{ fontSize: 32, fontWeight: 700, color: C.danger }}>{stats.blocked}</div>
              <div style={{ fontSize: 13, color: C.muted }}>Stopped</div>
            </div>
            <div style={{ textAlign: 'center' }}>
              <div style={{ fontSize: 32, fontWeight: 700, color: C.caution }}>{stats.warned}</div>
              <div style={{ fontSize: 13, color: C.muted }}>Warned</div>
            </div>
          </div>

          {/* Retention */}
          <div style={{ display: 'flex', alignItems: 'center', gap: 12, marginBottom: 20 }}>
            <label style={{ fontSize: 15, fontWeight: 500, color: C.text }} htmlFor="retention">
              {OPTIONS.retentionLabel}
            </label>
            <select
              id="retention"
              value={settings.historyDays}
              onChange={(e) => updateSettings({ historyDays: Number(e.target.value) })}
              style={{
                height: 40,
                padding: '0 12px',
                fontSize: 15,
                border: `1px solid ${C.border}`,
                borderRadius: 8,
                background: '#fff',
                cursor: 'pointer',
              }}
            >
              {OPTIONS.retentionOptions.map((o) => (
                <option key={o.value} value={o.value}>{o.label}</option>
              ))}
            </select>
          </div>

          {/* Event list */}
          {events.length === 0 ? (
            <p style={{ color: C.muted, fontSize: 14 }}>{OPTIONS.noHistory}</p>
          ) : (
            <ul style={{ margin: '0 0 16px', padding: 0, listStyle: 'none' }}>
              {events.map((ev) => (
                <li
                  key={ev.id}
                  style={{
                    padding: '12px 14px',
                    marginBottom: 8,
                    background: C.pageBg,
                    borderRadius: 10,
                    display: 'flex',
                    alignItems: 'flex-start',
                    gap: 12,
                    borderLeft: `4px solid ${
                      ev.action === 'blocked' || ev.action === 'paused' ? C.danger : C.caution
                    }`,
                  }}
                >
                  <div style={{ flex: 1, minWidth: 0 }}>
                    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                      <span style={{ fontWeight: 600, fontSize: 15, color: C.text }}>{ev.domain}</span>
                      <span
                        style={{
                          fontSize: 12,
                          padding: '2px 8px',
                          borderRadius: 10,
                          background:
                            ev.action === 'blocked' || ev.action === 'paused' ? '#fee2e2' : '#fef3c7',
                          color: ev.action === 'blocked' || ev.action === 'paused' ? C.danger : C.caution,
                          fontWeight: 600,
                          whiteSpace: 'nowrap',
                          marginLeft: 8,
                        }}
                      >
                        {OPTIONS.eventAction[ev.action] ?? ev.action}
                      </span>
                    </div>
                    {ev.reasons[0] && (
                      <div style={{ fontSize: 14, color: C.muted, marginTop: 4 }}>
                        {ev.reasons[0].title}
                      </div>
                    )}
                    <div style={{ fontSize: 12, color: C.muted, marginTop: 4 }}>
                      {formatEventTime(ev.at)}
                    </div>
                  </div>
                </li>
              ))}
            </ul>
          )}

          {/* Clear button */}
          <button
            onClick={handleClearHistory}
            style={{
              height: 44,
              padding: '0 20px',
              background: '#fff',
              color: C.danger,
              border: `1px solid ${C.danger}`,
              borderRadius: 8,
              fontSize: 15,
              fontWeight: 600,
              cursor: 'pointer',
            }}
          >
            {BTN.clearHistory}
          </button>
        </Section>

        {/* 5. Allowlist */}
        <Section title={OPTIONS.sectionAllowlist} description={OPTIONS.allowlistDescription}>
          <DomainListEditor
            domains={settings.allowlist}
            placeholder={OPTIONS.allowlistPlaceholder}
            emptyText={OPTIONS.allowlistEmpty}
            onAdd={handleAddAllowlist}
            onRemove={handleRemoveAllowlist}
          />
        </Section>

        {/* 6. Blocklist */}
        <Section title={OPTIONS.sectionBlocklist} description={OPTIONS.blocklistDescription}>
          <DomainListEditor
            domains={settings.blocklist}
            placeholder={OPTIONS.blocklistPlaceholder}
            emptyText={OPTIONS.blocklistEmpty}
            onAdd={handleAddBlocklist}
            onRemove={handleRemoveBlocklist}
          />
        </Section>

        {/* 7. Private windows */}
        <Section title={OPTIONS.sectionIncognito}>
          {incognitoAllowed === null ? (
            <p style={{ color: C.muted, fontSize: 15 }}>Checking…</p>
          ) : incognitoAllowed ? (
            <p style={{ color: C.safe, fontSize: 16, fontWeight: 600, margin: 0 }}>
              {OPTIONS.incognitoAllowed}
            </p>
          ) : (
            <>
              <p style={{ color: C.text, fontSize: 15, margin: '0 0 16px' }}>
                {OPTIONS.incognitoNotAllowed}
              </p>
              <button
                onClick={openExtensionsPage}
                style={{
                  height: 48,
                  padding: '0 24px',
                  background: C.primary,
                  color: '#fff',
                  border: 'none',
                  borderRadius: 8,
                  fontSize: 16,
                  fontWeight: 600,
                  cursor: 'pointer',
                }}
              >
                {OPTIONS.incognitoButton}
              </button>
            </>
          )}
        </Section>

        {/* 8. Ads (hidden unless ADS_SUPPORTED) */}
        {ADS_SUPPORTED && (
          <Section title={OPTIONS.sectionAds} description={OPTIONS.adsDescription}>
            <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
              {(['off', 'cover', 'remove'] as AdsMode[]).map((mode) => {
                const labels: Record<AdsMode, string> = {
                  off: OPTIONS.adsOff,
                  cover: OPTIONS.adsCover,
                  remove: OPTIONS.adsRemove,
                };
                return (
                  <label
                    key={mode}
                    style={{ display: 'flex', alignItems: 'center', gap: 12, cursor: 'pointer', fontSize: 16 }}
                  >
                    <input
                      type="radio"
                      name="adsMode"
                      value={mode}
                      checked={settings.ads === mode}
                      onChange={() => updateSettings({ ads: mode })}
                      style={{ width: 18, height: 18, accentColor: C.primary, cursor: 'pointer' }}
                    />
                    {labels[mode]}
                  </label>
                );
              })}
            </div>
          </Section>
        )}
      </main>
    </div>
  );
}
