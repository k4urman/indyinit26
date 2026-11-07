import { browser, type Browser } from 'wxt/browser';
import { IS_EXTENSION, readStorage, sendMsg, writeStorage } from '@/src/ui/bridge';
import React, { useEffect, useState, useCallback, useRef } from 'react';
import { BRAND, type BlockedPage, type Severity } from '@/src/shared/contract';
import { BLOCKED, BTN } from '@/src/ui/strings';

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------



function getBlockId(): string | null {
  if (typeof window === 'undefined') return null;
  return new URLSearchParams(window.location.search).get('id');
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
  border: '#e5e7eb',
};

function accentColor(s: Severity): string {
  if (s === 'danger') return C.danger;
  if (s === 'caution') return C.caution;
  return C.primary;
}

// ---------------------------------------------------------------------------
// Shield SVG
// ---------------------------------------------------------------------------

function ShieldIcon({ color }: { color: string }) {
  return (
    <svg
      width="80"
      height="80"
      viewBox="0 0 80 80"
      fill="none"
      xmlns="http://www.w3.org/2000/svg"
      aria-hidden="true"
    >
      <path
        d="M40 8L12 20V44C12 58.4 24.4 71.6 40 76C55.6 71.6 68 58.4 68 44V20L40 8Z"
        fill={color}
        opacity="0.15"
      />
      <path
        d="M40 8L12 20V44C12 58.4 24.4 71.6 40 76C55.6 71.6 68 58.4 68 44V20L40 8Z"
        stroke={color}
        strokeWidth="3"
        fill="none"
      />
      <text
        x="40"
        y="52"
        textAnchor="middle"
        fontSize="30"
        fontWeight="700"
        fill={color}
        fontFamily="system-ui"
      >
        !
      </text>
    </svg>
  );
}

// ---------------------------------------------------------------------------
// App
// ---------------------------------------------------------------------------

export default function App() {
  const [pageData, setPageData] = useState<BlockedPage | null>(null);
  const [loading, setLoading] = useState(true);
  const [countdown, setCountdown] = useState(3);
  const [canClickContinue, setCanClickContinue] = useState(false);
  const intervalRef = useRef<ReturnType<typeof setInterval> | null>(null);

  const blockId = getBlockId();

  useEffect(() => {
    async function load() {
      try {
        if (blockId) {
          const data = await sendMsg<BlockedPage>({ type: 'getBlocked', blockId });
          setPageData(data);
        } else {
          // Dev: load mock
          const { mockBlockedPage } = await import('@/src/ui/dev/mock-background');
          setPageData(mockBlockedPage);
        }
      } catch {
        const { mockBlockedPage } = await import('@/src/ui/dev/mock-background');
        setPageData(mockBlockedPage);
      } finally {
        setLoading(false);
      }
    }
    load();
  }, [blockId]);

  // Countdown for "continue anyway"
  useEffect(() => {
    if (!pageData?.canContinue) return;
    intervalRef.current = setInterval(() => {
      setCountdown((n) => {
        if (n <= 1) {
          clearInterval(intervalRef.current!);
          setCanClickContinue(true);
          return 0;
        }
        return n - 1;
      });
    }, 1000);
    return () => {
      if (intervalRef.current) clearInterval(intervalRef.current);
    };
  }, [pageData]);

  const goToSafety = useCallback(() => {
    if (pageData?.verdict?.safeAlternative?.url) {
      window.location.href = pageData.verdict.safeAlternative.url;
    } else if (IS_EXTENSION) {
      browser.tabs.update({ url: 'chrome://newtab/' });
    } else {
      window.location.href = 'about:blank';
    }
  }, [pageData]);

  const handleContinueAnyway = useCallback(async () => {
    if (!canClickContinue || !blockId) return;
    try {
      const result = await sendMsg<{ url: string }>({ type: 'continueAnyway', blockId });
      window.location.href = result.url;
    } catch {
      window.history.back();
    }
  }, [canClickContinue, blockId]);

  const handleReportMistake = useCallback(async () => {
    if (!pageData) return;
    // Find matching event id if present; fall back to blockId
    const eventId = blockId ?? 'unknown';
    try {
      await sendMsg({ type: 'reportMistake', eventId });
    } catch {
      // best effort
    }
    goToSafety();
  }, [pageData, blockId, goToSafety]);

  if (loading) {
    return (
      <div
        style={{
          minHeight: '100vh',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          fontFamily: 'system-ui',
          fontSize: 18,
          color: C.muted,
        }}
      >
        Loading…
      </div>
    );
  }

  if (!pageData) {
    return (
      <div
        style={{
          minHeight: '100vh',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          fontFamily: 'system-ui',
          fontSize: 18,
          color: C.muted,
        }}
      >
        Could not load page data.
      </div>
    );
  }

  const { verdict, canContinue } = pageData;
  const accent = accentColor(verdict.severity);
  const title = verdict.reasons[0]?.title ?? BLOCKED.defaultTitle;

  return (
    <div
      style={{
        minHeight: '100vh',
        background: '#fafafa',
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        padding: '24px 16px',
        fontFamily: 'system-ui, -apple-system, sans-serif',
        color: C.text,
      }}
    >
      <div
        style={{
          background: C.bg,
          borderRadius: 20,
          boxShadow: '0 4px 32px rgba(0,0,0,0.12)',
          maxWidth: 560,
          width: '100%',
          padding: '48px 40px',
          borderTop: `6px solid ${accent}`,
        }}
      >
        {/* Logo */}
        <div style={{ fontSize: 15, color: C.muted, marginBottom: 24, fontWeight: 600 }}>
          {BRAND}
        </div>

        {/* Icon */}
        <div style={{ display: 'flex', justifyContent: 'center', marginBottom: 24 }}>
          <ShieldIcon color={accent} />
        </div>

        {/* Title */}
        <h1
          style={{
            fontSize: 26,
            fontWeight: 700,
            color: accent,
            margin: '0 0 12px',
            lineHeight: 1.3,
            textAlign: 'center',
          }}
        >
          {title}
        </h1>

        {/* Subtitle */}
        <p style={{ fontSize: 17, color: C.muted, textAlign: 'center', margin: '0 0 28px', lineHeight: 1.5 }}>
          {BLOCKED.subtitle}
        </p>

        {/* Domain */}
        <div
          style={{
            textAlign: 'center',
            fontFamily: 'monospace',
            fontSize: 15,
            color: accent,
            background: '#fef2f2',
            padding: '8px 16px',
            borderRadius: 8,
            marginBottom: 24,
            wordBreak: 'break-all',
          }}
        >
          {verdict.domain}
        </div>

        {/* Reasons */}
        {verdict.reasons.length > 0 && (
          <div style={{ marginBottom: 28 }}>
            <h2 style={{ fontSize: 16, fontWeight: 700, color: C.text, margin: '0 0 12px' }}>
              {BLOCKED.reasonsHeading}
            </h2>
            <ul style={{ margin: 0, padding: 0, listStyle: 'none', display: 'flex', flexDirection: 'column', gap: 10 }}>
              {verdict.reasons.map((r, i) => (
                <li
                  key={i}
                  style={{
                    padding: '12px 14px',
                    background: '#fafafa',
                    borderRadius: 10,
                    borderLeft: `4px solid ${accent}`,
                  }}
                >
                  <div style={{ fontWeight: 600, fontSize: 15, marginBottom: 4 }}>{r.title}</div>
                  <div style={{ fontSize: 14, color: C.muted, lineHeight: 1.5 }}>{r.detail}</div>
                </li>
              ))}
            </ul>
          </div>
        )}

        {/* Safe alternative */}
        {verdict.safeAlternative && (
          <div
            style={{
              marginBottom: 24,
              padding: '14px 18px',
              background: '#dcfce7',
              borderRadius: 10,
              fontSize: 15,
              color: '#166534',
              lineHeight: 1.5,
            }}
          >
            {BLOCKED.safeAlternativePrefix}{' '}
            <strong>{verdict.safeAlternative.label}</strong>{' '}
            {BLOCKED.safeAlternativeSuffix}{' '}
            <a href={verdict.safeAlternative.url} style={{ color: '#15803d', fontWeight: 600 }}>
              {verdict.safeAlternative.url}
            </a>
          </div>
        )}

        {/* Depth indicator */}
        {verdict.depth === 'basic' && (
          <p style={{ fontSize: 13, color: C.muted, margin: '0 0 20px', fontStyle: 'italic' }}>
            {BLOCKED.depthBasic}
          </p>
        )}

        {/* Primary CTA */}
        <button
          onClick={goToSafety}
          style={{
            display: 'block',
            width: '100%',
            height: 56,
            background: C.primary,
            color: '#fff',
            border: 'none',
            borderRadius: 12,
            fontSize: 18,
            fontWeight: 700,
            cursor: 'pointer',
            marginBottom: 12,
          }}
        >
          {BTN.takeToSafety}
        </button>

        {/* Continue anyway */}
        {canContinue && (
          <button
            onClick={handleContinueAnyway}
            disabled={!canClickContinue}
            aria-disabled={!canClickContinue}
            style={{
              display: 'block',
              width: '100%',
              height: 52,
              background: '#fff',
              color: canClickContinue ? C.muted : C.border,
              border: `1px solid ${canClickContinue ? C.border : C.border}`,
              borderRadius: 12,
              fontSize: 16,
              cursor: canClickContinue ? 'pointer' : 'not-allowed',
              marginBottom: 10,
              transition: 'color 0.2s',
            }}
          >
            {canClickContinue
              ? BTN.continueAnyway
              : BLOCKED.countdown(countdown)}
          </button>
        )}

        {/* Continue warning */}
        {canContinue && canClickContinue && (
          <p style={{ fontSize: 13, color: C.caution, textAlign: 'center', margin: '0 0 12px', fontWeight: 500 }}>
            {BLOCKED.continueWarning}
          </p>
        )}

        {/* Mistake link */}
        <div style={{ textAlign: 'center', marginTop: 8 }}>
          <button
            onClick={handleReportMistake}
            aria-label={BLOCKED.mistakeAriaLabel}
            style={{
              background: 'none',
              border: 'none',
              color: C.muted,
              textDecoration: 'underline',
              cursor: 'pointer',
              fontSize: 14,
              padding: 0,
            }}
          >
            {BLOCKED.mistakeText}
          </button>
        </div>
      </div>
    </div>
  );
}
