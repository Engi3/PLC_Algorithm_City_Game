"use client";

import { useState } from "react";
import { generateCertificatePdf, generateCertificateImage, backgroundUrlFor } from "@/lib/certificate/generate";
import { ALL_COMPETENCY_AXES, COMPETENCY_LABELS_TH, type CompetencyAxis } from "@/lib/analytics/competency";

const BACKGROUND_COUNT = 6;

/**
 * Task 3: dynamic certificate generator - lets the student preview and pick
 * one of the 6 pre-designed backgrounds (defaulting to a per-axis auto
 * assignment, since there are exactly 6 competency axes and 6 backgrounds)
 * before downloading as PDF or PNG. The live preview below uses the same
 * positioning/copy as generate.ts's off-screen render, just scaled down and
 * loading the background straight from /public instead of a data: URL
 * (only the html2canvas capture path needs the data: URL trick).
 */
export default function CertificateGenerator({
  axis,
  score,
  studentName,
  studentId,
  userId,
  rankLabel,
  onClose,
}: {
  axis: CompetencyAxis;
  score: number;
  studentName: string;
  studentId: string | null;
  userId: string;
  rankLabel?: string;
  onClose: () => void;
}) {
  const defaultBackground = (ALL_COMPETENCY_AXES.indexOf(axis) % BACKGROUND_COUNT) + 1;
  const [backgroundIndex, setBackgroundIndex] = useState(defaultBackground);
  const [generating, setGenerating] = useState<"pdf" | "image" | null>(null);
  const [error, setError] = useState<string | null>(null);

  const dateLabel = new Date().toLocaleDateString("th-TH-u-ca-buddhist", { year: "numeric", month: "long", day: "numeric" });

  async function handleDownload(kind: "pdf" | "image") {
    setGenerating(kind);
    setError(null);
    try {
      const verifyUrl = `${window.location.origin}/certificate/verify/${userId}/${axis}`;
      const data = {
        studentName,
        studentId,
        axisLabel: COMPETENCY_LABELS_TH[axis],
        score,
        rankLabel,
        dateLabel,
        verifyUrl,
        backgroundIndex,
      };
      if (kind === "pdf") await generateCertificatePdf(data);
      else await generateCertificateImage(data);
    } catch (err) {
      console.error(`generateCertificate${kind} failed:`, err);
      setError("สร้างไฟล์ไม่สำเร็จ กรุณาลองใหม่");
    } finally {
      setGenerating(null);
    }
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4" onClick={onClose}>
      <div
        className="flex max-h-[90vh] w-full max-w-2xl flex-col gap-4 overflow-y-auto rounded-lg bg-white p-5 shadow-xl dark:bg-zinc-950"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="flex items-center justify-between">
          <h3 className="text-sm font-semibold text-zinc-900 dark:text-zinc-50">🏆 ใบประกาศนียบัตร - {COMPETENCY_LABELS_TH[axis]}</h3>
          <button
            type="button"
            onClick={onClose}
            aria-label="Close"
            className="text-zinc-400 hover:text-zinc-600 dark:hover:text-zinc-200"
          >
            x
          </button>
        </div>

        {/* Live preview - approximates generate.ts's off-screen render at a smaller scale */}
        <div
          className="relative aspect-[1200/850] w-full overflow-hidden rounded-md border border-zinc-200 bg-cover bg-center dark:border-zinc-800"
          style={{ backgroundImage: `url('${backgroundUrlFor(backgroundIndex)}')` }}
        >
          <div className="flex h-full w-full flex-col items-center justify-center gap-1 px-[8%] py-[8%] text-center">
            <p className="text-[11px] font-semibold tracking-widest text-slate-600 sm:text-sm">PLC ALGORITHM Practice</p>
            <p className="text-[11px] font-semibold tracking-widest text-blue-600 sm:text-sm">CERTIFICATE OF COMPETENCY</p>
            <p className="mt-2 text-lg font-bold text-slate-800 sm:text-2xl">ใบประกาศนียบัตรความสามารถ</p>
            <p className="mt-3 text-xs text-slate-500 sm:text-sm">ขอมอบให้เพื่อแสดงว่า</p>
            <p className="text-xl font-bold text-blue-700 sm:text-3xl">{studentName}</p>
            {studentId && <p className="mb-1 text-[11px] text-slate-400 sm:text-xs">รหัสนักศึกษา {studentId}</p>}
            <p className="mt-3 text-xs text-slate-500 sm:text-sm">มีความสามารถผ่านเกณฑ์ในด้าน</p>
            <p className="text-base font-bold text-slate-800 sm:text-lg">{COMPETENCY_LABELS_TH[axis]}</p>
            <p className="text-xs font-semibold text-green-600 sm:text-sm">คะแนน {score}/100</p>
            {rankLabel && <p className="text-[11px] font-semibold text-amber-700 sm:text-xs">อันดับ {rankLabel}</p>}
            <p className="mt-2 text-[11px] text-slate-400 sm:text-xs">ออกให้เมื่อวันที่ {dateLabel}</p>
          </div>
        </div>

        <div>
          <p className="mb-2 text-xs font-semibold uppercase tracking-wide text-zinc-500 dark:text-zinc-400">เลือกพื้นหลัง</p>
          <div className="flex flex-wrap gap-2">
            {Array.from({ length: BACKGROUND_COUNT }, (_, i) => i + 1).map((n) => (
              <button
                key={n}
                type="button"
                onClick={() => setBackgroundIndex(n)}
                className={`h-14 w-20 overflow-hidden rounded border-2 bg-cover bg-center transition-colors ${
                  backgroundIndex === n ? "border-blue-600" : "border-zinc-200 hover:border-zinc-400 dark:border-zinc-700"
                }`}
                style={{ backgroundImage: `url('${backgroundUrlFor(n)}')` }}
                aria-label={`พื้นหลังแบบที่ ${n}`}
              />
            ))}
          </div>
        </div>

        <div className="flex flex-wrap gap-2">
          <button
            type="button"
            onClick={() => handleDownload("pdf")}
            disabled={generating !== null}
            className="rounded-md bg-amber-600 px-4 py-2 text-sm font-medium text-white hover:bg-amber-700 disabled:opacity-60"
          >
            {generating === "pdf" ? "กำลังสร้าง..." : "📄 ดาวน์โหลด PDF"}
          </button>
          <button
            type="button"
            onClick={() => handleDownload("image")}
            disabled={generating !== null}
            className="rounded-md border border-zinc-300 px-4 py-2 text-sm font-medium text-zinc-700 hover:bg-zinc-50 disabled:opacity-60 dark:border-zinc-700 dark:text-zinc-300 dark:hover:bg-zinc-900"
          >
            {generating === "image" ? "กำลังสร้าง..." : "🖼 ดาวน์โหลดรูปภาพ (PNG)"}
          </button>
        </div>
        {error && <p className="text-xs text-red-600 dark:text-red-400">{error}</p>}
      </div>
    </div>
  );
}
