"use client";

import { useRouter } from "next/navigation";
import { CHARSET } from "@/lib/font/charset";

export default function MethodPage() {
  const router = useRouter();

  return (
    <>
      <header className="app-header">
        <h1>วิธีทำงาน / ข้อจำกัด</h1>
        <div className="nav-buttons">
          <button type="button" className="btn btn-outline" onClick={() => router.push("/")}>
            กลับไปวาดฟอนต์
          </button>
        </div>
      </header>
      <main>
        <div className="method-content">
          <div className="privacy-box">
            <strong>ความเป็นส่วนตัว:</strong> ทุกอย่างทำงานบนเครื่องคุณ 100% — ลายมือที่วาด, ตัวฟอนต์ที่สร้าง,
            ไม่มีการอัปโหลดขึ้นเซิร์ฟเวอร์ใดๆ ทั้งสิ้น ไฟล์ .ttf ที่ดาวน์โหลดได้เป็นทรัพย์สินของคุณเต็มที่
            เอาไปติดตั้งใช้งาน แจกจ่าย หรือทำอะไรก็ได้ตามใจ
          </div>

          <div className="caveat-box" style={{ marginTop: 14 }}>
            <strong>ข้อจำกัดที่ควรรู้ (honesty caveat):</strong> ฟอนต์นี้<strong>ไม่มี GPOS</strong>{" "}
            (mark positioning แบบที่ฟอนต์มืออาชีพใช้) สระบน/ล่างและวรรณยุกต์จึงวางในตำแหน่ง{" "}
            <strong>ตายตัวคงที่</strong> (fixed position) ไม่ได้ปรับตามรูปทรงของพยัญชนะแต่ละตัว —
            อาจซ้อนทับกันแปลกๆ ได้ในบางคู่ตัวอักษร (เช่น สระบนกับพยัญชนะที่มีหัวสูง) ฟอนต์เชิงพาณิชย์จริงจะมีระบบ
            ปรับตำแหน่งอัตโนมัติที่ซับซ้อนกว่านี้มาก เราเลือกความเรียบง่าย + โปร่งใส มากกว่าความสมบูรณ์แบบ
          </div>

          <h2>Flow การทำงาน</h2>
          <p>
            เลือกชุดตัวอักษรที่อยากวาด → วาดทีละตัวบน canvas (มีเส้นไกด์ baseline/x-height/เส้นบน +
            ตัวอย่างจางๆ ช่วยวาง) → พรีวิวประโยคด้วยฟอนต์ตัวเองแบบเรียลไทม์ → ดาวน์โหลด .ttf งานที่วาดค้างไว้
            จะถูกเก็บใน localStorage ของเบราว์เซอร์ กลับมาวาดต่อวันหลังได้ ขั้นต่ำวาดแค่ 1 ตัวก็ดาวน์โหลดได้แล้ว
            ตัวไหนไม่วาด = ไม่อยู่ในฟอนต์ (ระบบจะ fallback ไปฟอนต์อื่นแทนตอนพิมพ์)
          </p>

          <h2>ชุดตัวอักษร ({CHARSET.length} ตัว)</h2>
          <ul>
            <li>พยัญชนะไทย 44 ตัว (ก-ฮ ไม่รวม ฤ ฦ ซึ่งเป็นพยัญชนะกึ่งสระที่ใช้น้อย)</li>
            <li>สระ/วรรณยุกต์/เครื่องหมาย 27 ตัว — วาดเป็น combining mark ตำแหน่งคงที่ (ดู caveat ด้านบน)</li>
            <li>เลขไทย 10 ตัว (๐-๙)</li>
            <li>a-z, A-Z, 0-9 รวม 62 ตัว</li>
            <li>เครื่องหมายวรรคตอนพื้นฐาน 15 ตัว</li>
          </ul>

          <h2>Engine เขียนเองทั้งหมด — ไม่มี dependency</h2>
          <p>
            หัวใจของแอปนี้คือ <strong>TTF encoder ที่เขียนขึ้นเองทั้งหมด</strong> (
            <code>lib/font/ttf.ts</code>) ไม่ได้พึ่ง library ทำฟอนต์ใดๆ เลย เขียนตาราง{" "}
            <code>head, hhea, maxp, hmtx, cmap (format 4), glyf, loca, name, post</code> ด้วยมือ พร้อมคำนวณ
            checksum ของทุกตาราง รวมถึง <code>checkSumAdjustment</code> ของทั้งไฟล์ให้ถูกต้องตามสเปก
            TrueType — เพื่อพิสูจน์ความถูกต้อง เราเขียน TTF <strong>parser</strong> ขั้นต่ำขึ้นมาเองสำหรับ
            test เท่านั้น (<code>lib/font/parse.ts</code>) แล้ว round-trip: เข้ารหัสฟอนต์ → ถอดรหัสกลับ →
            เทียบว่า glyph outline, metrics, cmap ตรงกับต้นฉบับทุกจุด
          </p>

          <h2>จากลายเส้นสู่ตัวอักษร</h2>
          <p>
            เส้นที่วาด (polyline จาก pointer events) จะถูก smooth ด้วย Catmull-Rom spline แล้วแปลงเป็น
            quadratic bezier (รูปแบบเส้นโค้งที่ TrueType ใช้เป็นค่าตั้งต้น) จากนั้นขยายเส้น (stroke) ให้เป็น
            outline ปิด (offset polygon แบบง่าย พร้อม circle-join ที่ปลายเส้นให้มน) — คณิตศาสตร์ตรงนี้เขียนเอง
            ทั้งหมดเช่นกัน (<code>lib/font/outline.ts</code>) unitsPerEm ตั้งไว้ที่ 1000 ตามมาตรฐานฟอนต์ทั่วไป
          </p>

          <h2>Preview คือ proof จริง</h2>
          <p>
            ทุกครั้งที่วาดเสร็จ แอปจะ encode ฟอนต์ .ttf ขึ้นมาสดๆ ในหน่วยความจำ แล้วโหลดผ่าน{" "}
            <code>FontFace</code> API ของเบราว์เซอร์ทันที — ถ้าฟอนต์ที่เข้ารหัสมามีปัญหา (checksum ผิด,
            table เสีย) เบราว์เซอร์จะโหลดไม่ผ่านและพรีวิวจะไม่ขึ้น ดังนั้นกล่องพรีวิวที่เห็นคือบทพิสูจน์ว่า
            encoder ทำงานถูกต้องจริงๆ ไม่ใช่แค่ทดสอบผ่าน unit test เท่านั้น
          </p>
        </div>
      </main>
      <footer className="app-footer">
        <p>ฟอนต์ลายมือคุณ · เขียน TTF encoder เองทั้งหมด ไม่มี dependency</p>
      </footer>
    </>
  );
}
