/**
 * Sentinel visual language for extension pages (popup, blocked page).
 * Restrained and system-native: system font, neutral greys, one blue for
 * actions, solid symbols, no gradients. Follows the OS light/dark setting.
 */
export const BRAND_TAGLINE = 'Browse with total confidence.';

export const THEME_CSS = `
:root {
  --bg: #f5f5f7; --surface: #ffffff; --line: #d2d2d7; --line-soft: #e8e8ed;
  --text: #1d1d1f; --muted: #6e6e73; --dim: #86868b;
  --blue: #0071e3; --blue-hover: #0077ed; --link: #0066cc;
  --red: #e30000; --orange: #bf4800; --green: #1d8a3a;
  --red-tint: #fff1f0; --orange-tint: #fff6ec; --green-tint: #effaf2;
  color-scheme: light dark;
}
@media (prefers-color-scheme: dark) {
  :root {
    --bg: #000000; --surface: #1c1c1e; --line: #38383a; --line-soft: #2c2c2e;
    --text: #f5f5f7; --muted: #a1a1a6; --dim: #8e8e93;
    --blue: #0a84ff; --blue-hover: #409cff; --link: #2997ff;
    --red: #ff453a; --orange: #ff9f0a; --green: #30d158;
    --red-tint: rgba(255,69,58,.14); --orange-tint: rgba(255,159,10,.14); --green-tint: rgba(48,209,88,.14);
  }
}
* { box-sizing: border-box; margin: 0; padding: 0; }
html, body { background: var(--bg); color: var(--text);
  font: 400 15px/1.47 -apple-system, BlinkMacSystemFont, "SF Pro Text", "Helvetica Neue", "Segoe UI", Helvetica, Arial, sans-serif;
  letter-spacing: -.01em; -webkit-font-smoothing: antialiased; }
button, input { font: inherit; color: inherit; letter-spacing: inherit; }
button { cursor: pointer; border: 0; background: none; }
button:focus-visible, input:focus-visible, a:focus-visible { outline: 3px solid color-mix(in srgb, var(--blue) 55%, transparent); outline-offset: 2px; }
.btn-primary { min-height: 44px; border-radius: 980px; padding: 0 22px; font-weight: 500; font-size: 15px; color: #fff; background: var(--blue); transition: background .15s; }
.btn-primary:hover { background: var(--blue-hover); }
.btn-primary:disabled { opacity: .4; cursor: default; }
.btn-secondary { min-height: 44px; border-radius: 980px; padding: 0 18px; font-weight: 500; color: var(--blue); background: transparent; border: 1px solid var(--blue); }
.btn-plain { color: var(--link); font-weight: 400; }
.btn-plain:hover { text-decoration: underline; }
@keyframes appear { from { opacity: 0; transform: translateY(4px) } to { opacity: 1; transform: none } }
@media (prefers-reduced-motion: reduce) { *, *::before, *::after { animation: none !important; transition: none !important; } }
`;
