import type { Metadata } from "next";
import { Pridi, Sarabun } from "next/font/google";
import "./globals.css";

const pridi = Pridi({
  subsets: ["thai", "latin"],
  weight: ["400", "500", "600"],
  variable: "--font-pridi",
  display: "swap",
});

const sarabun = Sarabun({
  subsets: ["thai", "latin"],
  weight: ["300", "400", "500", "600"],
  variable: "--font-sarabun",
  display: "swap",
});

export const metadata: Metadata = {
  title: "ฟอนต์ลายมือคุณ",
  description: "วาดตัวอักษรบนจอ ได้ไฟล์ฟอนต์ .ttf ลายมือตัวเองจริงๆ ฟรี 100% in-browser",
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="th" className={`${pridi.variable} ${sarabun.variable}`}>
      <head>
        <script
          defer
          src="https://umami-host-peerapongsms-projects.vercel.app/script.js"
          data-website-id="3f09453d-0b39-443e-8845-5e65611cc58a"
        />
      </head>
      <body>{children}</body>
    </html>
  );
}
