// Glue between the drawing/storage layer and the TTF encoder: turns recorded
// strokes into glyph outlines, then into a font.
import type { StoredStroke } from "../storage";
import { findChar } from "./charset";
import { MIN_ADVANCE_WIDTH, SIDE_BEARING, UNITS_PER_EM, ASCENDER, DESCENDER } from "./constants";
import { smoothStroke } from "./smooth";
import { strokeToOutline } from "./outline";
import { bboxOfContours, encodeTTF, type GlyphSource } from "./ttf";
import type { Contour } from "./types";

export function strokesToContours(strokes: readonly StoredStroke[]): Contour[] {
  return strokes.map((s) => strokeToOutline(smoothStroke(s.points), s.width / 2)).filter((c) => c.length > 0);
}

/** Builds one glyph's font-ready source from its recorded strokes, or null if
 *  nothing usable was drawn (an undrawn glyph must not appear in the font). */
export function buildGlyphSource(charId: string, strokes: readonly StoredStroke[]): GlyphSource | null {
  const charDef = findChar(charId);
  if (!charDef || strokes.length === 0) return null;

  const contours = strokesToContours(strokes);
  if (contours.length === 0) return null;

  if (charDef.combining) {
    return { codepoint: charDef.codepoint, contours, advanceWidth: 0 };
  }

  const box = bboxOfContours(contours);
  const advanceWidth = Math.max(MIN_ADVANCE_WIDTH, box.xMax + SIDE_BEARING);
  return { codepoint: charDef.codepoint, contours, advanceWidth };
}

export function buildFont(glyphStrokes: Record<string, StoredStroke[]>, familyName: string): Uint8Array {
  const sources: GlyphSource[] = [];
  for (const [charId, strokes] of Object.entries(glyphStrokes)) {
    const source = buildGlyphSource(charId, strokes);
    if (source) sources.push(source);
  }
  return encodeTTF(sources, { familyName, unitsPerEm: UNITS_PER_EM, ascender: ASCENDER, descender: DESCENDER });
}

export function drawnGlyphCount(glyphStrokes: Record<string, StoredStroke[]>): number {
  return Object.entries(glyphStrokes).filter(([id, strokes]) => buildGlyphSource(id, strokes) !== null).length;
}
