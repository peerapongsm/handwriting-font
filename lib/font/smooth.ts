import type { Point, Stroke } from "./types";

const DEDUPE_EPSILON = 0.5;

function dist(a: Point, b: Point): number {
  return Math.hypot(a.x - b.x, a.y - b.y);
}

/** Drop consecutive points closer together than DEDUPE_EPSILON. */
export function dedupePoints(points: readonly Point[]): Point[] {
  const out: Point[] = [];
  for (const p of points) {
    const prev = out[out.length - 1];
    if (!prev || dist(prev, p) >= DEDUPE_EPSILON) out.push(p);
  }
  return out;
}

function quadraticPoint(p0: Point, control: Point, p1: Point, t: number): Point {
  const mt = 1 - t;
  return {
    x: mt * mt * p0.x + 2 * mt * t * control.x + t * t * p1.x,
    y: mt * mt * p0.y + 2 * mt * t * control.y + t * t * p1.y,
  };
}

/**
 * Smooth a raw polyline by fitting a Catmull-Rom spline through its points, then
 * re-expressing each spline segment as a quadratic bezier (TrueType-native curve
 * type) and sampling it densely. Returns a smoothed polyline.
 */
export function smoothStroke(rawStroke: Stroke, samplesPerSegment = 8): Point[] {
  const pts = dedupePoints(rawStroke);
  if (pts.length < 3) return pts;

  const result: Point[] = [pts[0]];
  for (let i = 0; i < pts.length - 1; i++) {
    const p0 = pts[Math.max(0, i - 1)];
    const p1 = pts[i];
    const p2 = pts[i + 1];
    const p3 = pts[Math.min(pts.length - 1, i + 2)];

    // Catmull-Rom -> cubic bezier control points, then collapse to one quadratic
    // control point (midpoint of the two cubic controls) — a standard, simple
    // approximation that is exact for straight/collinear input.
    const b1: Point = { x: p1.x + (p2.x - p0.x) / 6, y: p1.y + (p2.y - p0.y) / 6 };
    const b2: Point = { x: p2.x - (p3.x - p1.x) / 6, y: p2.y - (p3.y - p1.y) / 6 };
    const control: Point = { x: (b1.x + b2.x) / 2, y: (b1.y + b2.y) / 2 };

    for (let s = 1; s <= samplesPerSegment; s++) {
      result.push(quadraticPoint(p1, control, p2, s / samplesPerSegment));
    }
  }
  return result;
}
