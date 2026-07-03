import { describe, expect, it } from "vitest";
import { dedupePoints, smoothStroke } from "./smooth";

describe("dedupePoints", () => {
  it("drops consecutive near-duplicate points", () => {
    const points = [
      { x: 0, y: 0 },
      { x: 0.1, y: 0.1 },
      { x: 50, y: 50 },
    ];
    expect(dedupePoints(points)).toEqual([
      { x: 0, y: 0 },
      { x: 50, y: 50 },
    ]);
  });

  it("keeps points that are far enough apart", () => {
    const points = [
      { x: 0, y: 0 },
      { x: 10, y: 0 },
      { x: 20, y: 0 },
    ];
    expect(dedupePoints(points)).toEqual(points);
  });
});

describe("smoothStroke", () => {
  it("returns short input unchanged (fewer than 3 points)", () => {
    const points = [
      { x: 0, y: 0 },
      { x: 10, y: 10 },
    ];
    expect(smoothStroke(points)).toEqual(points);
  });

  it("keeps collinear points on the same straight line (no bulge)", () => {
    const points = [
      { x: 0, y: 0 },
      { x: 50, y: 0 },
      { x: 100, y: 0 },
      { x: 150, y: 0 },
    ];
    const smoothed = smoothStroke(points);
    for (const p of smoothed) {
      expect(p.y).toBeCloseTo(0, 6);
    }
  });

  it("starts at the first input point and ends at the last", () => {
    const points = [
      { x: 0, y: 0 },
      { x: 30, y: 60 },
      { x: 100, y: 20 },
      { x: 140, y: 80 },
    ];
    const smoothed = smoothStroke(points);
    expect(smoothed[0]).toEqual(points[0]);
    const last = smoothed[smoothed.length - 1];
    expect(last.x).toBeCloseTo(points[points.length - 1].x, 6);
    expect(last.y).toBeCloseTo(points[points.length - 1].y, 6);
  });

  it("produces a denser polyline than the input", () => {
    const points = [
      { x: 0, y: 0 },
      { x: 30, y: 60 },
      { x: 100, y: 20 },
    ];
    const smoothed = smoothStroke(points, 8);
    expect(smoothed.length).toBeGreaterThan(points.length);
  });
});
