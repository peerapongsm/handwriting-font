import { describe, expect, it } from "vitest";
import { buildFont, buildGlyphSource, drawnGlyphCount } from "./build";
import { parseTTF } from "./parse";

const STRAIGHT_STROKE = [
  { points: [{ x: 0, y: 0 }, { x: 100, y: 0 }, { x: 200, y: 0 }], width: 20 },
];

describe("buildGlyphSource", () => {
  it("returns null for an unknown char id", () => {
    expect(buildGlyphSource("not-a-real-id", STRAIGHT_STROKE)).toBeNull();
  });

  it("returns null when there are no strokes", () => {
    expect(buildGlyphSource("latin-41", [])).toBeNull();
  });

  it("forces advance width 0 for a combining mark", () => {
    const source = buildGlyphSource("vowelsTones-e48", STRAIGHT_STROKE);
    expect(source).not.toBeNull();
    expect(source!.advanceWidth).toBe(0);
  });

  it("computes a positive advance width for a normal glyph", () => {
    const source = buildGlyphSource("latin-41", STRAIGHT_STROKE);
    expect(source).not.toBeNull();
    expect(source!.advanceWidth).toBeGreaterThan(0);
  });
});

describe("buildFont", () => {
  it("produces a loadable font from a single drawn glyph (min viable export)", () => {
    const bytes = buildFont({ "latin-41": STRAIGHT_STROKE }, "My Font");
    const parsed = parseTTF(bytes);
    expect(parsed.cmap.get(0x41)).toBeDefined();
  });

  it("skips glyphs with no usable strokes", () => {
    const bytes = buildFont({ "latin-41": STRAIGHT_STROKE, "latin-42": [] }, "My Font");
    const parsed = parseTTF(bytes);
    expect(parsed.cmap.has(0x42)).toBe(false);
  });
});

describe("drawnGlyphCount", () => {
  it("counts only glyphs with usable strokes", () => {
    expect(drawnGlyphCount({ "latin-41": STRAIGHT_STROKE, "latin-42": [] })).toBe(1);
  });
});
