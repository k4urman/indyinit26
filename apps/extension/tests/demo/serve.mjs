// Serves only the demo scam pages (no browser), for use with your own Chrome:
//   npm run demo:serve
// then start Chrome with a separate profile and the fake addresses pointed here:
//   google-chrome --user-data-dir=$HOME/.sentinel-demo --host-resolver-rules="MAP * 127.0.0.1, EXCLUDE localhost" http://start.sentinel.test:8765/
// and load the extension once in that profile (chrome://extensions → Load unpacked → .output/chrome-mv3).
import { startFixtureServer } from '../fixtures/server.mjs';

await startFixtureServer(8765);
console.log('Demo pages on http://start.sentinel.test:8765/ (needs the --host-resolver-rules flag). Ctrl+C to stop.');
