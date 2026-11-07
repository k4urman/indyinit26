/**
 * Bloom filter for the known-bad host list. No imports: the list build script
 * (scripts/build-lists.ts) runs this file directly under Node.
 *
 * File layout: 4-byte magic "SSBF", u32 bit count, u32 hash count, then the bits.
 */
const MAGIC = 0x53534246;

function hashes(s: string): [number, number] {
  // FNV-1a and a murmur-style mix, over UTF-16 code units (hostnames are ASCII/punycode).
  let h1 = 0x811c9dc5;
  let h2 = 0x9747b28c;
  for (let i = 0; i < s.length; i++) {
    const c = s.charCodeAt(i);
    h1 = Math.imul(h1 ^ c, 0x01000193);
    h2 = Math.imul(h2 ^ c, 0x5bd1e995);
    h2 ^= h2 >>> 15;
  }
  h2 = Math.imul(h2 ^ (h2 >>> 13), 0xc2b2ae35);
  return [h1 >>> 0, ((h2 ^ (h2 >>> 16)) | 1) >>> 0];
}

export class Bloom {
  readonly bits: Uint8Array;
  readonly m: number;
  readonly k: number;

  constructor(bits: Uint8Array, m: number, k: number) {
    this.bits = bits;
    this.m = m;
    this.k = k;
  }

  static create(n: number, falsePositiveRate: number): Bloom {
    const m = Math.ceil((-n * Math.log(falsePositiveRate)) / Math.LN2 ** 2);
    const k = Math.max(1, Math.round((m / n) * Math.LN2));
    return new Bloom(new Uint8Array(Math.ceil(m / 8)), m, k);
  }

  add(s: string): void {
    const [a, b] = hashes(s);
    for (let i = 0; i < this.k; i++) {
      const bit = (a + Math.imul(i, b)) >>> 0;
      const idx = bit % this.m;
      this.bits[idx >>> 3]! |= 1 << (idx & 7);
    }
  }

  has(s: string): boolean {
    const [a, b] = hashes(s);
    for (let i = 0; i < this.k; i++) {
      const idx = ((a + Math.imul(i, b)) >>> 0) % this.m;
      if ((this.bits[idx >>> 3]! & (1 << (idx & 7))) === 0) return false;
    }
    return true;
  }

  serialize(): Uint8Array {
    const out = new Uint8Array(12 + this.bits.length);
    const v = new DataView(out.buffer);
    v.setUint32(0, MAGIC);
    v.setUint32(4, this.m);
    v.setUint32(8, this.k);
    out.set(this.bits, 12);
    return out;
  }

  static deserialize(buf: ArrayBuffer): Bloom {
    const v = new DataView(buf);
    if (v.getUint32(0) !== MAGIC) throw new Error('not a bloom filter file');
    return new Bloom(new Uint8Array(buf, 12), v.getUint32(4), v.getUint32(8));
  }
}
