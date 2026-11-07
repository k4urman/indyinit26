import { browser, type Browser } from 'wxt/browser';
import { EMPTY_STATS, IS_EXTENSION, readStorage, sendMsg, totalBlocked, writeStorage } from '@/src/ui/bridge';
import React, { useEffect, useState, useCallback, useRef } from 'react';
import {
  BRAND,
  DEFAULT_SETTINGS,
  STOPS,
  CATEGORIES,
  type Category,
  type AdsMode,
  type Settings,
  type BlockEvent,
  type ListEntry,
  type Stats,
  STORAGE_KEYS,
} from '@/src/shared/contract';
import { OPTIONS, BTN, formatEventTime } from '@/src/ui/strings';

// ---------------------------------------------------------------------------
// Feature flag
// ---------------------------------------------------------------------------
const ADS_SUPPORTED = false;

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------





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
  // Sentinel system palette (matches popup, blocked page and in-page UI).
  safe: '#1d8a3a',
  caution: '#bf4800',
  danger: '#e30000',
  primary: '#0071e3',
  text: '#1d1d1f',
  muted: '#6e6e73',
  bg: '#ffffff',
  pageBg: '#f5f5f7',
  border: '#d2d2d7',
  headerBg: '#1d1d1f',
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
            background: '#ffffff',
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
  const [events, setEvents] = useState<BlockEvent[]>([]);
  const [lists, setLists] = useState<ListEntry[]>([]);
  const [stats, setStats] = useState<Stats>(EMPTY_STATS);
  const [incognitoAllowed, setIncognitoAllowed] = useState<boolean | null>(null);
  const [savedFlash, setSavedFlash] = useState(false);
  const debounceRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  // Load data on mount
  useEffect(() => {
    async function load() {
      const [s, l, st] = await Promise.all([
        readStorage<Settings>(STORAGE_KEYS.settings, DEFAULT_SETTINGS),
        readStorage<ListEntry[]>(STORAGE_KEYS.lists, []),
        readStorage<Stats>(STORAGE_KEYS.stats, EMPTY_STATS),
      ]);
      setSettings({ ...DEFAULT_SETTINGS, ...s, categories: { ...DEFAULT_SETTINGS.categories, ...s.categories } });
      setLists(l);
      setStats(st);
      setEvents(await sendMsg<BlockEvent[]>({ type: 'getLog', limit: 200 }).catch(() => []));

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
    const handler = (changes: Record<string, Browser.storage.StorageChange>) => {
      if (changes[STORAGE_KEYS.settings]?.newValue) {
        setSettings({ ...DEFAULT_SETTINGS, ...(changes[STORAGE_KEYS.settings]!.newValue as Partial<Settings>) });
      }
      if (changes[STORAGE_KEYS.lists]) {
        setLists((changes[STORAGE_KEYS.lists]!.newValue as ListEntry[] | undefined) ?? []);
      }
      if (changes[STORAGE_KEYS.stats]?.newValue) {
        setStats(changes[STORAGE_KEYS.stats]!.newValue as Stats);
        // New events were logged; the log itself lives in IndexedDB behind getLog.
        void sendMsg<BlockEvent[]>({ type: 'getLog', limit: 200 }).then(setEvents, () => {});
      }
    };
    browser.storage.onChanged.addListener(handler);
    return () => browser.storage.onChanged.removeListener(handler);
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
    await sendMsg({ type: 'clearLog' });
    setEvents([]);
  }, []);

  // Lists live under their own storage key; the background validates and writes them.
  const setList = useCallback(async (pattern: string, kind: 'allow' | 'block' | null) => {
    try {
      await sendMsg({ type: 'setList', pattern, kind });
    } catch (e) {
      window.alert(e instanceof Error ? e.message : String(e));
    }
  }, []);
  const handleAddAllowlist = useCallback((d: string) => void setList(d, 'allow'), [setList]);
  const handleRemoveAllowlist = useCallback((d: string) => void setList(d, null), [setList]);
  const handleAddBlocklist = useCallback((d: string) => void setList(d, 'block'), [setList]);
  const handleRemoveBlocklist = useCallback((d: string) => void setList(d, null), [setList]);
  const allowlist = lists.filter((e) => e.kind === 'allow').map((e) => e.pattern);
  const blocklist = lists.filter((e) => e.kind === 'block').map((e) => e.pattern);

  // The slider snaps to plan.md's 4 stops; settings store the 0-100 position.
  const stopIndex = STOPS.reduce((best, st, i) =>
    Math.abs(st.at - settings.aggressiveness) < Math.abs(STOPS[best]!.at - settings.aggressiveness) ? i : best, 0);
  const stop = STOPS[stopIndex]!;

  const openExtensionsPage = useCallback(() => {
    if (IS_EXTENSION) {
      const id = browser.runtime.id;
      browser.tabs.create({ url: `chrome://extensions/?id=${id}` });
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
              min={0}
              max={STOPS.length - 1}
              step={1}
              value={stopIndex}
              onChange={(e) => updateSettings({ aggressiveness: STOPS[Number(e.target.value)]!.at })}
              aria-label="Protection level"
              style={{ width: '100%', accentColor: C.primary, height: 8, cursor: 'pointer' }}
            />
            <div style={{ display: 'flex', justifyContent: 'space-between', marginTop: 4 }}>
              {STOPS.map((st, i) => (
                <span
                  key={st.label}
                  style={{
                    fontSize: 12,
                    color: stopIndex === i ? C.primary : C.muted,
                    fontWeight: stopIndex === i ? 700 : 400,
                    cursor: 'pointer',
                  }}
                  onClick={() => updateSettings({ aggressiveness: st.at })}
                >
                  {st.label}
                </span>
              ))}
            </div>
          </div>
          <div
            style={{
              padding: '12px 16px',
              background: '#f5f5f7',
              borderRadius: 10,
              borderLeft: `4px solid ${C.primary}`,
            }}
          >
            <div style={{ fontWeight: 700, fontSize: 17, marginBottom: 4 }}>
              {stop.label}
            </div>
            <div style={{ fontSize: 15, color: C.text }}>
              {stop.description}
            </div>
          </div>
        </Section>

        {/* 3. Guards */}
        <Section title={OPTIONS.sectionGuards} description={OPTIONS.guardsDescription}>
          <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
            {(Object.keys(CATEGORIES) as Category[]).map((g) => (
              <label
                key={g}
                style={{ display: 'flex', alignItems: 'flex-start', gap: 14, cursor: 'pointer' }}
              >
                <input
                  type="checkbox"
                  checked={settings.categories[g]}
                  onChange={(e) =>
                    updateSettings({ categories: { ...settings.categories, [g]: e.target.checked } })
                  }
                  aria-label={CATEGORIES[g].label}
                  style={{ width: 20, height: 20, marginTop: 2, accentColor: C.primary, flexShrink: 0, cursor: 'pointer' }}
                />
                <div>
                  <div style={{ fontWeight: 600, fontSize: 16, color: C.text }}>{CATEGORIES[g].label}</div>
                  <div style={{ fontSize: 14, color: C.muted, marginTop: 2 }}>{CATEGORIES[g].description}</div>
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
              <div style={{ fontSize: 32, fontWeight: 700, color: C.danger }}>{totalBlocked(stats)}</div>
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
                background: '#ffffff',
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
                      ev.action === 'block' ? C.danger : C.caution
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
                            ev.action === 'block' ? '#fff1f0' : '#fff6ec',
                          color: ev.action === 'block' ? C.danger : C.caution,
                          fontWeight: 600,
                          whiteSpace: 'nowrap',
                          marginLeft: 8,
                        }}
                      >
                        {OPTIONS.eventAction[ev.userOverride ?? ev.action] ?? ev.action}
                      </span>
                    </div>
                    {ev.reasons[0] && (
                      <div style={{ fontSize: 14, color: C.muted, marginTop: 4 }}>
                        {ev.reasons[0].title}
                      </div>
                    )}
                    <div style={{ fontSize: 12, color: C.muted, marginTop: 4 }}>
                      {formatEventTime(ev.ts)}
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
              background: '#ffffff',
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
            domains={allowlist}
            placeholder={OPTIONS.allowlistPlaceholder}
            emptyText={OPTIONS.allowlistEmpty}
            onAdd={handleAddAllowlist}
            onRemove={handleRemoveAllowlist}
          />
        </Section>

        {/* 6. Blocklist */}
        <Section title={OPTIONS.sectionBlocklist} description={OPTIONS.blocklistDescription}>
          <DomainListEditor
            domains={blocklist}
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
