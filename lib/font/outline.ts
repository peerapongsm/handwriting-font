import { dedupePoints } from "./smooth";
import type { Contour, OutlinePoint, Point } from "./types";

function normalize(v: Point): Point {
  const len = Math.hypot(v.x, v.y);
  if (len === 0) return { x: 0, y: 0 };
  return { x: v.x / len, y: v.y / len };
}

function sub(a: Point, b: Point): Point {
  return { x: a.x - b.x, y: a.y - b.y };
}

function segmentNormal(a: Point, b: Point): Point {
  const d = normalize(sub(b, a));
  return { x: -d.y, y: d.x };
}

/** Points on the circular arc of radius r around `center`, from angle(from) sweeping
 *  clockwise (delta = -PI) to angle(to). Excludes both endpoints. */
function capArc(center: Point, from: Point, steps: number): Point[] {
  const r = Math.hypot(from.x - center.x, from.y - center.y);
  const a0 = Math.atan2(from.y - center.y, from.x - center.x);
  const pts: Point[] = [];
  for (let s = 1; s < steps; s++) {
    const a = a0 - Math.PI * (s / steps);
    pts.push({ x: center.x + r * Math.cos(a), y: center.y + r * Math.sin(a) });
  }
  return pts;
}

function circlePolygon(center: Point, radius: number, steps: number): Point[] {
  const pts: Point[] = [];
  for (let s = 0; s < steps; s++) {
    const a = (2 * Math.PI * s) / steps;
    pts.push({ x: center.x + radius * Math.cos(a), y: center.y + radius * Math.sin(a) });
  }
  return pts;
}

function asOnCurve(points: Point[]): Contour {
  return points.map((p): OutlinePoint => ({ x: p.x, y: p.y, onCurve: true }));
}

/**
 * Expand a (smoothed) stroke centerline into a closed, filled outline contour, per
 * spec §3: "offset polygon อย่างง่าย: circle-join ปลายมน" — a simple offset polygon
 * with round (circle-arc) caps at both ends. Interior joints use the averaged
 * normal of their two adjacent segments (a simple miter), which is a safe
 * approximation once the input has been densely sampled by smoothStroke.
 */
export function strokeToOutline(rawPoints: readonly Point[], halfWidth: number, capSteps = 8): Contour {
  if (halfWidth <= 0) return [];
  const pts = dedupePoints(rawPoints);
  if (pts.length === 0) return [];
  if (pts.length === 1) return asOnCurve(circlePolygon(pts[0], halfWidth, capSteps * 2));

  const segNormals: Point[] = [];
  for (let i = 0; i < pts.length - 1; i++) segNormals.push(segmentNormal(pts[i], pts[i + 1]));

  const left: Point[] = [];
  const right: Point[] = [];
  for (let i = 0; i < pts.length; i++) {
    let n: Point;
    if (i === 0) n = segNormals[0];
    else if (i === pts.length - 1) n = segNormals[segNormals.length - 1];
    else {
      const n0 = segNormals[i - 1];
      const n1 = segNormals[i];
      const avg = normalize({ x: n0.x + n1.x, y: n0.y + n1.y });
      n = avg.x === 0 && avg.y === 0 ? n1 : avg;
    }
    left.push({ x: pts[i].x + n.x * halfWidth, y: pts[i].y + n.y * halfWidth });
    right.push({ x: pts[i].x - n.x * halfWidth, y: pts[i].y - n.y * halfWidth });
  }

  const endCap = capArc(pts[pts.length - 1], left[left.length - 1], capSteps);
  const startCap = capArc(pts[0], right[0], capSteps);

  const polygon = [...left, ...endCap, ...right.slice().reverse(), ...startCap];
  return asOnCurve(dedupePoints(polygon));
}
