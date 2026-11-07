// Serves the demo fixtures by Host header, so a browser started with
// --host-resolver-rules="MAP * 127.0.0.1" sees them at realistic scam addresses.
// Nothing here is reachable from outside this machine (binds 127.0.0.1).
import { createServer } from 'node:http';
import { readFileSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const FIX = dirname(fileURLToPath(import.meta.url));

export const SITES = {
  'start.sentinel.test': 'start.html',
  'chase-secure-verify.com': 'chase-login.html',
  'usps-redelivery.top': 'usps-fee.html',
  'win-defender-alert.xyz': 'scareware.html',
  'quantum-ai-profits.live': 'crypto.html',
  'grannys-quilts.shop': 'legit-shop.html',
  'captcha-verify-human.online': 'clickfix.html',
  'irs-tax-resolution.help': 'irs-giftcard.html',
};

export function startFixtureServer(port = 8765) {
  const server = createServer((req, res) => {
    const host = (req.headers.host ?? '').split(':')[0];
    if (req.url?.toLowerCase().endsWith('.exe')) {
      // A slow fake installer, so the download is still running when the engine pauses it.
      res.writeHead(200, { 'content-type': 'application/octet-stream', 'content-disposition': 'attachment; filename="AnyDesk.exe"' });
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
    if (!file) return res.writeHead(404, { 'content-type': 'text/plain' }).end('not found');
    res.writeHead(200, { 'content-type': 'text/html' }).end(readFileSync(join(FIX, file)));
  });
  return new Promise((resolve) => server.listen(port, '127.0.0.1', () => resolve(server)));
}
