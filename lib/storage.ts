// localStorage persistence for in-progress drawings, per spec §1 ("งานค้างเก็บ
// localStorage — วาดต่อวันหลังได้"). Everything stays on-device.
import type { Point } from "./font/types";

export interface StoredStroke {
  points: Point[];
  width: number;
}

export interface StoredGlyph {
  strokes: StoredStroke[];
}

export interface StoredProgress {
  version: 1;
  glyphs: Record<string, StoredGlyph>;
}

const STORAGE_KEY = "handwriting-font-progress-v1";

export function emptyProgress(): StoredProgress {
  return { version: 1, glyphs: {} };
}

export function loadProgress(): StoredProgress {
  if (typeof window === "undefined") return emptyProgress();
  try {
    const raw = window.localStorage.getItem(STORAGE_KEY);
    if (!raw) return emptyProgress();
    const parsed = JSON.parse(raw);
    if (parsed && parsed.version === 1 && parsed.glyphs && typeof parsed.glyphs === "object") {
      return parsed as StoredProgress;
    }
  } catch {
    // corrupt storage — start fresh rather than crash the app
  }
  return emptyProgress();
}

export function saveProgress(progress: StoredProgress): void {
  if (typeof window === "undefined") return;
  window.localStorage.setItem(STORAGE_KEY, JSON.stringify(progress));
}

/** Returns a new progress object with the glyph's strokes replaced (or removed, if empty). */
export function withGlyphStrokes(progress: StoredProgress, glyphId: string, strokes: StoredStroke[]): StoredProgress {
  const glyphs = { ...progress.glyphs };
  if (strokes.length === 0) {
    delete glyphs[glyphId];
  } else {
    glyphs[glyphId] = { strokes };
  }
  return { version: 1, glyphs };
}
