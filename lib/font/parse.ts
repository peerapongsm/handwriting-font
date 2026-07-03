// Minimal TTF parser — test-only. Exists purely so lib/font/ttf.ts can be
// round-trip tested (encode -> parse -> compare) instead of trusting the
// encoder blindly. Not imported from any app code.
import { tableChecksum } from "./binary";
import type { Contour } from "./types";

class ByteReader {
  constructor(private bytes: Uint8Array) {}

  u8(offset: number): number {
    return this.bytes[offset];
  }
  u16(offset: number): number {
    return (this.bytes[offset] << 8) | this.bytes[offset + 1];
  }
  i16(offset: number): number {
    const v = this.u16(offset);
    return v >= 0x8000 ? v - 0x10000 : v;
  }
  u32(offset: number): number {
    return (
      (this.bytes[offset] * 0x1000000 +
        (this.bytes[offset + 1] << 16) +
        (this.bytes[offset + 2] << 8) +
        this.bytes[offset + 3]) >>>
      0
    );
  }
  i32(offset: number): number {
    const v = this.u32(offset);
    return v >= 0x80000000 ? v - 0x100000000 : v;
  }
  tag(offset: number): string {
    return String.fromCharCode(this.bytes[offset], this.bytes[offset + 1], this.bytes[offset + 2], this.bytes[offset + 3]);
  }
}

export interface ParsedGlyph {
  advanceWidth: number;
  lsb: number;
  contours: Contour[];
}

export interface ParsedFont {
  unitsPerEm: number;
  ascender: number;
  descender: number;
  numGlyphs: number;
  checkSumAdjustment: number;
  indexToLocFormat: number;
  glyphs: ParsedGlyph[];
  cmap: Map<number, number>;
  familyName: string | null;
  styleName: string | null;
}

interface TableRecord {
  tag: string;
  checksum: number;
  offset: number;
  length: number;
}

function readTableDirectory(r: ByteReader, bytes: Uint8Array): Map<string, TableRecord> {
  const numTables = r.u16(4);
  const dir = new Map<string, TableRecord>();
  for (let i = 0; i < numTables; i++) {
    const base = 12 + i * 16;
    const tag = r.tag(base);
    dir.set(tag, {
      tag,
      checksum: r.u32(base + 4),
      offset: r.u32(base + 8),
      length: r.u32(base + 12),
    });
  }
  return dir;
}

function requireTable(dir: Map<string, TableRecord>, tag: string): TableRecord {
  const t = dir.get(tag);
  if (!t) throw new Error(`missing required table: ${tag}`);
  return t;
}

function parseGlyf(r: ByteReader, offset: number, length: number): Contour[] {
  if (length === 0) return [];
  const numberOfContours = r.i16(offset);
  if (numberOfContours < 0) throw new Error("composite glyphs are not supported by this minimal parser");

  let p = offset + 10;
  const endPts: number[] = [];
  for (let i = 0; i < numberOfContours; i++) {
    endPts.push(r.u16(p));
    p += 2;
  }
  const numPoints = numberOfContours === 0 ? 0 : endPts[endPts.length - 1] + 1;

  const instructionLength = r.u16(p);
  p += 2 + instructionLength;

  const flags: number[] = [];
  while (flags.length < numPoints) {
    const flag = r.u8(p);
    p += 1;
    flags.push(flag);
    if (flag & 0x08) {
      const repeat = r.u8(p);
      p += 1;
      for (let i = 0; i < repeat; i++) flags.push(flag);
    }
  }

  const xs: number[] = [];
  let x = 0;
  for (const flag of flags) {
    if (flag & 0x02) {
      const dx = r.u8(p);
      p += 1;
      x += flag & 0x10 ? dx : -dx;
    } else if (!(flag & 0x10)) {
      x += r.i16(p);
      p += 2;
    }
    xs.push(x);
  }

  const ys: number[] = [];
  let y = 0;
  for (const flag of flags) {
    if (flag & 0x04) {
      const dy = r.u8(p);
      p += 1;
      y += flag & 0x20 ? dy : -dy;
    } else if (!(flag & 0x20)) {
      y += r.i16(p);
      p += 2;
    }
    ys.push(y);
  }

  const contours: Contour[] = [];
  let start = 0;
  for (const end of endPts) {
    const contour: Contour = [];
    for (let i = start; i <= end; i++) {
      contour.push({ x: xs[i], y: ys[i], onCurve: (flags[i] & 0x01) !== 0 });
    }
    contours.push(contour);
    start = end + 1;
  }
  return contours;
}

function parseCmapFormat4(r: ByteReader, subtableOffset: number): Map<number, number> {
  const format = r.u16(subtableOffset);
  if (format !== 4) throw new Error(`unsupported cmap subtable format: ${format}`);
  const segCountX2 = r.u16(subtableOffset + 6);
  const segCount = segCountX2 / 2;

  const endCodeOff = subtableOffset + 14;
  const startCodeOff = endCodeOff + segCountX2 + 2; // + reservedPad
  const idDeltaOff = startCodeOff + segCountX2;
  const idRangeOffsetOff = idDeltaOff + segCountX2;

  const map = new Map<number, number>();
  for (let s = 0; s < segCount; s++) {
    const end = r.u16(endCodeOff + s * 2);
    const start = r.u16(startCodeOff + s * 2);
    const idDelta = r.i16(idDeltaOff + s * 2);
    const idRangeOffset = r.u16(idRangeOffsetOff + s * 2);
    if (start === 0xffff && end === 0xffff) continue;
    for (let cp = start; cp <= end; cp++) {
      let glyphId: number;
      if (idRangeOffset === 0) {
        glyphId = (cp + idDelta) & 0xffff;
      } else {
        const glyphIndexAddr = idRangeOffsetOff + s * 2 + idRangeOffset + 2 * (cp - start);
        const raw = r.u16(glyphIndexAddr);
        glyphId = raw === 0 ? 0 : (raw + idDelta) & 0xffff;
      }
      if (glyphId !== 0) map.set(cp, glyphId);
    }
  }
  return map;
}

function parseName(r: ByteReader, offset: number): { familyName: string | null; styleName: string | null } {
  const count = r.u16(offset + 2);
  const storageOffset = r.u16(offset + 4);
  let familyName: string | null = null;
  let styleName: string | null = null;
  for (let i = 0; i < count; i++) {
    const base = offset + 6 + i * 12;
    const platformId = r.u16(base);
    const nameId = r.u16(base + 6);
    const strLength = r.u16(base + 8);
    const strOffset = r.u16(base + 10);
    if (platformId !== 3) continue;
    const strStart = offset + storageOffset + strOffset;
    let value = "";
    for (let b = 0; b < strLength; b += 2) {
      value += String.fromCharCode(r.u16(strStart + b));
    }
    if (nameId === 1) familyName = value;
    if (nameId === 2) styleName = value;
  }
  return { familyName, styleName };
}

/** Lists the sfnt table tags present in the file (e.g. to assert "OS/2" was written). */
export function listTableTags(bytes: Uint8Array): string[] {
  const r = new ByteReader(bytes);
  return [...readTableDirectory(r, bytes).keys()];
}

export function parseTTF(bytes: Uint8Array): ParsedFont {
  const r = new ByteReader(bytes);
  const dir = readTableDirectory(r, bytes);

  const head = requireTable(dir, "head");
  const unitsPerEm = r.u16(head.offset + 18);
  const checkSumAdjustment = r.u32(head.offset + 8);
  const indexToLocFormat = r.i16(head.offset + 50);

  const hhea = requireTable(dir, "hhea");
  const ascender = r.i16(hhea.offset + 4);
  const descender = r.i16(hhea.offset + 6);
  const numberOfHMetrics = r.u16(hhea.offset + 34);

  const maxp = requireTable(dir, "maxp");
  const numGlyphs = r.u16(maxp.offset + 4);

  const loca = requireTable(dir, "loca");
  const glyf = requireTable(dir, "glyf");
  const locaOffsets: number[] = [];
  for (let i = 0; i <= numGlyphs; i++) {
    locaOffsets.push(indexToLocFormat === 0 ? r.u16(loca.offset + i * 2) * 2 : r.u32(loca.offset + i * 4));
  }

  const hmtx = requireTable(dir, "hmtx");
  let lastAdvance = 0;
  const glyphs: ParsedGlyph[] = [];
  for (let i = 0; i < numGlyphs; i++) {
    let advanceWidth: number;
    let lsb: number;
    if (i < numberOfHMetrics) {
      advanceWidth = r.u16(hmtx.offset + i * 4);
      lsb = r.i16(hmtx.offset + i * 4 + 2);
      lastAdvance = advanceWidth;
    } else {
      advanceWidth = lastAdvance;
      lsb = r.i16(hmtx.offset + numberOfHMetrics * 4 + (i - numberOfHMetrics) * 2);
    }
    const glyfStart = glyf.offset + locaOffsets[i];
    const glyfLength = locaOffsets[i + 1] - locaOffsets[i];
    glyphs.push({ advanceWidth, lsb, contours: parseGlyf(r, glyfStart, glyfLength) });
  }

  const cmapTable = requireTable(dir, "cmap");
  const cmapSubtableCount = r.u16(cmapTable.offset + 2);
  let cmapSubtableOffset: number | null = null;
  for (let i = 0; i < cmapSubtableCount; i++) {
    const base = cmapTable.offset + 4 + i * 8;
    const platformId = r.u16(base);
    const encodingId = r.u16(base + 2);
    const offset = r.u32(base + 4);
    if ((platformId === 3 && encodingId === 1) || (platformId === 0 && encodingId === 3)) {
      cmapSubtableOffset = cmapTable.offset + offset;
      break;
    }
  }
  const cmap = cmapSubtableOffset !== null ? parseCmapFormat4(r, cmapSubtableOffset) : new Map<number, number>();

  const nameTable = requireTable(dir, "name");
  const { familyName, styleName } = parseName(r, nameTable.offset);

  return { unitsPerEm, ascender, descender, numGlyphs, checkSumAdjustment, indexToLocFormat, glyphs, cmap, familyName, styleName };
}

export interface ChecksumReport {
  tablesOk: boolean;
  badTables: string[];
  checkSumAdjustmentOk: boolean;
}

/** Recomputes every table checksum plus the whole-font checkSumAdjustment and
 *  reports whether they match what's stored in the file. */
export function verifyChecksums(bytes: Uint8Array): ChecksumReport {
  const r = new ByteReader(bytes);
  const dir = readTableDirectory(r, bytes);

  const head = requireTable(dir, "head");
  // Per the TrueType spec, the head table's own directory checksum (and the
  // whole-font checksum used to derive checkSumAdjustment) are both computed
  // with checkSumAdjustment temporarily zeroed — it is never re-derived after
  // patching, so verification must zero it too before recomputing.
  const storedAdjustment = r.u32(head.offset + 8);
  const zeroed = bytes.slice();
  zeroed[head.offset + 8] = 0;
  zeroed[head.offset + 9] = 0;
  zeroed[head.offset + 10] = 0;
  zeroed[head.offset + 11] = 0;

  const badTables: string[] = [];
  for (const t of dir.values()) {
    const slice = zeroed.subarray(t.offset, t.offset + t.length);
    const recomputed = tableChecksum(slice);
    if (recomputed !== t.checksum) badTables.push(t.tag);
  }

  const wholeFontChecksum = tableChecksum(zeroed);
  const expectedAdjustment = (0xb1b0afba - wholeFontChecksum) >>> 0;

  return {
    tablesOk: badTables.length === 0,
    badTables,
    checkSumAdjustmentOk: expectedAdjustment === storedAdjustment,
  };
}
