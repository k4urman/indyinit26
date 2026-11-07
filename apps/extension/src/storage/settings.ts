import { browser } from 'wxt/browser';
import { DEFAULT_SETTINGS, STORAGE_KEYS, type Settings } from '../shared/contract';

/** Stored settings merged over defaults, so new fields get sane values. */
export async function getSettings(): Promise<Settings> {
  const got = await browser.storage.local.get(STORAGE_KEYS.settings);
  const s = (got[STORAGE_KEYS.settings] ?? {}) as Partial<Settings>;
  return {
    ...DEFAULT_SETTINGS,
    ...s,
    categories: { ...DEFAULT_SETTINGS.categories, ...s.categories },
    cloud: { ...DEFAULT_SETTINGS.cloud, ...s.cloud },
  };
}

export async function patchSettings(patch: Partial<Settings>): Promise<Settings> {
  const next = { ...(await getSettings()), ...patch };
  await browser.storage.local.set({ [STORAGE_KEYS.settings]: next });
  return next;
}

// ---------------------------------------------------------------------------
// Parent PIN (Child preset). A speed bump, not a lock: see plan.md §7.
// ---------------------------------------------------------------------------

const PBKDF2_ROUNDS = 150_000;

function toHex(buf: ArrayBuffer | Uint8Array): string {
  return [...new Uint8Array(buf)].map((b) => b.toString(16).padStart(2, '0')).join('');
}

function fromHex(hex: string): Uint8Array<ArrayBuffer> {
  const out = new Uint8Array(hex.length / 2);
  for (let i = 0; i < out.length; i++) out[i] = parseInt(hex.slice(i * 2, i * 2 + 2), 16);
  return out;
}

async function derive(pin: string, salt: Uint8Array<ArrayBuffer>): Promise<string> {
  const key = await crypto.subtle.importKey('raw', new TextEncoder().encode(pin), 'PBKDF2', false, ['deriveBits']);
  const bits = await crypto.subtle.deriveBits({ name: 'PBKDF2', hash: 'SHA-256', salt, iterations: PBKDF2_ROUNDS }, key, 256);
  return toHex(bits);
}

export async function setPin(pin: string | null): Promise<void> {
  if (pin === null) {
    const s = await getSettings();
    delete s.pinHash;
    await browser.storage.local.set({ [STORAGE_KEYS.settings]: s });
    return;
  }
  if (!/^\d{4,8}$/.test(pin)) throw new Error('PIN must be 4 to 8 digits');
  const salt = crypto.getRandomValues(new Uint8Array(16));
  await patchSettings({ pinHash: `${toHex(salt)}:${await derive(pin, salt)}` });
}

export async function checkPin(pin: string): Promise<boolean> {
  const { pinHash } = await getSettings();
  if (!pinHash) return true;
  const [salt, hash] = pinHash.split(':');
  if (!salt || !hash) return false;
  const got = await derive(pin, fromHex(salt));
  // Constant-time compare.
  let diff = got.length ^ hash.length;
  for (let i = 0; i < Math.min(got.length, hash.length); i++) diff |= got.charCodeAt(i) ^ hash.charCodeAt(i);
  return diff === 0;
}
