import { describe, expect, it } from "vitest";
import { CHARSET, charsInGroup, findChar } from "./charset";

describe("charset", () => {
  it("has the exact group sizes from spec §2", () => {
    expect(charsInGroup("consonants")).toHaveLength(44);
    expect(charsInGroup("vowelsTones")).toHaveLength(27);
    expect(charsInGroup("thaiDigits")).toHaveLength(10);
    expect(charsInGroup("latin")).toHaveLength(62);
    expect(charsInGroup("punctuation")).toHaveLength(15);
  });

  it("has no duplicate codepoints", () => {
    const seen = new Set<number>();
    for (const c of CHARSET) {
      expect(seen.has(c.codepoint)).toBe(false);
      seen.add(c.codepoint);
    }
  });

  it("has no duplicate ids", () => {
    const ids = new Set(CHARSET.map((c) => c.id));
    expect(ids.size).toBe(CHARSET.length);
  });

  it("marks every vowelsTones char as combining, everything else as not", () => {
    for (const c of CHARSET) {
      expect(c.combining).toBe(c.group === "vowelsTones");
    }
  });

  it("excludes ฤ and ฦ from consonants", () => {
    const codepoints = charsInGroup("consonants").map((c) => c.codepoint);
    expect(codepoints).not.toContain(0x0e24);
    expect(codepoints).not.toContain(0x0e26);
  });

  it("assigns above/below zones only within vowelsTones", () => {
    for (const c of CHARSET) {
      if (c.group !== "vowelsTones") {
        expect(c.zone).toBe("base");
      }
    }
    const zones = charsInGroup("vowelsTones").map((c) => c.zone);
    expect(zones.filter((z) => z === "above")).toHaveLength(13);
    expect(zones.filter((z) => z === "below")).toHaveLength(3);
    expect(zones.filter((z) => z === "base")).toHaveLength(11);
  });

  it("findChar resolves a known id", () => {
    const kaKai = findChar("consonants-e01");
    expect(kaKai?.char).toBe("ก");
  });
});
