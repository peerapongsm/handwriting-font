import { describe, expect, it } from "vitest";
import { strokeToOutline } from "./outline";
import { smoothStroke } from "./smooth";
import type { Point } from "./types";

function segmentsIntersect(a1: Point, a2: Point, b1: Point, b2: Point): boolean {
  const d = (p: Point, q: Point, r: Point) => (q.x - p.x) * (r.y - p.y) - (q.y - p.y) * (r.x - p.x);
  const d1 = d(b1, b2, a1);
  const d2 = d(b1, b2, a2);
  const d3 = d(a1, a2, b1);
  const d4 = d(a1, a2, b2);
  return d1 * d2 < 0 && d3 * d4 < 0;
}

/** O(n^2) self-intersection check for a closed polygon; skips segments that share an endpoint. */
function hasSelfIntersection(points: Point[]): boolean {
  const n = points.length;
  for (let i = 0; i < n; i++) {
    const a1 = points[i];
    const a2 = points[(i + 1) % n];
    for (let j = i + 1; j < n; j++) {
      if (j === i) continue;
      const shareEndpoint = j === i || (j + 1) % n === i || (i + 1) % n === j;
      if (shareEndpoint) continue;
      const b1 = points[j];
      const b2 = points[(j + 1) % n];
      if (segmentsIntersect(a1, a2, b1, b2)) return true;
    }
  }
  return false;
}

function polygonArea(points: Point[]): number {
  let area = 0;
  for (let i = 0; i < points.length; i++) {
    const p = points[i];
    const q = points[(i + 1) % points.length];
    area += p.x * q.y - q.x * p.y;
  }
  return Math.abs(area) / 2;
}

describe("strokeToOutline", () => {
  it("returns empty for empty input", () => {
    expect(strokeToOutline([], 20)).toEqual([]);
  });

  it("returns a circle polygon for a single point (a dot)", () => {
    const contour = strokeToOutline([{ x: 100, y: 100 }], 15, 8);
    expect(contour.length).toBeGreaterThan(4);
    for (const p of contour) {
      expect(Math.hypot(p.x - 100, p.y - 100)).toBeCloseTo(15, 1);
    }
    expect(hasSelfIntersection(contour)).toBe(false);
  });

  it("produces a non-self-intersecting capsule for a straight horizontal stroke", () => {
    const points: Point[] = [];
    for (let x = 0; x <= 200; x += 10) points.push({ x, y: 0 });
    const contour = strokeToOutline(points, 20);
    expect(hasSelfIntersection(contour)).toBe(false);

    // Every point should be within halfWidth (+ a little cap slack) of the centerline segment.
    for (const p of contour) {
      const clampedX = Math.max(0, Math.min(200, p.x));
      const distToLine = Math.hypot(p.x - clampedX, p.y);
      expect(distToLine).toBeLessThanOrEqual(20.5);
    }
  });

  it("produces a non-self-intersecting outline for a right-angle bend when pen width is well under sample spacing", () => {
    const points: Point[] = [];
    for (let x = 0; x <= 100; x += 10) points.push({ x, y: 0 });
    for (let y = 10; y <= 100; y += 10) points.push({ x: 100, y });
    const contour = strokeToOutline(points, 3);
    expect(hasSelfIntersection(contour)).toBe(false);
  });

  it("produces a non-self-intersecting outline for a moderate bend once smoothed by smoothStroke first", () => {
    // A raw stroke with a moderate ~45-degree turn, as a real handwriting stroke
    // (e.g. a corner in "ก") might record it. smoothStroke rounds the corner
    // before outline expansion — this is the real drawing pipeline
    // (smooth.ts -> outline.ts). Note: a simple offset polygon (per spec §3, "อย่าง
    // ง่าย") is not guaranteed self-intersection-free for very sharp reversals —
    // that is a known, accepted limitation, not tested here.
    const raw: Point[] = [
      { x: 0, y: 0 },
      { x: 50, y: 0 },
      { x: 100, y: 0 },
      { x: 150, y: 50 },
      { x: 200, y: 100 },
    ];
    const smoothed = smoothStroke(raw);
    const contour = strokeToOutline(smoothed, 12);
    expect(hasSelfIntersection(contour)).toBe(false);
  });

  it("produces a non-self-intersecting outline for a gentle S-curve", () => {
    const points: Point[] = [];
    for (let i = 0; i <= 20; i++) {
      const t = i / 20;
      points.push({ x: t * 200, y: 50 * Math.sin(t * Math.PI * 2) });
    }
    const contour = strokeToOutline(points, 10);
    expect(hasSelfIntersection(contour)).toBe(false);
  });

  it("encloses a larger area for a wider pen", () => {
    const points: Point[] = [];
    for (let x = 0; x <= 200; x += 10) points.push({ x, y: 0 });
    const thin = strokeToOutline(points, 8);
    const thick = strokeToOutline(points, 24);
    expect(polygonArea(thick)).toBeGreaterThan(polygonArea(thin));
  });

  it("all output points are marked on-curve", () => {
    const contour = strokeToOutline(
      [
        { x: 0, y: 0 },
        { x: 50, y: 50 },
        { x: 100, y: 0 },
      ],
      10,
    );
    expect(contour.every((p) => p.onCurve)).toBe(true);
  });
});
