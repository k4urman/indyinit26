import Dexie, { type EntityTable } from 'dexie';
import { browser } from 'wxt/browser';
import { STORAGE_KEYS, type BlockEvent, type EventCategory, type Stats } from '../shared/contract';

/** Block log in IndexedDB (plan.md §5). Never written from private windows. */
const db = new Dexie('scamshield') as Dexie & { events: EntityTable<BlockEvent, 'id'> };
db.version(1).stores({ events: 'id, ts, domain, category' });

const EMPTY_BLOCKED: Record<EventCategory, number> = {
  page: 0, element: 0, download: 0, transaction: 0, upload: 0, personalInfo: 0, ad: 0,
};

function today(): string {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
}

export async function getStats(): Promise<Stats> {
  const got = await browser.storage.local.get(STORAGE_KEYS.stats);
  const s = got[STORAGE_KEYS.stats] as Stats | undefined;
  const fresh: Stats = { blocked: { ...EMPTY_BLOCKED }, warned: 0, today: { date: today(), blocked: 0 }, since: Date.now() };
  if (!s) return fresh;
  return { ...fresh, ...s, blocked: { ...EMPTY_BLOCKED, ...s.blocked } };
}

// Serialise counter updates; several tabs can report at once.
let statsQueue: Promise<unknown> = Promise.resolve();

function bumpStats(e: BlockEvent): Promise<unknown> {
  statsQueue = statsQueue.then(async () => {
    const s = await getStats();
    if (s.today.date !== today()) s.today = { date: today(), blocked: 0 };
    if (e.action === 'warn') s.warned++;
    else {
      s.blocked[e.category]++;
      s.today.blocked++;
    }
    await browser.storage.local.set({ [STORAGE_KEYS.stats]: s });
  });
  return statsQueue;
}

export async function logEvent(e: Omit<BlockEvent, 'id' | 'ts'>, incognito: boolean): Promise<BlockEvent> {
  const event: BlockEvent = { ...e, id: crypto.randomUUID(), ts: Date.now() };
  if (incognito) return event; // count nothing, keep nothing
  await db.events.add(event);
  // Highlights are noise in the "threats stopped" counter.
  if (event.action !== 'highlight') await bumpStats(event);
  return event;
}

export async function setOverride(id: string, userOverride: BlockEvent['userOverride']): Promise<BlockEvent | undefined> {
  await db.events.update(id, { userOverride });
  return db.events.get(id);
}

export function getEvent(id: string): Promise<BlockEvent | undefined> {
  return db.events.get(id);
}

export async function getLog(opts: { category?: EventCategory; limit?: number; before?: number }): Promise<BlockEvent[]> {
  const limit = Math.min(opts.limit ?? 100, 1000);
  let q = db.events.where('ts').below(opts.before ?? Infinity).reverse();
  if (opts.category) q = q.filter((e) => e.category === opts.category);
  return q.limit(limit).toArray();
}

export async function clearLog(): Promise<void> {
  await db.events.clear();
}

export async function expireLog(days: number): Promise<void> {
  await db.events.where('ts').below(Date.now() - days * 86_400_000).delete();
}

export async function exportLog(format: 'json' | 'csv'): Promise<{ filename: string; text: string }> {
  const rows = await db.events.orderBy('ts').toArray();
  const stamp = today();
  if (format === 'json') return { filename: `scamshield-log-${stamp}.json`, text: JSON.stringify(rows, null, 2) };
  const esc = (v: unknown) => `"${String(v ?? '').replace(/"/g, '""')}"`;
  const header = ['time', 'domain', 'url', 'category', 'action', 'reasons', 'userOverride'];
  const lines = rows.map((e) =>
    [new Date(e.ts).toISOString(), e.domain, e.url, e.category, e.action, e.reasons.map((r) => r.title).join('; '), e.userOverride]
      .map(esc)
      .join(','),
  );
  return { filename: `scamshield-log-${stamp}.csv`, text: [header.join(','), ...lines].join('\n') };
}
