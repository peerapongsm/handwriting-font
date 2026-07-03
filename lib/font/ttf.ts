// Hand-rolled TrueType (.ttf) encoder — no dependencies. Writes head, hhea, maxp,
// hmtx, cmap (format 4), glyf, loca, name, post tables with correct checksums,
// including the whole-font checkSumAdjustment. Per spec §4: unitsPerEm 1000,
// quadratic (TrueType-native) outlines.
//
// Also writes a minimal OS/2 table. That table isn't in the spec's required
// list (head/hhea/maxp/hmtx/cmap/glyf/loca/name/post), but real browsers
// reject a FontFace without it — Chromium's OTS sanitizer specifically
// errors "OS/2: missing required table" and refuses to load the font. Since
// spec §6 makes the live FontFace preview *the* proof the encoder works,
// OS/2 is required in practice even though it's outside the letter of §4.
import { ByteWriter, tableChecksum } from "./binary";
import type { Contour } from "./types";

export interface GlyphSource {
  codepoint: number;
  contours: Contour[];
  advanceWidth: number;
}

export interface FontOptions {
  unitsPerEm?: number;
  ascender?: number;
  descender?: number;
  familyName: string;
  styleName?: string;
  createdAt?: Date;
}

const MAC_EPOCH_OFFSET_SECONDS = 2082844800n; // 1904-01-01 -> 1970-01-01

function toMacLongDateTime(date: Date): bigint {
  return BigInt(Math.floor(date.getTime() / 1000)) + MAC_EPOCH_OFFSET_SECONDS;
}

interface PreparedGlyph {
  glyphId: number;
  codepoint: number | null; // null for .notdef
  contours: Contour[];
  advanceWidth: number;
}

export function bboxOfContours(contours: Contour[]): { xMin: number; yMin: number; xMax: number; yMax: number } {
  let xMin = 0;
  let yMin = 0;
  let xMax = 0;
  let yMax = 0;
  let any = false;
  for (const c of contours) {
    for (const p of c) {
      if (!any) {
        xMin = xMax = p.x;
        yMin = yMax = p.y;
        any = true;
      } else {
        if (p.x < xMin) xMin = p.x;
        if (p.x > xMax) xMax = p.x;
        if (p.y < yMin) yMin = p.y;
        if (p.y > yMax) yMax = p.y;
      }
    }
  }
  return { xMin: Math.round(xMin), yMin: Math.round(yMin), xMax: Math.round(xMax), yMax: Math.round(yMax) };
}

function buildGlyfEntry(glyph: PreparedGlyph): Uint8Array {
  const w = new ByteWriter();
  if (glyph.contours.length === 0) {
    return w.toUint8Array(); // empty glyph (zero-length glyf entry)
  }
  const { xMin, yMin, xMax, yMax } = bboxOfContours(glyph.contours);
  w.u16(glyph.contours.length);
  w.u16(xMin);
  w.u16(yMin);
  w.u16(xMax);
  w.u16(yMax);
  // the above four u16 calls correctly wrap negative i16 values via ByteWriter#u16

  let pointIndex = -1;
  const endPts: number[] = [];
  for (const c of glyph.contours) {
    pointIndex += c.length;
    endPts.push(pointIndex);
  }
  for (const e of endPts) w.u16(e);

  w.u16(0); // instructionLength

  const allPoints = glyph.contours.flat();
  const flags: number[] = [];
  const xBytes: number[][] = [];
  const yBytes: number[][] = [];
  let prevX = 0;
  let prevY = 0;
  for (const p of allPoints) {
    const rx = Math.round(p.x);
    const ry = Math.round(p.y);
    const dx = rx - prevX;
    const dy = ry - prevY;
    prevX = rx;
    prevY = ry;

    let flag = p.onCurve ? 0x01 : 0x00;

    if (dx === 0) {
      flag |= 0x10; // X_IS_SAME_OR_POSITIVE (same, i.e. delta 0), no bytes
      xBytes.push([]);
    } else if (dx > 0 && dx <= 255) {
      flag |= 0x02 | 0x10; // X_SHORT_VECTOR + positive
      xBytes.push([dx]);
    } else if (dx < 0 && dx >= -255) {
      flag |= 0x02; // X_SHORT_VECTOR, sign bit 0 = negative
      xBytes.push([-dx]);
    } else {
      const uv = dx & 0xffff;
      xBytes.push([(uv >> 8) & 0xff, uv & 0xff]);
    }

    if (dy === 0) {
      flag |= 0x20;
      yBytes.push([]);
    } else if (dy > 0 && dy <= 255) {
      flag |= 0x04 | 0x20;
      yBytes.push([dy]);
    } else if (dy < 0 && dy >= -255) {
      flag |= 0x04;
      yBytes.push([-dy]);
    } else {
      const uv = dy & 0xffff;
      yBytes.push([(uv >> 8) & 0xff, uv & 0xff]);
    }

    flags.push(flag);
  }

  for (const f of flags) w.u8(f);
  for (const xb of xBytes) w.bytesArray(xb);
  for (const yb of yBytes) w.bytesArray(yb);

  w.padToEven();
  return w.toUint8Array();
}

function buildCmapFormat4(entries: { codepoint: number; glyphId: number }[]): Uint8Array {
  const sorted = [...entries].sort((a, b) => a.codepoint - b.codepoint);

  interface Segment {
    start: number;
    end: number;
    idDelta: number;
  }
  const segments: Segment[] = [];
  for (const e of sorted) {
    const last = segments[segments.length - 1];
    if (last && e.codepoint === last.end + 1 && e.glyphId === (e.codepoint + last.idDelta) % 0x10000) {
      last.end = e.codepoint;
    } else {
      segments.push({ start: e.codepoint, end: e.codepoint, idDelta: (e.glyphId - e.codepoint) & 0xffff });
    }
  }
  segments.push({ start: 0xffff, end: 0xffff, idDelta: 1 });

  const segCount = segments.length;
  let searchRangePow = 1;
  let entrySelector = 0;
  while (searchRangePow * 2 <= segCount) {
    searchRangePow *= 2;
    entrySelector++;
  }
  const searchRange = searchRangePow * 2;
  const rangeShift = segCount * 2 - searchRange;

  const w = new ByteWriter();
  w.u16(4); // format
  const lengthPlaceholderIndex = w.length;
  w.u16(0); // length, patched below
  w.u16(0); // language
  w.u16(segCount * 2);
  w.u16(searchRange);
  w.u16(entrySelector);
  w.u16(rangeShift);
  for (const s of segments) w.u16(s.end);
  w.u16(0); // reservedPad
  for (const s of segments) w.u16(s.start);
  for (const s of segments) w.u16(s.idDelta);
  for (const s of segments) w.u16(0); // idRangeOffset — always 0, we never need glyphIdArray

  const bytes = w.toUint8Array();
  const length = bytes.length;
  bytes[lengthPlaceholderIndex] = (length >> 8) & 0xff;
  bytes[lengthPlaceholderIndex + 1] = length & 0xff;
  return bytes;
}

function utf16beBytes(str: string): number[] {
  const out: number[] = [];
  for (let i = 0; i < str.length; i++) {
    const code = str.charCodeAt(i);
    out.push((code >> 8) & 0xff, code & 0xff);
  }
  return out;
}

function buildNameTable(familyName: string, styleName: string): Uint8Array {
  const uniqueId = `${familyName}-${styleName}-handwriting-font`.replace(/\s+/g, "");
  const postscriptName = `${familyName}-${styleName}`.replace(/[^A-Za-z0-9-]/g, "");
  const records: { nameId: number; value: string }[] = [
    { nameId: 1, value: familyName },
    { nameId: 2, value: styleName },
    { nameId: 3, value: uniqueId },
    { nameId: 4, value: `${familyName} ${styleName}` },
    { nameId: 6, value: postscriptName || "HandwritingFont-Regular" },
  ];

  const w = new ByteWriter();
  w.u16(0); // format
  w.u16(records.length); // count
  const storageOffsetIndex = w.length;
  w.u16(0); // storageOffset, patched below

  let stringOffset = 0;
  const stringBlocks: number[][] = [];
  for (const r of records) {
    const bytes = utf16beBytes(r.value);
    w.u16(3); // platformID: Windows
    w.u16(1); // encodingID: Unicode BMP
    w.u16(0x0409); // languageID: en-US
    w.u16(r.nameId);
    w.u16(bytes.length);
    w.u16(stringOffset);
    stringBlocks.push(bytes);
    stringOffset += bytes.length;
  }

  const storageOffset = w.length;
  for (const block of stringBlocks) w.bytesArray(block);

  const bytes = w.toUint8Array();
  bytes[storageOffsetIndex] = (storageOffset >> 8) & 0xff;
  bytes[storageOffsetIndex + 1] = storageOffset & 0xff;
  return bytes;
}

function buildOS2Table(opts: {
  ascender: number;
  descender: number;
  advanceWidthMax: number;
  firstCharIndex: number;
  lastCharIndex: number;
}): Uint8Array {
  const w = new ByteWriter();
  w.u16(0); // version 0 — minimal, 78-byte table
  w.u16(opts.advanceWidthMax); // xAvgCharWidth
  w.u16(400); // usWeightClass: normal
  w.u16(5); // usWidthClass: medium
  w.u16(0); // fsType: installable embedding
  w.u16(0); // ySubscriptXSize
  w.u16(0); // ySubscriptYSize
  w.u16(0); // ySubscriptXOffset
  w.u16(0); // ySubscriptYOffset
  w.u16(0); // ySuperscriptXSize
  w.u16(0); // ySuperscriptYSize
  w.u16(0); // ySuperscriptXOffset
  w.u16(0); // ySuperscriptYOffset
  w.u16(0); // yStrikeoutSize
  w.u16(0); // yStrikeoutPosition
  w.u16(0); // sFamilyClass
  for (let i = 0; i < 10; i++) w.u8(0); // panose[10]
  w.u32(0x01000001); // ulUnicodeRange1: bit0 Basic Latin | bit24 Thai
  w.u32(0); // ulUnicodeRange2
  w.u32(0); // ulUnicodeRange3
  w.u32(0); // ulUnicodeRange4
  w.tag("NONE"); // achVendID
  w.u16(0x0040); // fsSelection: REGULAR
  w.u16(opts.firstCharIndex);
  w.u16(opts.lastCharIndex);
  w.u16(opts.ascender); // sTypoAscender
  w.u16(opts.descender); // sTypoDescender (signed, negative below baseline)
  w.u16(0); // sTypoLineGap
  w.u16(opts.ascender); // usWinAscent
  w.u16(Math.abs(opts.descender)); // usWinDescent (unsigned magnitude)
  return w.toUint8Array();
}

function buildPostTable(): Uint8Array {
  const w = new ByteWriter();
  w.u32(0x00030000); // version 3.0 — no glyph name data
  w.u32(0); // italicAngle
  w.u16(0); // underlinePosition
  w.u16(0); // underlineThickness
  w.u32(0); // isFixedPitch
  w.u32(0); // minMemType42
  w.u32(0); // maxMemType42
  w.u32(0); // minMemType1
  w.u32(0); // maxMemType1
  return w.toUint8Array();
}

export function encodeTTF(glyphSources: readonly GlyphSource[], options: FontOptions): Uint8Array {
  const unitsPerEm = options.unitsPerEm ?? 1000;
  const ascender = options.ascender ?? 800;
  const descender = options.descender ?? -200;
  const styleName = options.styleName ?? "Regular";
  const createdAt = options.createdAt ?? new Date();

  const sortedSources = [...glyphSources].sort((a, b) => a.codepoint - b.codepoint);

  const glyphs: PreparedGlyph[] = [
    { glyphId: 0, codepoint: null, contours: [], advanceWidth: Math.round(unitsPerEm / 2) },
    ...sortedSources.map((g, i) => ({
      glyphId: i + 1,
      codepoint: g.codepoint,
      contours: g.contours,
      advanceWidth: g.advanceWidth,
    })),
  ];

  const numGlyphs = glyphs.length;

  // --- glyf + loca ---
  const glyfWriter = new ByteWriter();
  const locaOffsets: number[] = [0];
  let maxPoints = 0;
  let maxContours = 0;
  let fontXMin = 0;
  let fontYMin = 0;
  let fontXMax = 0;
  let fontYMax = 0;
  let anyBox = false;

  for (const g of glyphs) {
    const entry = buildGlyfEntry(g);
    glyfWriter.bytesArray(entry);
    locaOffsets.push(glyfWriter.length);

    const pointCount = g.contours.reduce((sum, c) => sum + c.length, 0);
    maxPoints = Math.max(maxPoints, pointCount);
    maxContours = Math.max(maxContours, g.contours.length);

    if (g.contours.length > 0) {
      const box = bboxOfContours(g.contours);
      if (!anyBox) {
        fontXMin = box.xMin;
        fontYMin = box.yMin;
        fontXMax = box.xMax;
        fontYMax = box.yMax;
        anyBox = true;
      } else {
        fontXMin = Math.min(fontXMin, box.xMin);
        fontYMin = Math.min(fontYMin, box.yMin);
        fontXMax = Math.max(fontXMax, box.xMax);
        fontYMax = Math.max(fontYMax, box.yMax);
      }
    }
  }

  const glyfBytes = glyfWriter.toUint8Array();

  const locaWriter = new ByteWriter();
  for (const off of locaOffsets) locaWriter.u32(off);
  const locaBytes = locaWriter.toUint8Array();

  // --- hmtx ---
  const hmtxWriter = new ByteWriter();
  let advanceWidthMax = 0;
  let minLsb = Infinity;
  let minRsb = Infinity;
  let xMaxExtent = -Infinity;
  for (const g of glyphs) {
    const aw = Math.round(g.advanceWidth);
    hmtxWriter.u16(aw);
    const box = g.contours.length > 0 ? bboxOfContours(g.contours) : { xMin: 0, yMin: 0, xMax: 0, yMax: 0 };
    const lsb = g.contours.length > 0 ? box.xMin : 0;
    hmtxWriter.u16(lsb);
    advanceWidthMax = Math.max(advanceWidthMax, aw);
    minLsb = Math.min(minLsb, lsb);
    const rsb = aw - lsb - (box.xMax - box.xMin);
    minRsb = Math.min(minRsb, rsb);
    xMaxExtent = Math.max(xMaxExtent, lsb + (box.xMax - box.xMin));
  }
  if (!Number.isFinite(minLsb)) minLsb = 0;
  if (!Number.isFinite(minRsb)) minRsb = 0;
  if (!Number.isFinite(xMaxExtent)) xMaxExtent = 0;
  const hmtxBytes = hmtxWriter.toUint8Array();

  // --- cmap ---
  const cmapEntries = glyphs
    .filter((g): g is PreparedGlyph & { codepoint: number } => g.codepoint !== null)
    .map((g) => ({ codepoint: g.codepoint, glyphId: g.glyphId }));
  const cmapSubtable = buildCmapFormat4(cmapEntries);

  const cmapWriter = new ByteWriter();
  cmapWriter.u16(0); // version
  cmapWriter.u16(2); // numTables
  const subtableOffset = 4 + 2 * 8;
  // (3,1) Windows Unicode BMP
  cmapWriter.u16(3);
  cmapWriter.u16(1);
  cmapWriter.u32(subtableOffset);
  // (0,3) Unicode BMP
  cmapWriter.u16(0);
  cmapWriter.u16(3);
  cmapWriter.u32(subtableOffset);
  cmapWriter.bytesArray(cmapSubtable);
  const cmapBytes = cmapWriter.toUint8Array();

  // --- head ---
  const indexToLocFormat = 1; // always long (u32) offsets — simple and always correct
  const headWriter = new ByteWriter();
  headWriter.u16(1); // majorVersion
  headWriter.u16(0); // minorVersion
  headWriter.u32(0x00010000); // fontRevision 1.0
  headWriter.u32(0); // checkSumAdjustment, patched later
  headWriter.u32(0x5f0f3cf5); // magicNumber
  headWriter.u16(0x0003); // flags
  headWriter.u16(unitsPerEm);
  headWriter.u64(toMacLongDateTime(createdAt));
  headWriter.u64(toMacLongDateTime(createdAt));
  headWriter.u16(fontXMin);
  headWriter.u16(fontYMin);
  headWriter.u16(fontXMax);
  headWriter.u16(fontYMax);
  headWriter.u16(0); // macStyle
  headWriter.u16(8); // lowestRecPPEM
  headWriter.u16(2); // fontDirectionHint
  headWriter.u16(indexToLocFormat);
  headWriter.u16(0); // glyphDataFormat
  const headBytes = headWriter.toUint8Array();
  const CHECKSUM_ADJUSTMENT_OFFSET = 8;

  // --- hhea ---
  const hheaWriter = new ByteWriter();
  hheaWriter.u16(1);
  hheaWriter.u16(0);
  hheaWriter.u16(ascender);
  hheaWriter.u16(descender);
  hheaWriter.u16(0); // lineGap
  hheaWriter.u16(advanceWidthMax);
  hheaWriter.u16(minLsb);
  hheaWriter.u16(minRsb);
  hheaWriter.u16(xMaxExtent);
  hheaWriter.u16(1); // caretSlopeRise
  hheaWriter.u16(0); // caretSlopeRun
  hheaWriter.u16(0); // caretOffset
  hheaWriter.u16(0);
  hheaWriter.u16(0);
  hheaWriter.u16(0);
  hheaWriter.u16(0);
  hheaWriter.u16(0); // metricDataFormat
  hheaWriter.u16(numGlyphs); // numberOfHMetrics — every glyph has an explicit entry
  const hheaBytes = hheaWriter.toUint8Array();

  // --- maxp ---
  const maxpWriter = new ByteWriter();
  maxpWriter.u32(0x00010000);
  maxpWriter.u16(numGlyphs);
  maxpWriter.u16(maxPoints);
  maxpWriter.u16(maxContours);
  maxpWriter.u16(0);
  maxpWriter.u16(0);
  maxpWriter.u16(2); // maxZones
  maxpWriter.u16(0);
  maxpWriter.u16(0);
  maxpWriter.u16(0);
  maxpWriter.u16(0);
  maxpWriter.u16(0);
  maxpWriter.u16(0);
  maxpWriter.u16(0);
  maxpWriter.u16(0);
  const maxpBytes = maxpWriter.toUint8Array();

  // --- name / post / OS/2 ---
  const nameBytes = buildNameTable(options.familyName, styleName);
  const postBytes = buildPostTable();
  const drawnCodepoints = sortedSources.map((g) => g.codepoint);
  const os2Bytes = buildOS2Table({
    ascender,
    descender,
    advanceWidthMax,
    firstCharIndex: drawnCodepoints.length > 0 ? Math.min(...drawnCodepoints) : 0x20,
    lastCharIndex: drawnCodepoints.length > 0 ? Math.max(...drawnCodepoints) : 0x7e,
  });

  // --- assemble sfnt ---
  const tables: { tag: string; data: Uint8Array }[] = [
    { tag: "cmap", data: cmapBytes },
    { tag: "glyf", data: glyfBytes },
    { tag: "head", data: headBytes },
    { tag: "hhea", data: hheaBytes },
    { tag: "hmtx", data: hmtxBytes },
    { tag: "loca", data: locaBytes },
    { tag: "maxp", data: maxpBytes },
    { tag: "name", data: nameBytes },
    { tag: "post", data: postBytes },
    { tag: "OS/2", data: os2Bytes },
  ];
  tables.sort((a, b) => (a.tag < b.tag ? -1 : a.tag > b.tag ? 1 : 0));

  const numTables = tables.length;
  let searchRangePow = 1;
  let entrySelector = 0;
  while (searchRangePow * 2 <= numTables) {
    searchRangePow *= 2;
    entrySelector++;
  }
  const searchRange = searchRangePow * 16;
  const rangeShift = numTables * 16 - searchRange;

  const headerSize = 12 + numTables * 16;
  let cursor = headerSize;
  const placed = tables.map((t) => {
    const offset = cursor;
    const padded = t.data.length + ((4 - (t.data.length % 4)) % 4);
    cursor += padded;
    return { ...t, offset, length: t.data.length };
  });

  const fileWriter = new ByteWriter();
  fileWriter.u32(0x00010000); // sfntVersion: TrueType
  fileWriter.u16(numTables);
  fileWriter.u16(searchRange);
  fileWriter.u16(entrySelector);
  fileWriter.u16(rangeShift);

  let headTableOffset = 0;
  for (const t of placed) {
    if (t.tag === "head") headTableOffset = t.offset;
    fileWriter.tag(t.tag);
    fileWriter.u32(tableChecksum(t.data));
    fileWriter.u32(t.offset);
    fileWriter.u32(t.length);
  }
  for (const t of placed) {
    fileWriter.bytesArray(t.data);
    fileWriter.padTo4();
  }

  const fileBytes = fileWriter.toUint8Array();

  const wholeFontChecksum = tableChecksum(fileBytes);
  const checkSumAdjustment = (0xb1b0afba - wholeFontChecksum) >>> 0;
  const adjOffset = headTableOffset + CHECKSUM_ADJUSTMENT_OFFSET;
  fileBytes[adjOffset] = (checkSumAdjustment >>> 24) & 0xff;
  fileBytes[adjOffset + 1] = (checkSumAdjustment >>> 16) & 0xff;
  fileBytes[adjOffset + 2] = (checkSumAdjustment >>> 8) & 0xff;
  fileBytes[adjOffset + 3] = checkSumAdjustment & 0xff;

  return fileBytes;
}
