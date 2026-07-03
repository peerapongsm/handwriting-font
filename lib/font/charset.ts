// Charset definition for the handwriting font, per spec §2.
//
// Groups:
//   consonants  - Thai consonants ก..ฮ, excluding ฤ(0E24)/ฦ(0E26) which are rare
//                 "vocalic consonants" not counted in the standard 44.
//   vowelsTones - Thai vowels/tone marks/signs (27). Per spec §5 these are ALL
//                 rendered as fixed-position combining glyphs: advance width 0,
//                 drawn in an "above" / "below" / "base" guideline zone. This is
//                 a deliberate simplification (no GPOS) — see /method for the
//                 honesty caveat about overlap on some pairs.
//   thaiDigits  - Thai numerals ๐..๙ (10)
//   latin       - a-z, A-Z, 0-9 (62)
//   punctuation - ~15 common punctuation marks

export type GlyphZone = "base" | "above" | "below";

export type GroupId = "consonants" | "vowelsTones" | "thaiDigits" | "latin" | "punctuation";

export interface GroupDef {
  id: GroupId;
  label: string;
}

export interface CharDef {
  id: string;
  char: string;
  codepoint: number;
  group: GroupId;
  /** Combining marks get advance width forced to 0 and are drawn in a guideline zone. */
  combining: boolean;
  zone: GlyphZone;
}

function range(start: number, end: number): number[] {
  const out: number[] = [];
  for (let cp = start; cp <= end; cp++) out.push(cp);
  return out;
}

const CONSONANT_CODEPOINTS = range(0x0e01, 0x0e2e).filter((cp) => cp !== 0x0e24 && cp !== 0x0e26);

const VOWEL_TONE_ABOVE = new Set([0x0e31, 0x0e34, 0x0e35, 0x0e36, 0x0e37, 0x0e47, 0x0e48, 0x0e49, 0x0e4a, 0x0e4b, 0x0e4c, 0x0e4d, 0x0e4e]);
const VOWEL_TONE_BELOW = new Set([0x0e38, 0x0e39, 0x0e3a]);
const VOWEL_TONE_CODEPOINTS = [0x0e2f, ...range(0x0e30, 0x0e3a), ...range(0x0e40, 0x0e4e)];

const THAI_DIGIT_CODEPOINTS = range(0x0e50, 0x0e59);

const LATIN_CODEPOINTS = [...range(0x0061, 0x007a), ...range(0x0041, 0x005a), ...range(0x0030, 0x0039)];

const PUNCTUATION_CODEPOINTS = [
  0x002e, // .
  0x002c, // ,
  0x0021, // !
  0x003f, // ?
  0x003a, // :
  0x003b, // ;
  0x0027, // '
  0x0022, // "
  0x0028, // (
  0x0029, // )
  0x002d, // -
  0x005f, // _
  0x002f, // /
  0x0e3f, // ฿
  0x0040, // @
];

export const GROUPS: GroupDef[] = [
  { id: "consonants", label: "พยัญชนะไทย" },
  { id: "vowelsTones", label: "สระ/วรรณยุกต์/เครื่องหมาย" },
  { id: "thaiDigits", label: "เลขไทย" },
  { id: "latin", label: "a-z A-Z 0-9" },
  { id: "punctuation", label: "เครื่องหมายวรรคตอน" },
];

function toCharDefs(group: GroupId, codepoints: number[]): CharDef[] {
  return codepoints.map((cp) => ({
    id: `${group}-${cp.toString(16)}`,
    char: String.fromCodePoint(cp),
    codepoint: cp,
    group,
    combining: group === "vowelsTones",
    zone: VOWEL_TONE_ABOVE.has(cp) ? "above" : VOWEL_TONE_BELOW.has(cp) ? "below" : "base",
  }));
}

export const CHARSET: CharDef[] = [
  ...toCharDefs("consonants", CONSONANT_CODEPOINTS),
  ...toCharDefs("vowelsTones", VOWEL_TONE_CODEPOINTS),
  ...toCharDefs("thaiDigits", THAI_DIGIT_CODEPOINTS),
  ...toCharDefs("latin", LATIN_CODEPOINTS),
  ...toCharDefs("punctuation", PUNCTUATION_CODEPOINTS),
];

export function charsInGroup(group: GroupId): CharDef[] {
  return CHARSET.filter((c) => c.group === group);
}

export function findChar(id: string): CharDef | undefined {
  return CHARSET.find((c) => c.id === id);
}
