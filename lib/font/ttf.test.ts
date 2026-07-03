import { describe, expect, it } from "vitest";
import { encodeTTF, type GlyphSource } from "./ttf";
import { listTableTags, parseTTF, verifyChecksums } from "./parse";
import type { Contour } from "./types";

function triangle(ox: number, oy: number, size = 200): Contour {
  return [
    { x: ox, y: oy, onCurve: true },
    { x: ox + size, y: oy, onCurve: true },
    { x: ox + size / 2, y: oy + size, onCurve: true },
  ];
}

function square(ox: number, oy: number, size = 150): Contour {
  return [
    { x: ox, y: oy, onCurve: true },
    { x: ox + size, y: oy, onCurve: true },
    { x: ox + size, y: oy + size, onCurve: true },
    { x: ox, y: oy + size, onCurve: true },
  ];
}

describe("encodeTTF + parseTTF round-trip", () => {
  it("round-trips metrics (unitsPerEm, ascender, descender)", () => {
    const glyphs: GlyphSource[] = [{ codepoint: 0x41, contours: [triangle(0, 0)], advanceWidth: 400 }];
    const bytes = encodeTTF(glyphs, { familyName: "Test Hand", ascender: 800, descender: -200, unitsPerEm: 1000 });
    const parsed = parseTTF(bytes);
    expect(parsed.unitsPerEm).toBe(1000);
    expect(parsed.ascender).toBe(800);
    expect(parsed.descender).toBe(-200);
  });

  it("round-trips a single glyph's outline exactly (min viable export: 1 glyph)", () => {
    const glyphs: GlyphSource[] = [{ codepoint: 0x0e01 /* ก */, contours: [triangle(10, 20, 300)], advanceWidth: 500 }];
    const bytes = encodeTTF(glyphs, { familyName: "Test Hand" });
    const parsed = parseTTF(bytes);
    expect(parsed.numGlyphs).toBe(2); // .notdef + 1 drawn glyph

    const glyphId = parsed.cmap.get(0x0e01);
    expect(glyphId).toBeDefined();
    const g = parsed.glyphs[glyphId!];
    expect(g.advanceWidth).toBe(500);
    expect(g.contours).toHaveLength(1);
    expect(g.contours[0]).toEqual(triangle(10, 20, 300));
  });

  it("round-trips multiple contours within one glyph (a multi-stroke letter)", () => {
    const glyphs: GlyphSource[] = [
      { codepoint: 0x61 /* a */, contours: [triangle(0, 0), square(300, 0)], advanceWidth: 600 },
    ];
    const bytes = encodeTTF(glyphs, { familyName: "Test Hand" });
    const parsed = parseTTF(bytes);
    const glyphId = parsed.cmap.get(0x61)!;
    const g = parsed.glyphs[glyphId];
    expect(g.contours).toHaveLength(2);
    expect(g.contours[0]).toEqual(triangle(0, 0));
    expect(g.contours[1]).toEqual(square(300, 0));
  });

  it("round-trips negative coordinates and large deltas correctly", () => {
    const contour: Contour = [
      { x: -300, y: -100, onCurve: true },
      { x: 400, y: -100, onCurve: true },
      { x: 400, y: 500, onCurve: true },
      { x: -300, y: 500, onCurve: true },
    ];
    const glyphs: GlyphSource[] = [{ codepoint: 0x42, contours: [contour], advanceWidth: 700 }];
    const bytes = encodeTTF(glyphs, { familyName: "Test Hand" });
    const parsed = parseTTF(bytes);
    const glyphId = parsed.cmap.get(0x42)!;
    expect(parsed.glyphs[glyphId].contours[0]).toEqual(contour);
  });

  it("round-trips off-curve (quadratic control) points", () => {
    const contour: Contour = [
      { x: 0, y: 0, onCurve: true },
      { x: 100, y: 100, onCurve: false },
      { x: 200, y: 0, onCurve: true },
      { x: 100, y: -100, onCurve: false },
    ];
    const glyphs: GlyphSource[] = [{ codepoint: 0x4f, contours: [contour], advanceWidth: 400 }];
    const bytes = encodeTTF(glyphs, { familyName: "Test Hand" });
    const parsed = parseTTF(bytes);
    const glyphId = parsed.cmap.get(0x4f)!;
    expect(parsed.glyphs[glyphId].contours[0]).toEqual(contour);
  });

  it("round-trips family and style name", () => {
    const glyphs: GlyphSource[] = [{ codepoint: 0x41, contours: [triangle(0, 0)], advanceWidth: 400 }];
    const bytes = encodeTTF(glyphs, { familyName: "My Handwriting", styleName: "Regular" });
    const parsed = parseTTF(bytes);
    expect(parsed.familyName).toBe("My Handwriting");
    expect(parsed.styleName).toBe("Regular");
  });

  it("forces combining marks to advance width 0 and round-trips that", () => {
    const glyphs: GlyphSource[] = [
      { codepoint: 0x0e48 /* mai ek, combining */, contours: [triangle(0, 500, 60)], advanceWidth: 0 },
    ];
    const bytes = encodeTTF(glyphs, { familyName: "Test Hand" });
    const parsed = parseTTF(bytes);
    const glyphId = parsed.cmap.get(0x0e48)!;
    expect(parsed.glyphs[glyphId].advanceWidth).toBe(0);
  });

  it("has valid checksums for every table and a valid checkSumAdjustment", () => {
    const glyphs: GlyphSource[] = [
      { codepoint: 0x0e01, contours: [triangle(0, 0)], advanceWidth: 400 },
      { codepoint: 0x0e2e, contours: [square(0, 0)], advanceWidth: 500 },
      { codepoint: 0x41, contours: [triangle(50, 50), square(300, 50)], advanceWidth: 600 },
    ];
    const bytes = encodeTTF(glyphs, { familyName: "Test Hand" });
    const report = verifyChecksums(bytes);
    expect(report.badTables).toEqual([]);
    expect(report.tablesOk).toBe(true);
    expect(report.checkSumAdjustmentOk).toBe(true);
  });

  it("cmap covers every drawn Thai codepoint and excludes undrawn glyphs", () => {
    const glyphs: GlyphSource[] = [
      { codepoint: 0x0e01 /* ก */, contours: [triangle(0, 0)], advanceWidth: 400 },
      { codepoint: 0x0e2e /* ฮ */, contours: [square(0, 0)], advanceWidth: 400 },
      { codepoint: 0x0e50 /* ๐ */, contours: [triangle(0, 0, 100)], advanceWidth: 300 },
    ];
    const bytes = encodeTTF(glyphs, { familyName: "Test Hand" });
    const parsed = parseTTF(bytes);
    expect(parsed.cmap.get(0x0e01)).toBeDefined();
    expect(parsed.cmap.get(0x0e2e)).toBeDefined();
    expect(parsed.cmap.get(0x0e50)).toBeDefined();
    // ข (0x0e02) was never drawn — must be absent from cmap entirely.
    expect(parsed.cmap.has(0x0e02)).toBe(false);
    expect(parsed.cmap.size).toBe(3);
  });

  it("cmap handles a large contiguous run of consecutive codepoints (Latin a-z)", () => {
    const glyphs: GlyphSource[] = [];
    for (let cp = 0x61; cp <= 0x7a; cp++) {
      glyphs.push({ codepoint: cp, contours: [triangle(0, 0, 50)], advanceWidth: 300 });
    }
    const bytes = encodeTTF(glyphs, { familyName: "Test Hand" });
    const parsed = parseTTF(bytes);
    for (let cp = 0x61; cp <= 0x7a; cp++) {
      expect(parsed.cmap.has(cp)).toBe(true);
    }
    expect(parsed.cmap.size).toBe(26);
  });

  it("produces an empty (but present) .notdef glyph 0 with no contours", () => {
    const glyphs: GlyphSource[] = [{ codepoint: 0x41, contours: [triangle(0, 0)], advanceWidth: 400 }];
    const bytes = encodeTTF(glyphs, { familyName: "Test Hand" });
    const parsed = parseTTF(bytes);
    expect(parsed.glyphs[0].contours).toEqual([]);
  });

  it("includes an OS/2 table — required by browser font sanitizers (OTS), not just the spec's core table list", () => {
    // Confirmed by headless-browser testing: Chromium's OTS rejects a FontFace
    // load with "OS/2: missing required table" without this.
    const glyphs: GlyphSource[] = [{ codepoint: 0x41, contours: [triangle(0, 0)], advanceWidth: 400 }];
    const bytes = encodeTTF(glyphs, { familyName: "Test Hand" });
    const tags = listTableTags(bytes);
    for (const required of ["head", "hhea", "maxp", "hmtx", "cmap", "glyf", "loca", "name", "post", "OS/2"]) {
      expect(tags).toContain(required);
    }
  });

  it("throws no error and produces a loadable sfnt header for a 0-glyph font", () => {
    const bytes = encodeTTF([], { familyName: "Empty" });
    const parsed = parseTTF(bytes);
    expect(parsed.numGlyphs).toBe(1); // just .notdef
    expect(parsed.cmap.size).toBe(0);
  });
});
