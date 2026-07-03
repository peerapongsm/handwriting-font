// Shared metric constants for guidelines, drawing zones, and the encoder.
export const UNITS_PER_EM = 1000;
export const ASCENDER = 800;
export const DESCENDER = -200;
export const BASELINE = 0;
export const X_HEIGHT = 500;

// The drawing cell in font units. Wide enough to fit a full-width Thai
// consonant plus room either side for leading/trailing vowel marks.
export const CELL_LEFT = -60;
export const CELL_RIGHT = 760;
export const CELL_TOP = ASCENDER + 60;
export const CELL_BOTTOM = DESCENDER - 60;

// Guideline band a combining mark should be drawn within (spec §5).
export const ABOVE_ZONE = { top: ASCENDER, bottom: X_HEIGHT };
export const BELOW_ZONE = { top: BASELINE, bottom: DESCENDER };

/** 3 selectable pen widths (full stroke width, in font units), per spec §3. */
export const PEN_WIDTHS = [16, 30, 48] as const;

export const SIDE_BEARING = 40;
export const MIN_ADVANCE_WIDTH = 220;
