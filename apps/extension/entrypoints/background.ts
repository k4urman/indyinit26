import { browser, type Browser } from 'wxt/browser';
import { ARCHIVE_EXTENSIONS, EXECUTABLE_EXTENSIONS, REMOTE_ACCESS_TOOLS } from '@/src/data/lists';
import { isAnalysable, parseUrl } from '@/src/detectors/domain';
import { analyse } from '@/src/engine/analyse';
import { extUrl } from '@/src/engine/ext-url';
import { isInternal, type ContentRequest, type GateReply, type InternalRequest, type PageResult } from '@/src/engine/messages';
import { shouldPauseDownload } from '@/src/engine/policy';
import { R } from '@/src/engine/reasons';
import type {
  BlockedPage, BlockEvent, Request, Response, ResponseFor, Settings, TabStatus, Verdict,
} from '@/src/shared/contract';
import { getSettings, checkPin, setPin } from '@/src/storage/settings';
import { getLists, lookup, setListEntry } from '@/src/storage/lists';
import { clearLog, expireLog, exportLog, getEvent, getLog, logEvent, setOverride } from '@/src/storage/log';
import { preloadReputation } from '@/src/storage/reputation';

// ---------------------------------------------------------------------------
// Per-tab state, mirrored to storage.session so it survives the worker sleeping.
// ---------------------------------------------------------------------------

interface TabState {
  url: string;
  verdict: Verdict | null;
  events: BlockEvent[];
  logged: string[]; // "page:block", "element:highlight"… already logged for this URL
  scareware: boolean;
}

interface BlockRecord {
  tabId: number;
  originalUrl: string;
  verdict: Verdict;
  eventId: string;
  knownBad: boolean;
}

const session = browser.storage.session;
const tabKey = (id: number) => `tab:${id}`;
const blockKey = (id: string) => `block:${id}`;
const allowOnceKey = (tabId: number) => `allowOnce:${tabId}`;
const LAST_SCARE_KEY = 'lastScareAt';
const SCARE_WINDOW_MS = 30 * 60_000;

async function getTab(tabId: number): Promise<TabState | null> {
  const got = await session.get(tabKey(tabId));
  return (got[tabKey(tabId)] as TabState | undefined) ?? null;
}

async function putTab(tabId: number, s: TabState): Promise<void> {
  await session.set({ [tabKey(tabId)]: s });
}

async function freshTab(tabId: number, url: string): Promise<TabState> {
  const s: TabState = { url, verdict: null, events: [], logged: [], scareware: false };
  await putTab(tabId, s);
  return s;
}

async function allowedOnce(tabId: number, hostname: string): Promise<boolean> {
  const got = await session.get(allowOnceKey(tabId));
  return ((got[allowOnceKey(tabId)] as string[] | undefined) ?? []).includes(hostname);
}

async function allowOnce(tabId: number, hostname: string): Promise<void> {
  const got = await session.get(allowOnceKey(tabId));
  const list = (got[allowOnceKey(tabId)] as string[] | undefined) ?? [];
  await session.set({ [allowOnceKey(tabId)]: [...new Set([...list, hostname])] });
}

async function isIncognito(tabId: number | undefined): Promise<boolean> {
  if (tabId === undefined || tabId < 0) return false;
  try {
    return (await browser.tabs.get(tabId)).incognito;
  } catch {
    return false;
  }
}

/** Log once per (tab, URL, kind) and remember it on the tab for the popup. */
async function record(
  tabId: number | undefined,
  e: Omit<BlockEvent, 'id' | 'ts'>,
  dedupeKey?: string,
): Promise<BlockEvent | null> {
  const tab = tabId !== undefined && tabId >= 0 ? await getTab(tabId) : null;
  if (tab && dedupeKey && tab.logged.includes(dedupeKey)) return null;
  const event = await logEvent(e, await isIncognito(tabId));
  if (tab && tabId !== undefined) {
    tab.events = [...tab.events, event].slice(-20);
    if (dedupeKey) tab.logged.push(dedupeKey);
    await putTab(tabId, tab);
  }
  return event;
}

// ---------------------------------------------------------------------------
// Badge
// ---------------------------------------------------------------------------

async function setBadge(tabId: number, verdict: Verdict | null, enabled: boolean): Promise<void> {
  const action = browser.action ?? (browser as unknown as { browserAction: typeof browser.action }).browserAction;
  try {
    if (!enabled) {
      await action.setBadgeText({ tabId, text: 'off' });
      await action.setBadgeBackgroundColor({ tabId, color: '#6b7280' });
      return;
    }
    const s = verdict?.severity;
    await action.setBadgeText({ tabId, text: s === 'danger' ? '!' : s === 'caution' ? '?' : '' });
    await action.setBadgeBackgroundColor({ tabId, color: s === 'danger' ? '#b91c1c' : '#b45309' });
  } catch {
    // Tab closed.
  }
}

// ---------------------------------------------------------------------------
// Navigation: block known-bad and user-blocked sites before the page loads.
// ---------------------------------------------------------------------------

function blockedPageUrl(blockId: string): string {
  return extUrl(`/blocked.html?id=${encodeURIComponent(blockId)}`);
}

async function onBeforeNavigate(d: { tabId: number; url: string; frameId: number }): Promise<void> {
  if (d.frameId !== 0 || !isAnalysable(d.url)) return;
  const settings = await getSettings();
  await freshTab(d.tabId, d.url);
  if (!settings.enabled) return void setBadge(d.tabId, null, false);

  const a = await analyse(d.url, settings);
  if (!a) return;
  if (await allowedOnce(d.tabId, a.parsed.hostname)) return;
  if (!(a.result.flags.knownBad || a.listed === 'block')) return;

  const event = await record(d.tabId, {
    url: d.url, domain: a.parsed.domain, category: 'page', score: a.result.score, action: 'block', reasons: a.verdict.reasons,
  });
  const blockId = crypto.randomUUID();
  const rec: BlockRecord = {
    tabId: d.tabId, originalUrl: d.url, verdict: a.verdict, eventId: event?.id ?? '', knownBad: a.result.flags.knownBad,
  };
  await session.set({ [blockKey(blockId)]: rec });
  await browser.tabs.update(d.tabId, { url: blockedPageUrl(blockId) });
}

// ---------------------------------------------------------------------------
// Page verdicts from the content script
// ---------------------------------------------------------------------------

async function onPage(tabId: number, signals: InternalRequest & { type: 'ss:page' }): Promise<PageResult | null> {
  const settings = await getSettings();
  const a = await analyse(signals.signals.url, settings, signals.signals);
  if (!a) return null;
  if (await allowedOnce(tabId, a.parsed.hostname)) {
    a.decision.page = 'none';
    a.decision.hardBlock = false;
  }

  const tab = (await getTab(tabId)) ?? (await freshTab(tabId, a.parsed.url));
  tab.url = a.parsed.url;
  tab.verdict = a.verdict;
  if (a.result.flags.scareware) {
    tab.scareware = true;
    await session.set({ [LAST_SCARE_KEY]: Date.now() });
  }
  await putTab(tabId, tab);
  await setBadge(tabId, a.verdict, settings.enabled);

  const base = { url: a.parsed.url, domain: a.parsed.domain, score: a.result.score, reasons: a.verdict.reasons };
  let eventId: string | undefined;
  if (a.decision.page !== 'none') {
    const action = a.decision.page === 'block' ? 'block' : 'warn';
    eventId = (await record(tabId, { ...base, category: 'page', action }, `page:${action}`))?.id;
  }
  if (a.decision.highlights.length > 0) {
    const reasons = [...new Map(a.decision.highlights.map((h) => [h.reason.title, h.reason])).values()].slice(0, 3);
    await record(tabId, { ...base, category: 'element', action: 'highlight', reasons }, 'element:highlight');
  }
  return { verdict: a.verdict, decision: a.decision, ...(eventId ? { eventId } : {}) };
}

// ---------------------------------------------------------------------------
// Downloads (plan.md P3): judge by source page, file type and context; pause and ask.
// ---------------------------------------------------------------------------

function fileNameOf(item: Browser.downloads.DownloadItem): string {
  const fromPath = item.filename?.split(/[\\/]/).pop();
  if (fromPath) return fromPath;
  try {
    return decodeURIComponent(new URL(item.finalUrl || item.url).pathname.split('/').pop() || 'download');
  } catch {
    return 'download';
  }
}

function extOf(name: string): string {
  return name.toLowerCase().split('.').pop() ?? '';
}

async function sourceTab(item: Browser.downloads.DownloadItem): Promise<number | undefined> {
  const ref = item.referrer;
  const tabs = await browser.tabs.query({});
  if (ref) {
    const hit = tabs.find((t) => t.url === ref) ?? tabs.find((t) => t.url && parseUrl(t.url)?.domain === parseUrl(ref)?.domain);
    if (hit?.id !== undefined) return hit.id;
  }
  const [active] = await browser.tabs.query({ active: true, lastFocusedWindow: true });
  return active?.id;
}

async function onDownload(item: Browser.downloads.DownloadItem): Promise<void> {
  const settings = await getSettings();
  if (!settings.enabled || !settings.categories.downloads) return;

  const name = fileNameOf(item);
  const lower = `${name} ${item.finalUrl || item.url}`.toLowerCase();
  const rmm = REMOTE_ACCESS_TOOLS.find((t) => lower.includes(t.replace(/\s/g, '')) || lower.includes(t));
  const ext = extOf(name);
  const executable = EXECUTABLE_EXTENSIONS.has(ext) || ARCHIVE_EXTENSIONS.has(ext) || /\.(pdf|docx?|jpg|png)\.(exe|scr|js|vbs|bat)$/i.test(name);

  const tabId = await sourceTab(item);
  const tab = tabId !== undefined ? await getTab(tabId) : null;
  const pageUrl = item.referrer || tab?.url || item.url;
  const a = await analyse(pageUrl, settings);
  const lastScare = ((await session.get(LAST_SCARE_KEY))[LAST_SCARE_KEY] as number | undefined) ?? 0;
  const pageScore = Math.max(tab?.verdict?.score ?? 0, a?.result.score ?? 0);

  const pause = shouldPauseDownload({
    settings,
    pageScore,
    trusted: a?.trusted ?? false,
    executable,
    remoteAccessTool: Boolean(rmm),
    afterScarePage: Date.now() - lastScare < SCARE_WINDOW_MS || Boolean(tab?.scareware),
  });
  if (!pause) return;

  try {
    await browser.downloads.pause(item.id);
  } catch {
    return; // Already finished (small file); nothing to stop.
  }

  const reasons = [rmm ? R.remoteAccess(rmm.replace(/\b\w/g, (c) => c.toUpperCase())) : R.executable(name), ...(tab?.verdict?.reasons ?? [])].slice(0, 3);
  const verdict: Verdict = {
    url: item.finalUrl || item.url, domain: a?.parsed.domain ?? '', severity: 'caution', score: pageScore, reasons,
    depth: 'basic', checkedAt: Date.now(),
  };
  const event = await record(tabId, {
    url: verdict.url, domain: verdict.domain, category: 'download', score: pageScore, action: 'block', reasons,
  });

  let choice: GateReply['choice'] | null = null;
  if (tabId !== undefined) {
    try {
      const msg: ContentRequest = { type: 'ss:gate', verdict, action: 'download', category: 'downloads' };
      choice = ((await browser.tabs.sendMessage(tabId, msg)) as GateReply | undefined)?.choice ?? null;
    } catch {
      choice = null; // No content script there (e.g. browser page).
    }
  }

  if (choice === null) {
    // Couldn't ask in the page: stay paused and ask through a notification.
    pendingDownloads.set(`dl:${item.id}`, item.id);
    await browser.notifications.create(`dl:${item.id}`, {
      type: 'basic',
      iconUrl: extUrl('/icon/128.png'),
      title: reasons[0]!.title,
      message: `${name} is paused. Click this message only if you are sure and want to download it anyway.`,
    });
    return;
  }
  if (choice === 'back') {
    await browser.downloads.cancel(item.id).catch(() => {});
    await browser.downloads.erase({ id: item.id }).catch(() => {});
    return;
  }
  if (choice === 'trust' && a) await setListEntry(a.parsed.domain, 'allow', 'Trusted from a download warning');
  if (event) await setOverride(event.id, choice === 'trust' ? 'trusted' : 'continued');
  await browser.downloads.resume(item.id).catch(() => {});
}

const pendingDownloads = new Map<string, number>();

// ---------------------------------------------------------------------------
// Link checker (context menu + popup)
// ---------------------------------------------------------------------------

async function checkUrl(raw: string): Promise<Verdict> {
  const url = /^[a-z]+:\/\//i.test(raw.trim()) ? raw.trim() : `https://${raw.trim()}`;
  const a = await analyse(url, await getSettings());
  if (!a) throw new Error('That is not a web address.');
  return a.verdict;
}

// ---------------------------------------------------------------------------
// Message router: contract.ts Requests from the UI, InternalRequests from content.
// ---------------------------------------------------------------------------

async function handleUi(req: Request): Promise<ResponseFor<Request>> {
  switch (req.type) {
    case 'getTabStatus': {
      const [tab, browserTab, lists] = await Promise.all([getTab(req.tabId), browser.tabs.get(req.tabId), getLists()]);
      const url = browserTab.url ?? tab?.url ?? '';
      const parsed = parseUrl(url);
      const status: TabStatus = {
        url,
        domain: parsed?.domain ?? '',
        verdict: tab?.verdict && parsed && tab.verdict.domain === parsed.domain ? tab.verdict : null,
        listed: parsed ? lookup(lists, parsed.hostname) : null,
        recent: tab?.events ?? [],
        incognito: browserTab.incognito,
      };
      return status;
    }
    case 'checkUrl':
      return checkUrl(req.url);
    case 'setList':
      await setListEntry(req.pattern, req.kind, req.note);
      return { ok: true };
    case 'getLog':
      return getLog(req);
    case 'exportLog':
      return exportLog(req.format);
    case 'clearLog':
      await clearLog();
      return { ok: true };
    case 'reportMistake': {
      // The blocked page only knows its block id; accept that too.
      const rec = (await session.get(blockKey(req.eventId)))[blockKey(req.eventId)] as BlockRecord | undefined;
      const e = await getEvent(rec?.eventId || req.eventId);
      if (!e && rec) {
        const p = parseUrl(rec.originalUrl);
        if (p) await setListEntry(p.domain, 'allow', 'Marked safe by you');
        return { ok: true };
      }
      if (!e) throw new Error('That entry is no longer in the history.');
      await setListEntry(e.domain, 'allow', 'Marked safe by you');
      await setOverride(e.id, 'trusted');
      return { ok: true };
    }
    case 'reportScam': {
      const p = parseUrl(req.url);
      if (!p) throw new Error('That is not a web address.');
      await setListEntry(p.hostname, 'block', 'Reported as a scam');
      return { ok: true };
    }
    case 'getBlocked': {
      const rec = (await session.get(blockKey(req.blockId)))[blockKey(req.blockId)] as BlockRecord | undefined;
      if (!rec) throw new Error('This warning has expired. Close this tab to stay safe.');
      const settings = await getSettings();
      const page: BlockedPage = {
        verdict: rec.verdict,
        originalUrl: rec.originalUrl,
        canContinue: !(rec.knownBad && settings.preset === 'child'),
      };
      return page;
    }
    case 'continueAnyway': {
      const rec = (await session.get(blockKey(req.blockId)))[blockKey(req.blockId)] as BlockRecord | undefined;
      if (!rec) throw new Error('This warning has expired.');
      const settings = await getSettings();
      if (rec.knownBad && settings.preset === 'child') throw new Error('This website is blocked.');
      const p = parseUrl(rec.originalUrl);
      if (p) await allowOnce(rec.tabId, p.hostname);
      if (rec.eventId) await setOverride(rec.eventId, 'continued');
      return { url: rec.originalUrl };
    }
    case 'getIncognitoAccess':
      return { allowed: await browser.extension.isAllowedIncognitoAccess() };
    case 'setPin':
      await setPin(req.pin);
      return { ok: true };
    case 'checkPin':
      return { valid: await checkPin(req.pin) };
  }
}

async function handleInternal(req: InternalRequest, sender: Browser.runtime.MessageSender): Promise<unknown> {
  const tabId = sender.tab?.id;
  if (tabId === undefined) throw new Error('no tab');
  // Only the top frame speaks for the page.
  if (sender.frameId !== undefined && sender.frameId !== 0 && req.type === 'ss:page') return null;
  const url = sender.tab?.url ?? '';
  const parsed = parseUrl(url);

  switch (req.type) {
    case 'ss:page':
      return onPage(tabId, req);
    case 'ss:event': {
      const e = await record(tabId, {
        url, domain: parsed?.domain ?? '', category: req.category, score: (await getTab(tabId))?.verdict?.score ?? 0,
        action: req.action, reasons: req.reasons, ...(req.userOverride ? { userOverride: req.userOverride } : {}),
      });
      return { id: e?.id };
    }
    case 'ss:override':
      await setOverride(req.eventId, req.userOverride);
      return { ok: true };
    case 'ss:trust':
      if (parsed) await setListEntry(parsed.domain, 'allow', 'Trusted from a warning');
      return { ok: true };
    case 'ss:scareware':
      await browser.tabs.update(tabId, { muted: true });
      await session.set({ [LAST_SCARE_KEY]: Date.now() });
      return { ok: true };
    case 'ss:goSafe': {
      const safe = req.url && /^https:\/\//.test(req.url) ? req.url : import.meta.env.FIREFOX ? 'about:blank' : 'chrome://newtab/';
      await browser.tabs.update(tabId, { url: safe, muted: false });
      return { ok: true };
    }
  }
}

function onMessage(msg: unknown, sender: Browser.runtime.MessageSender, sendResponse: (r: Response<unknown>) => void): true {
  const work = isInternal(msg)
    ? handleInternal(msg, sender)
    : sender.tab && !sender.url?.startsWith(extUrl('/'))
      ? Promise.reject(new Error('UI requests must come from extension pages'))
      : handleUi(msg as Request);
  work.then(
    (data) => sendResponse({ ok: true, data }),
    (e: unknown) => sendResponse({ ok: false, error: e instanceof Error ? e.message : String(e) }),
  );
  return true;
}

// ---------------------------------------------------------------------------

export default defineBackground(() => {
  preloadReputation();

  browser.runtime.onInstalled.addListener(() => {
    browser.contextMenus.create({ id: 'check-link', title: 'Check this link for scams', contexts: ['link'] });
    browser.alarms.create('expire-log', { periodInMinutes: 60 * 6 });
  });

  browser.alarms.onAlarm.addListener(async (alarm) => {
    if (alarm.name === 'expire-log') await expireLog((await getSettings()).historyDays);
  });

  browser.contextMenus.onClicked.addListener(async (info) => {
    if (info.menuItemId !== 'check-link' || !info.linkUrl) return;
    let title: string;
    let message: string;
    try {
      const v = await checkUrl(info.linkUrl);
      title = v.severity === 'danger' ? 'Do not open this link' : v.severity === 'caution' ? 'Be careful with this link' : 'No problems found';
      message = v.reasons[0] ? `${v.reasons[0].title}. ${v.reasons[0].detail}` : `${v.domain} isn't on any scam list and looks normal.`;
    } catch (e) {
      title = 'Could not check this link';
      message = e instanceof Error ? e.message : String(e);
    }
    await browser.notifications.create({ type: 'basic', iconUrl: extUrl('/icon/128.png'), title, message });
  });

  browser.notifications.onClicked.addListener(async (id) => {
    const dl = pendingDownloads.get(id);
    if (dl === undefined) return;
    pendingDownloads.delete(id);
    await browser.downloads.resume(dl).catch(() => {});
  });

  browser.webNavigation.onBeforeNavigate.addListener((d) => void onBeforeNavigate(d));
  browser.downloads.onCreated.addListener((item) => void onDownload(item));
  browser.tabs.onRemoved.addListener((tabId) => void session.remove([tabKey(tabId), allowOnceKey(tabId)]));
  browser.runtime.onMessage.addListener(onMessage);

  // Master switch: refresh every tab's badge.
  browser.storage.onChanged.addListener(async (changes, area) => {
    if (area !== 'local' || !changes.settings) return;
    const enabled = (changes.settings.newValue as Settings | undefined)?.enabled ?? true;
    for (const t of await browser.tabs.query({})) {
      if (t.id !== undefined) await setBadge(t.id, enabled ? ((await getTab(t.id))?.verdict ?? null) : null, enabled);
    }
  });
});

