"use client";

import { useEffect, useRef, useState } from "react";

interface Props {
  fontBytes: Uint8Array | null;
  familyName: string;
}

const DEFAULT_PANGRAM =
  "เป็นมนุษย์สุดประเสริฐเลิศคุณค่า กว่าบรรดาฝูงสัตว์เดรัจฉาน The quick brown fox jumps 123.";

type Status = "idle" | "loading" | "ready" | "error";

export default function PreviewPanel({ fontBytes, familyName }: Props) {
  const [pangram, setPangram] = useState(DEFAULT_PANGRAM);
  const [status, setStatus] = useState<Status>("idle");
  const loadedFaceRef = useRef<FontFace | null>(null);

  useEffect(() => {
    let cancelled = false;

    async function load() {
      if (!fontBytes || fontBytes.length === 0) {
        setStatus("idle");
        return;
      }
      setStatus("loading");
      try {
        const buffer = fontBytes.slice().buffer;
        const face = new FontFace(familyName, buffer);
        const loaded = await face.load();
        if (cancelled) return;
        if (loadedFaceRef.current) {
          document.fonts.delete(loadedFaceRef.current);
        }
        document.fonts.add(loaded);
        loadedFaceRef.current = loaded;
        setStatus("ready");
      } catch (err) {
        console.error("FontFace load failed:", err);
        if (!cancelled) setStatus("error");
      }
    }

    load();
    return () => {
      cancelled = true;
    };
  }, [fontBytes, familyName]);

  function handleDownload() {
    if (!fontBytes) return;
    const blob = new Blob([fontBytes.slice()], { type: "font/ttf" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `${familyName.replace(/\s+/g, "-")}.ttf`;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    URL.revokeObjectURL(url);
  }

  const previewText =
    status === "ready"
      ? pangram
      : status === "loading"
        ? "กำลังสร้างฟอนต์..."
        : status === "error"
          ? "โหลดฟอนต์ไม่สำเร็จ ลองวาดใหม่อีกครั้ง"
          : "วาดตัวอักษรอย่างน้อย 1 ตัวเพื่อดูพรีวิว";

  return (
    <div className="preview-panel" data-preview-status={status}>
      <h2>พรีวิว — พิมพ์อะไรก็ได้ด้วยฟอนต์ของคุณเอง</h2>
      <textarea
        className="pangram-input"
        value={pangram}
        onChange={(e) => setPangram(e.target.value)}
        rows={3}
        aria-label="ข้อความพรีวิว"
      />
      <div className="pangram-preview" style={status === "ready" ? { fontFamily: `"${familyName}"` } : undefined}>
        {previewText}
      </div>
      <button type="button" className="btn-seal" disabled={status !== "ready"} onClick={handleDownload}>
        ดาวน์โหลด .ttf
      </button>
    </div>
  );
}
