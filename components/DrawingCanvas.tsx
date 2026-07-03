"use client";

import { useEffect, useRef } from "react";
import type { CharDef } from "@/lib/font/charset";
import {
  ABOVE_ZONE,
  ASCENDER,
  BASELINE,
  BELOW_ZONE,
  CELL_BOTTOM,
  CELL_LEFT,
  CELL_RIGHT,
  CELL_TOP,
  DESCENDER,
  X_HEIGHT,
} from "@/lib/font/constants";
import type { Point } from "@/lib/font/types";
import type { StoredStroke } from "@/lib/storage";

const CANVAS_WIDTH = 440;
const CANVAS_HEIGHT = Math.round((CANVAS_WIDTH * (CELL_TOP - CELL_BOTTOM)) / (CELL_RIGHT - CELL_LEFT));
const SCALE = CANVAS_WIDTH / (CELL_RIGHT - CELL_LEFT);

function fontToCanvas(p: Point): Point {
  return { x: (p.x - CELL_LEFT) * SCALE, y: (CELL_TOP - p.y) * SCALE };
}

function canvasToFont(x: number, y: number): Point {
  return { x: x / SCALE + CELL_LEFT, y: CELL_TOP - y / SCALE };
}

interface Props {
  charDef: CharDef;
  strokes: StoredStroke[];
  penWidth: number;
  onStrokesChange: (strokes: StoredStroke[]) => void;
}

export default function DrawingCanvas({ charDef, strokes, penWidth, onStrokesChange }: Props) {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const drawingRef = useRef<Point[] | null>(null);

  function drawLine(
    ctx: CanvasRenderingContext2D,
    fontY: number,
    color: string,
    dash: number[],
    label: string,
  ) {
    const a = fontToCanvas({ x: CELL_LEFT, y: fontY });
    const b = fontToCanvas({ x: CELL_RIGHT, y: fontY });
    ctx.save();
    ctx.strokeStyle = color;
    ctx.lineWidth = dash.length === 0 ? 1.2 : 1;
    ctx.setLineDash(dash);
    ctx.beginPath();
    ctx.moveTo(a.x, a.y);
    ctx.lineTo(b.x, b.y);
    ctx.stroke();
    ctx.restore();

    ctx.save();
    ctx.font = '9px "Sarabun", sans-serif';
    ctx.fillStyle = color;
    ctx.textBaseline = "bottom";
    ctx.fillText(label, a.x + 2, a.y - 2);
    ctx.restore();
  }

  function drawZoneBand(ctx: CanvasRenderingContext2D, fromY: number, toY: number) {
    const top = fontToCanvas({ x: CELL_LEFT, y: toY });
    const bottom = fontToCanvas({ x: CELL_RIGHT, y: fromY });
    ctx.save();
    ctx.fillStyle = "rgba(198, 156, 74, 0.16)";
    ctx.fillRect(top.x, top.y, bottom.x - top.x, bottom.y - top.y);
    ctx.restore();
  }

  function paintStroke(ctx: CanvasRenderingContext2D, points: readonly Point[], width: number) {
    if (points.length === 0) return;
    ctx.lineWidth = Math.max(1, width * SCALE);
    ctx.lineCap = "round";
    ctx.lineJoin = "round";
    ctx.strokeStyle = "#1c2747";
    ctx.beginPath();
    const first = fontToCanvas(points[0]);
    if (points.length === 1) {
      ctx.arc(first.x, first.y, ctx.lineWidth / 2, 0, Math.PI * 2);
      ctx.fillStyle = "#1c2747";
      ctx.fill();
      return;
    }
    ctx.moveTo(first.x, first.y);
    for (let i = 1; i < points.length; i++) {
      const c = fontToCanvas(points[i]);
      ctx.lineTo(c.x, c.y);
    }
    ctx.stroke();
  }

  function redraw() {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext("2d");
    if (!ctx) return;
    ctx.clearRect(0, 0, canvas.width, canvas.height);
    ctx.fillStyle = "#fffdf7";
    ctx.fillRect(0, 0, canvas.width, canvas.height);

    // faint reference character, as a drawing aid — never part of the exported glyph
    ctx.save();
    ctx.globalAlpha = 0.16;
    ctx.fillStyle = "#2b3a67";
    ctx.font = `${Math.round((X_HEIGHT - DESCENDER) * SCALE)}px "Noto Sans Thai", sans-serif`;
    ctx.textBaseline = "alphabetic";
    const basePt = fontToCanvas({ x: 60, y: BASELINE });
    ctx.fillText(charDef.char, basePt.x, basePt.y);
    ctx.restore();

    if (charDef.zone === "above") {
      drawZoneBand(ctx, ABOVE_ZONE.bottom, ABOVE_ZONE.top);
    } else if (charDef.zone === "below") {
      drawZoneBand(ctx, BELOW_ZONE.bottom, BELOW_ZONE.top);
    }

    drawLine(ctx, ASCENDER, "#9aa5c4", [1, 3], "เส้นบน");
    drawLine(ctx, X_HEIGHT, "#6b7ba8", [5, 3], "x-height");
    drawLine(ctx, BASELINE, "#2b3a67", [], "เส้นฐาน");
    drawLine(ctx, DESCENDER, "#9aa5c4", [1, 3], "เส้นล่าง");

    for (const s of strokes) paintStroke(ctx, s.points, s.width);
    if (drawingRef.current) paintStroke(ctx, drawingRef.current, penWidth);
  }

  useEffect(() => {
    redraw();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [strokes, charDef, penWidth]);

  function pointerPos(e: React.PointerEvent<HTMLCanvasElement>): Point {
    const rect = canvasRef.current!.getBoundingClientRect();
    const x = ((e.clientX - rect.left) / rect.width) * CANVAS_WIDTH;
    const y = ((e.clientY - rect.top) / rect.height) * CANVAS_HEIGHT;
    return canvasToFont(x, y);
  }

  function handlePointerDown(e: React.PointerEvent<HTMLCanvasElement>) {
    e.currentTarget.setPointerCapture(e.pointerId);
    drawingRef.current = [pointerPos(e)];
    redraw();
  }

  function handlePointerMove(e: React.PointerEvent<HTMLCanvasElement>) {
    if (!drawingRef.current) return;
    drawingRef.current.push(pointerPos(e));
    redraw();
  }

  function commitStroke() {
    const points = drawingRef.current;
    drawingRef.current = null;
    if (points && points.length > 0) {
      onStrokesChange([...strokes, { points, width: penWidth }]);
    } else {
      redraw();
    }
  }

  return (
    <canvas
      ref={canvasRef}
      width={CANVAS_WIDTH}
      height={CANVAS_HEIGHT}
      className="drawing-canvas"
      onPointerDown={handlePointerDown}
      onPointerMove={handlePointerMove}
      onPointerUp={commitStroke}
      onPointerLeave={commitStroke}
      onPointerCancel={commitStroke}
    />
  );
}
