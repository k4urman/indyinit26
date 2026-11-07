import { browser } from 'wxt/browser';
import { STORAGE_KEYS, type ListEntry } from '../shared/contract';

/** User allow/block lists. storage.local only (plan.md §2.3). */
export async function getLists(): Promise<ListEntry[]> {
  const got = await browser.storage.local.get(STORAGE_KEYS.lists);
  return (got[STORAGE_KEYS.lists] as ListEntry[] | undefined) ?? [];
}

export function normalisePattern(raw: string): string | null {
  let p = raw.trim().toLowerCase();
  if (!p) return null;
  if (/^[a-z]+:\/\//.test(p)) {
    try {
      p = new URL(p).hostname;
    } catch {
      return null;
    }
  }
  p = p.replace(/\/.*$/, '').replace(/^www\./, '');
  return /^(\*\.)?([a-z0-9-]+\.)+[a-z0-9-]{2,}$/.test(p) || /^[a-z0-9-]+\.localhost$/.test(p) ? p : null;
}

/** "example.com" covers the domain and its subdomains; "*.example.com" only subdomains. */
export function matches(pattern: string, hostname: string): boolean {
  if (pattern.startsWith('*.')) return hostname.endsWith(pattern.slice(1));
  return hostname === pattern || hostname.endsWith('.' + pattern);
}

export function lookup(entries: ListEntry[], hostname: string): 'allow' | 'block' | null {
  // Block wins over allow when both match, except an exact allow for this host.
  let result: 'allow' | 'block' | null = null;
  for (const e of entries) {
    if (!matches(e.pattern, hostname)) continue;
    if (e.kind === 'allow' && e.pattern === hostname) return 'allow';
    if (e.kind === 'block') result = 'block';
    else result ??= 'allow';
  }
  return result;
}

export async function setListEntry(rawPattern: string, kind: 'allow' | 'block' | null, note?: string): Promise<void> {
  const pattern = normalisePattern(rawPattern);
  if (!pattern) throw new Error(`Not a valid web address: ${rawPattern}`);
  const entries = (await getLists()).filter((e) => e.pattern !== pattern);
  if (kind) entries.push({ pattern, kind, addedAt: Date.now(), ...(note ? { note } : {}) });
  await browser.storage.local.set({ [STORAGE_KEYS.lists]: entries });
}
