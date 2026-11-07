/**
 * Sentinel look for extension pages (popup, blocked page): dark frosted glass,
 * one violet-to-cyan accent. Matches the in-page UI in src/ui/inpage.
 */
export const THEME_CSS = `
:root {
  --bg: #070b18; --panel: rgba(255,255,255,.04); --panel2: rgba(255,255,255,.07); --line: rgba(255,255,255,.09); --line2: rgba(255,255,255,.16);
  --text: #f5f7ff; --muted: #a8b0c8; --dim: #7c86a3;
  --a1: #7c5cff; --a2: #22d3ee; --danger: #ff5d6c; --warn: #ffb547; --safe: #3ee089;
  color-scheme: dark;
}
* { box-sizing: border-box; margin: 0; padding: 0; }
html, body { background: var(--bg); color: var(--text);
  font: 400 15px/1.5 ui-sans-serif, -apple-system, "Segoe UI Variable", "Segoe UI", system-ui, Roboto, "Helvetica Neue", Arial, sans-serif;
  -webkit-font-smoothing: antialiased; }
button, input { font: inherit; color: inherit; }
button { cursor: pointer; border: 0; background: none; }
button:focus-visible, input:focus-visible { outline: 2px solid var(--a2); outline-offset: 2px; }
.glow { position: fixed; inset: -40% -20% auto; height: 70%; pointer-events: none;
  background: radial-gradient(260px 180px at 25% 40%, rgba(124,92,255,.35), transparent 70%), radial-gradient(240px 160px at 80% 30%, rgba(34,211,238,.22), transparent 70%); }
.grad-text { background: linear-gradient(90deg, #a68bff, var(--a2)); -webkit-background-clip: text; background-clip: text; color: transparent; }
.btn-primary { min-height: 48px; border-radius: 14px; font-weight: 700; color: #fff; padding: 0 18px;
  background: linear-gradient(135deg, var(--a1), #4f7cff 55%, var(--a2)); box-shadow: 0 10px 26px rgba(92,110,255,.4), 0 1px 0 rgba(255,255,255,.22) inset;
  transition: transform .15s, box-shadow .15s; }
.btn-primary:hover { transform: translateY(-1px); box-shadow: 0 14px 32px rgba(92,110,255,.5), 0 1px 0 rgba(255,255,255,.22) inset; }
.btn-primary:disabled { opacity: .5; transform: none; cursor: default; }
.btn-ghost { min-height: 40px; border-radius: 12px; padding: 0 12px; color: var(--muted); border: 1px solid var(--line2); background: var(--panel); font-weight: 600; font-size: 13.5px; transition: .15s; }
.btn-ghost:hover { color: var(--text); background: var(--panel2); }
.btn-ghost[aria-pressed="true"] { color: var(--text); border-color: rgba(124,92,255,.6); background: rgba(124,92,255,.18); }
@keyframes rise { from { opacity: 0; transform: translateY(6px) } to { opacity: 1; transform: none } }
@keyframes pop { from { opacity: 0; transform: scale(.96) } to { opacity: 1; transform: none } }
@keyframes spin { to { transform: rotate(360deg) } }
@media (prefers-reduced-motion: reduce) { *, *::before, *::after { animation: none !important; transition: none !important; } }
`;
