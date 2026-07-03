"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import DrawingCanvas from "@/components/DrawingCanvas";
import GlyphPicker from "@/components/GlyphPicker";
import PreviewPanel from "@/components/PreviewPanel";
import { CHARSET, findChar, type GroupId } from "@/lib/font/charset";
import { buildFont, drawnGlyphCount } from "@/lib/font/build";
import { PEN_WIDTHS } from "@/lib/font/constants";
import { loadProgress, saveProgress, withGlyphStrokes, type StoredProgress, type StoredStroke } from "@/lib/storage";

const FAMILY_NAME = "MyHandwriting";
const PEN_LABELS = ["บาง", "กลาง", "หนา"];

export default function HomePage() {
  const router = useRouter();
  const [progress, setProgress] = useState<StoredProgress | null>(null);
  const [activeGroup, setActiveGroup] = useState<GroupId>("consonants");
  const [selectedId, setSelectedId] = useState<string>(CHARSET[0].id);
  const [penWidth, setPenWidth] = useState<number>(PEN_WIDTHS[0]);
  const [fontBytes, setFontBytes] = useState<Uint8Array | null>(null);

  useEffect(() => {
    setProgress(loadProgress());
  }, []);

  useEffect(() => {
    if (!progress) return;
    saveProgress(progress);
    const strokesById = Object.fromEntries(Object.entries(progress.glyphs).map(([id, g]) => [id, g.strokes]));
    setFontBytes(drawnGlyphCount(strokesById) > 0 ? buildFont(strokesById, FAMILY_NAME) : null);
  }, [progress]);

  const selectedChar = findChar(selectedId) ?? CHARSET[0];
  const currentStrokes = progress?.glyphs[selectedId]?.strokes ?? [];
  const totalDrawn = progress ? Object.keys(progress.glyphs).length : 0;

  function handleStrokesChange(strokes: StoredStroke[]) {
    setProgress((prev) => withGlyphStrokes(prev ?? loadProgress(), selectedId, strokes));
  }

  function isDrawn(id: string) {
    return (progress?.glyphs[id]?.strokes.length ?? 0) > 0;
  }

  if (!progress) return null;

  return (
    <>
      <header className="app-header">
        <h1>ฟอนต์ลายมือคุณ</h1>
        <p>วาดตัวอักษรบนจอ → ได้ไฟล์ฟอนต์ .ttf ลายมือตัวเองจริงๆ ฟรี 100% in-browser (วาดแล้ว {totalDrawn} ตัว)</p>
        <div className="nav-buttons">
          <button type="button" className="btn btn-outline" onClick={() => router.push("/method/")}>
            วิธีทำงาน / ข้อจำกัด
          </button>
        </div>
      </header>

      <main className="app-main">
        <GlyphPicker
          activeGroup={activeGroup}
          onGroupChange={setActiveGroup}
          selectedId={selectedId}
          onSelect={setSelectedId}
          isDrawn={isDrawn}
        />

        <section className="draw-section">
          <div className="draw-toolbar">
            <span className="current-char-label">
              กำลังวาด: <strong>{selectedChar.char}</strong>
              {selectedChar.combining && <span className="combining-badge">สระ/วรรณยุกต์ · advance 0</span>}
            </span>
            <div className="pen-widths">
              {PEN_WIDTHS.map((w, i) => (
                <button
                  key={w}
                  type="button"
                  className={`btn btn-pen${penWidth === w ? " active" : ""}`}
                  onClick={() => setPenWidth(w)}
                >
                  <span className="pen-dot" style={{ width: w / 2, height: w / 2 }} />
                  {PEN_LABELS[i]}
                </button>
              ))}
            </div>
          </div>

          <DrawingCanvas
            charDef={selectedChar}
            strokes={currentStrokes}
            penWidth={penWidth}
            onStrokesChange={handleStrokesChange}
          />

          <div className="draw-actions">
            <button
              type="button"
              className="btn btn-outline"
              onClick={() => handleStrokesChange(currentStrokes.slice(0, -1))}
              disabled={currentStrokes.length === 0}
            >
              ↶ ย้อนเส้นล่าสุด
            </button>
            <button
              type="button"
              className="btn btn-outline"
              onClick={() => handleStrokesChange([])}
              disabled={currentStrokes.length === 0}
            >
              ล้างตัวนี้
            </button>
          </div>
        </section>

        <PreviewPanel fontBytes={fontBytes} familyName={FAMILY_NAME} />
      </main>

      <footer className="app-footer">
        <p>ทุกอย่างทำงานบนเครื่องคุณ 100% ไม่มีการอัปโหลดข้อมูลใดๆ — ฟอนต์ที่ได้เป็นของคุณเต็มที่</p>
      </footer>
    </>
  );
}
