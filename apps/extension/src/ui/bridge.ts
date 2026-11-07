/**
 * How UI pages talk to the background: unwraps the `Response<T>` envelope from
 * contract.ts, and falls back to the dev mock when opened outside the extension.
 */
import { browser } from 'wxt/browser';
import type { Request, Response, ResponseFor } from '../shared/contract';

export const IS_EXTENSION = typeof browser !== 'undefined' && Boolean(browser.runtime?.id);

export async function sendMsg<T = unknown>(req: Request): Promise<T> {
  if (!IS_EXTENSION) {
    const { sendMessage } = await import('./dev/mock-background');
    return sendMessage(req as never) as Promise<T>;
  }
  const res = (await browser.runtime.sendMessage(req)) as Response<ResponseFor<typeof req>> | undefined;
  if (!res) throw new Error('No reply from the background');
  if (!res.ok) throw new Error(res.error);
  return res.data as T;
}

export async function readStorage<T>(key: string, fallback: T): Promise<T> {
  if (!IS_EXTENSION) {
    const { getMockState } = await import('./dev/mock-background');
    return ((getMockState() as unknown as Record<string, unknown>)[key] as T) ?? fallback;
  }
  const got = await browser.storage.local.get(key);
  return (got[key] as T) ?? fallback;
}

export async function writeStorage(key: string, value: unknown): Promise<void> {
  if (IS_EXTENSION) await browser.storage.local.set({ [key]: value });
}

import type { Stats } from '../shared/contract';

export const EMPTY_STATS: Stats = {
  blocked: { page: 0, element: 0, download: 0, transaction: 0, upload: 0, personalInfo: 0, ad: 0 },
  warned: 0,
  today: { date: '', blocked: 0 },
  since: Date.now(),
};

/** "Threats stopped" across every category. */
export function totalBlocked(s: Stats): number {
  return Object.values(s.blocked ?? {}).reduce((a, b) => a + b, 0);
}
