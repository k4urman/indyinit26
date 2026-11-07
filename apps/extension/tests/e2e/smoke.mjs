// End-to-end smoke test: loads the built extension (.output/chrome-mv3) into Chrome,
// serves tests/fixtures under fake scam hostnames mapped to 127.0.0.1, and checks
// the engine's verdicts. Run: npm run build && npm run e2e
//
// CHROME=/path/to/chrome overrides the browser. Branded Chrome 137+ ignores
// --load-extension; use Chromium or Chrome for Testing if extensions don't load.
import { createServer } from 'node:http';
import { readFileSync, mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { chromium } from 'playwright-core';

const here = dirname(fileURLToPath(import.meta.url));
const EXT = join(here, '..', '..', '.output', 'chrome-mv3');
const FIX = join(here, '..', 'fixtures');
const PORT = 8765;

const SITES = {
  'chase-secure-verify.com': 'chase-login.html',
  'usps-redelivery.top': 'usps-fee.html',
  'win-defender-alert.xyz': 'scareware.html',
  'quantum-ai-profits.live': 'crypto.html',
  'grannys-quilts.shop': 'legit-shop.html',
};

const server = createServer((req, res) => {
  const host = (req.headers.host ?? '').split(':')[0];
  if (req.url?.endsWith('.exe')) {
    res.writeHead(200, { 'content-type': 'application/octet-stream', 'content-disposition': 'attachment; filename="AnyDesk.exe"' });
    // Big enough that the download is still running when we pause it.
    const chunk = Buffer.alloc(64 * 1024);
    let sent = 0;
    const t = setInterval(() => {
      res.write(chunk);
      if ((sent += chunk.length) > 8 * 1024 * 1024) (clearInterval(t), res.end());
    }, 100);
    req.on('close', () => clearInterval(t));
    return;
  }
  const file = SITES[host];
  if (!file) return res.writeHead(404).end('not found');
  res.writeHead(200, { 'content-type': 'text/html' }).end(readFileSync(join(FIX, file)));
});
await new Promise((r) => server.listen(PORT, '127.0.0.1', r));

const profile = mkdtempSync(join(tmpdir(), 'ss-e2e-'));
const ctx = await chromium.launchPersistentContext(profile, {
  viewport: { width: 1100, height: 720 },
  executablePath: process.env.CHROME ?? '/usr/bin/google-chrome-stable',
  headless: false,
  acceptDownloads: true,
  args: [
    `--disable-extensions-except=${EXT}`,
    `--load-extension=${EXT}`,
    '--disable-features=DisableLoadExtensionCommandLineSwitch',
    `--host-resolver-rules=MAP * 127.0.0.1, EXCLUDE localhost`,
    '--no-first-run',
    '--headless=new',
  ],
});

let failures = 0;
// SHOTS=dir saves a screenshot of what the user sees at each step.
const SHOTS = process.env.SHOTS;
const shot = async (page, name) => SHOTS && page.screenshot({ path: join(SHOTS, `${name}.png`) });

const check = (name, ok, detail = '') => {
  console.log(`${ok ? 'PASS' : 'FAIL'}  ${name}${detail ? `  (${detail})` : ''}`);
  if (!ok) failures++;
};

try {
  const sw = ctx.serviceWorkers()[0] ?? (await ctx.waitForEvent('serviceworker', { timeout: 10_000 }));
  check('extension loaded', Boolean(sw), sw?.url());

  const tabState = async (page) => {
    const tabId = await sw.evaluate(async (url) => (await chrome.tabs.query({})).find((t) => t.url === url)?.id, page.url());
    const s = await sw.evaluate(async (id) => (await chrome.storage.session.get(`tab:${id}`))[`tab:${id}`], tabId);
    const badge = await sw.evaluate(async (id) => chrome.action.getBadgeText({ tabId: id }), tabId);
    return { tabId, verdict: s?.verdict, events: s?.events ?? [], badge };
  };

  const visit = async (host, settle = 2500) => {
    const page = await ctx.newPage();
    await page.goto(`http://${host}:${PORT}/`);
    await page.waitForTimeout(settle);
    return page;
  };

  // 1. Lookalike bank login.
  {
    const page = await visit('chase-secure-verify.com');
    const { verdict, events, badge } = await tabState(page);
    await shot(page, '1-chase-lookalike');
    check('chase lookalike: danger', verdict?.severity === 'danger', `score ${verdict?.score}`);
    check('chase lookalike: safe alternative is chase.com', verdict?.safeAlternative?.url === 'https://chase.com/');
    check('chase lookalike: page block logged', events.some((e) => e.category === 'page' && e.action === 'block'));
    check('chase lookalike: badge', badge === '!', badge);
    console.log('      reasons:', verdict?.reasons.map((r) => r.title).join(' | '));
    await page.close();
  }

  // 2. USPS fee.
  {
    const page = await visit('usps-redelivery.top');
    const { verdict } = await tabState(page);
    await shot(page, '2-usps-fee');
    check('usps fee: danger', verdict?.severity === 'danger', `score ${verdict?.score}`);
    console.log('      reasons:', verdict?.reasons.map((r) => r.title).join(' | '));
    await page.close();
  }

  // 3. Scareware: needs the main-world hooks to see fullscreen.
  {
    const page = await visit('win-defender-alert.xyz', 1000);
    await page.mouse.click(200, 200);
    await page.waitForTimeout(2500);
    const { verdict, tabId } = await tabState(page);
    const muted = await sw.evaluate(async (id) => (await chrome.tabs.get(id)).mutedInfo?.muted, tabId);
    await shot(page, '3-scareware');
    check('scareware: danger', verdict?.severity === 'danger', `score ${verdict?.score}`);
    check('scareware: tab muted', muted === true);
    const inFullscreen = await page.evaluate(() => Boolean(document.fullscreenElement));
    check('scareware: fullscreen exited', !inFullscreen);

    // Remote-access download right after the scare page is paused.
    const dl = await ctx.newPage();
    await dl.goto(`http://win-defender-alert.xyz:${PORT}/`).catch(() => {});
    await dl.evaluate((port) => {
      const a = document.createElement('a');
      a.href = `http://win-defender-alert.xyz:${port}/AnyDesk.exe`;
      a.download = 'AnyDesk.exe';
      document.body.append(a);
      a.click();
    }, PORT);
    await dl.waitForTimeout(2000);
    const downloads = await sw.evaluate(async () => chrome.downloads.search({}));
    const any = downloads.find((d) => /anydesk/i.test(`${d.filename} ${d.url} ${d.finalUrl}`));
    if (!any) console.log('      downloads seen:', JSON.stringify(downloads.map((d) => ({ url: d.url, state: d.state, paused: d.paused }))));
    await shot(dl, '4-anydesk-download');
    check('anydesk download paused', any?.paused === true, any ? `state ${any.state}, paused ${any.paused}` : 'no download seen');
    await page.close();
    await dl.close();
  }

  // 4. Fake crypto platform.
  {
    const page = await visit('quantum-ai-profits.live');
    const { verdict } = await tabState(page);
    await shot(page, '5-crypto');
    check('crypto platform: caution or worse', ['caution', 'danger'].includes(verdict?.severity), `score ${verdict?.score}`);
    console.log('      reasons:', verdict?.reasons.map((r) => r.title).join(' | '));
    await page.close();
  }

  // 5. Control: ordinary small shop must not be blocked at Balanced.
  {
    const page = await visit('grannys-quilts.shop');
    const { verdict, events } = await tabState(page);
    await shot(page, '6-small-shop-balanced');
    check('small shop: not blocked', verdict && verdict.severity !== 'danger' && !events.some((e) => e.action === 'block'), `score ${verdict?.score}, ${verdict?.severity}`);
    await page.close();
  }

  // 5b. Strict pauses card entry on an unfamiliar shop (the gate), without blocking the page.
  {
    await sw.evaluate(async () => {
      const { settings } = await chrome.storage.local.get('settings');
      await chrome.storage.local.set({ settings: { ...(settings ?? {}), aggressiveness: 66 } });
    });
    const page = await visit('grannys-quilts.shop');
    await page.focus('#cc');
    await page.waitForTimeout(800);
    const { events } = await tabState(page);
    const focused = await page.evaluate(() => document.activeElement?.id);
    await shot(page, '7-small-shop-strict-card');
    check('strict: card entry paused', events.some((e) => e.category === 'transaction' && e.action === 'block'), `events ${events.map((e) => e.category).join(',')}`);
    check('strict: card field not focused while paused', focused !== 'cc', `active ${focused}`);
    await sw.evaluate(async () => {
      const { settings } = await chrome.storage.local.get('settings');
      await chrome.storage.local.set({ settings: { ...settings, aggressiveness: 33 } });
    });
    await page.close();
  }

  // 6. Known-bad host from the bundled list is redirected before load.
  {
    const host = process.env.KNOWN_BAD_HOST;
    if (host) {
      const page = await ctx.newPage();
      await page.goto(`http://${host}:${PORT}/`).catch(() => {});
      await page.waitForTimeout(1500);
      // blocked.html is the frontend's; until it lands the redirect ends on an error page, so check the record.
      const blocks = await sw.evaluate(async () => Object.entries(await chrome.storage.session.get(null)).filter(([k]) => k.startsWith('block:')).map(([, v]) => v.originalUrl));
      check('known-bad: redirected to blocked page', blocks.some((u) => u.includes(host)), page.url());
      await page.close();
    } else {
      console.log('SKIP  known-bad (set KNOWN_BAD_HOST to a host from the feed)');
    }
  }

  // 7. Link checker message (popup path).
  {
    const ext = await ctx.newPage();
    await ext.goto(sw.url().replace('background.js', 'icon/16.png'));
    const r = await ext.evaluate(() => chrome.runtime.sendMessage({ type: 'checkUrl', url: 'paypa1.com/signin' }));
    check('checkUrl: lookalike flagged', r?.ok && r.data.reasons[0]?.title.includes('PayPal'), JSON.stringify(r?.data?.reasons?.[0]?.title));
    const stats = await ext.evaluate(() => chrome.storage.local.get('stats'));
    check('stats counted', (stats.stats?.blocked?.page ?? 0) >= 2, JSON.stringify(stats.stats?.blocked));
    await ext.close();
  }
} catch (e) {
  console.error(e);
  failures++;
} finally {
  await ctx.close();
  server.close();
  rmSync(profile, { recursive: true, force: true });
}
console.log(failures ? `\n${failures} failed` : '\nall passed');
process.exit(failures ? 1 : 0);
