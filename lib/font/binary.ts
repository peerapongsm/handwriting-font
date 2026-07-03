/** Minimal big-endian binary writer for building sfnt (TTF) table data. */
export class ByteWriter {
  private bytes: number[] = [];

  get length(): number {
    return this.bytes.length;
  }

  u8(v: number): void {
    this.bytes.push(v & 0xff);
  }

  /** Writes a 16-bit big-endian value. Works for both signed and unsigned inputs
   *  (negative numbers are wrapped to their two's-complement 16-bit bit pattern). */
  u16(v: number): void {
    const uv = v & 0xffff;
    this.u8(uv >> 8);
    this.u8(uv & 0xff);
  }

  /** Writes a 32-bit big-endian value (signed or unsigned). */
  u32(v: number): void {
    const uv = v >>> 0;
    this.u8((uv >>> 24) & 0xff);
    this.u8((uv >>> 16) & 0xff);
    this.u8((uv >>> 8) & 0xff);
    this.u8(uv & 0xff);
  }

  /** Writes a signed 64-bit big-endian value (used for head table LONGDATETIME). */
  u64(v: bigint): void {
    for (let shift = 56n; shift >= 0n; shift -= 8n) {
      this.u8(Number((v >> shift) & 0xffn));
    }
  }

  tag(str: string): void {
    if (str.length !== 4) throw new Error(`tag must be exactly 4 chars: "${str}"`);
    for (let i = 0; i < 4; i++) this.u8(str.charCodeAt(i));
  }

  bytesArray(arr: readonly number[] | Uint8Array): void {
    for (const b of arr) this.u8(b);
  }

  padTo4(): void {
    while (this.bytes.length % 4 !== 0) this.u8(0);
  }

  padToEven(): void {
    if (this.bytes.length % 2 !== 0) this.u8(0);
  }

  toUint8Array(): Uint8Array {
    return new Uint8Array(this.bytes);
  }
}

/** Sum of the bytes as big-endian uint32 words, zero-padded to a multiple of 4. Mod 2^32. */
export function tableChecksum(bytes: Uint8Array): number {
  let sum = 0;
  const len = bytes.length;
  for (let i = 0; i < len; i += 4) {
    const b0 = bytes[i] ?? 0;
    const b1 = bytes[i + 1] ?? 0;
    const b2 = bytes[i + 2] ?? 0;
    const b3 = bytes[i + 3] ?? 0;
    const word = ((b0 << 24) | (b1 << 16) | (b2 << 8) | b3) >>> 0;
    sum = (sum + word) >>> 0;
  }
  return sum >>> 0;
}
