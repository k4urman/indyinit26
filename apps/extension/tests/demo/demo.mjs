// One-command live demo: serves the fixture scam pages and opens a browser with
// the built extension loaded and fake scam addresses pointed at this computer.
//   npm run build && npm run demo
// Needs a Chromium that accepts --load-extension (branded Chrome 137+ doesn't):
//   npx playwright-core install chromium      (or set CHROME=/path/to/chromium)
import { existsSync, mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { chromium } from 'playwright-core';
import { startFixtureServer } from '../fixtures/server.mjs';

const here = dirname(fileURLToPath(import.meta.url));
const EXT = join(here, '..', '..', '.output', 'chrome-mv3');
const PORT = 8765;

if (!existsSync(join(EXT, 'manifest.json'))) {
  console.error('Build the extension first: npm run build');
  process.exit(1);
}
const exe = process.env.CHROME ?? chromium.executablePath();
if (!existsSync(exe)) {
  console.error(`No Chromium at ${exe}.\nRun: npx playwright-core install chromium   (or set CHROME=/path/to/chromium)`);
  process.exit(1);
}

const server = await startFixtureServer(PORT);
const profile = mkdtempSync(join(tmpdir(), 'scamshield-demo-'));
const ctx = await chromium.launchPersistentContext(profile, {
  executablePath: exe,
  headless: Boolean(process.env.DEMO_CHECK),
  viewport: null,
  acceptDownloads: true,
  args: [
    `--disable-extensions-except=${EXT}`,
    `--load-extension=${EXT}`,
    '--disable-features=DisableLoadExtensionCommandLineSwitch',
    // Every address resolves to this computer, so the "scam sites" are our local fixtures.
    '--host-resolver-rules=MAP * 127.0.0.1, EXCLUDE localhost',
    '--no-first-run',
    '--start-maximized',
  ],
  ignoreDefaultArgs: ['--disable-extensions', '--hide-scrollbars', '--enable-automation'],
});

const stop = () => {
  server.close();
  rmSync(profile, { recursive: true, force: true });
  process.exit(0);
};
ctx.on('close', stop);
process.on('SIGINT', () => void ctx.close());

const page = ctx.pages()[0] ?? (await ctx.newPage());
await page.goto(`http://start.sentinel.test:${PORT}/`);
if (process.env.DEMO_CHECK) {
  // Self-check: prove the launcher works, then exit.
  await page.screenshot({ path: process.env.DEMO_CHECK });
  console.log(`demo ok: ${await page.title()}`);
  await ctx.close();
} else {
  console.log(`Demo running. Start page: http://start.sentinel.test:${PORT}/  (close the browser to stop)`);
}
