import { beforeEach, describe, expect, it } from "vitest";
import { emptyProgress, loadProgress, saveProgress, withGlyphStrokes } from "./storage";

describe("storage", () => {
  beforeEach(() => {
    window.localStorage.clear();
  });

  it("returns empty progress when nothing is stored", () => {
    expect(loadProgress()).toEqual(emptyProgress());
  });

  it("round-trips saved progress", () => {
    const progress = withGlyphStrokes(emptyProgress(), "consonants-e01", [
      { points: [{ x: 0, y: 0 }, { x: 10, y: 10 }], width: 16 },
    ]);
    saveProgress(progress);
    expect(loadProgress()).toEqual(progress);
  });

  it("removes a glyph when its strokes are cleared to empty", () => {
    let progress = withGlyphStrokes(emptyProgress(), "latin-41", [{ points: [{ x: 0, y: 0 }], width: 16 }]);
    progress = withGlyphStrokes(progress, "latin-41", []);
    expect(progress.glyphs["latin-41"]).toBeUndefined();
  });

  it("recovers gracefully from corrupt storage", () => {
    window.localStorage.setItem("handwriting-font-progress-v1", "not json{{{");
    expect(loadProgress()).toEqual(emptyProgress());
  });
});
