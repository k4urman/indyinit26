/**
 * Sentinel visual language for extension pages (popup, blocked page).
 * Restrained and system-native: system font, neutral greys, one blue for
 * actions, solid symbols, no gradients. Follows the OS light/dark setting.
 */
export const BRAND_TAGLINE = 'Browse with total confidence.';

export const THEME_CSS = `
:root {
  --bg: #f8f4ff; --surface: #ffffff; --line: #ddd6fe; --line-soft: #ede9fe;
  --text: #1e1030; --muted: #6b5fa6; --dim: #9585c8;
  --blue: #7c3aed; --blue-hover: #6d28d9; --link: #7c3aed;
  --purple-tint: #f5f0ff; --purple-mid: #ede9fe;
  --red: #dc2626; --orange: #d97706; --green: #16a34a;
  --red-tint: #fff1f0; --orange-tint: #fffbeb; --green-tint: #f0fdf4;
  color-scheme: light dark;
}
@media (prefers-color-scheme: dark) {
  :root {
    --bg: #0f0a1e; --surface: #1a1030; --line: #3b2d6e; --line-soft: #2a1f52;
    --text: #f0ebff; --muted: #a594d4; --dim: #7c6aaa;
    --blue: #a78bfa; --blue-hover: #c4b5fd; --link: #a78bfa;
    --purple-tint: rgba(167,139,250,.12); --purple-mid: rgba(124,58,237,.2);
    --red: #f87171; --orange: #fbbf24; --green: #4ade80;
    --red-tint: rgba(248,113,113,.14); --orange-tint: rgba(251,191,36,.14); --green-tint: rgba(74,222,128,.14);
  }
}
* { box-sizing: border-box; margin: 0; padding: 0; }
html, body { background: var(--bg); color: var(--text);
  font: 400 15px/1.47 -apple-system, BlinkMacSystemFont, "SF Pro Text", "Helvetica Neue", "Segoe UI", Helvetica, Arial, sans-serif;
  letter-spacing: -.01em; -webkit-font-smoothing: antialiased; }
button, input { font: inherit; color: inherit; letter-spacing: inherit; }
button { cursor: pointer; border: 0; background: none; }
button:focus-visible, input:focus-visible, a:focus-visible { outline: 3px solid rgba(124,58,237,.4); outline-offset: 2px; }
.btn-primary { min-height: 44px; border-radius: 980px; padding: 0 22px; font-weight: 600; font-size: 15px; color: #fff; background: var(--blue); transition: background .15s; }
.btn-primary:hover { background: var(--blue-hover); }
.btn-primary:disabled { opacity: .4; cursor: default; }
.btn-secondary { min-height: 44px; border-radius: 980px; padding: 0 18px; font-weight: 500; color: var(--blue); background: transparent; border: 1.5px solid var(--blue); }
.btn-plain { color: var(--link); font-weight: 400; }
.btn-plain:hover { text-decoration: underline; }
@keyframes appear { from { opacity: 0; transform: translateY(4px) } to { opacity: 1; transform: none } }
@media (prefers-reduced-motion: reduce) { *, *::before, *::after { animation: none !important; transition: none !important; } }
`;
