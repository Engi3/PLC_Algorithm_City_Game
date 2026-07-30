"use client";

import { useState } from "react";
import { generateCertificatePdf } from "@/lib/certificate/generate";
import { CERTIFICATE_THRESHOLD } from "@/lib/certificate/threshold";
import { COMPETENCY_LABELS_TH, type CompetencyAxis } from "@/lib/analytics/competency";

export default function CertificateCard({
  axis,
  score,
  studentName,
  userId,
}: {
  axis: CompetencyAxis;
  score: number;
  studentName: string;
  userId: string;
}) {
  const [generating, setGenerating] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const unlocked = score >= CERTIFICATE_THRESHOLD;

  async function handleDownload() {
    setGenerating(true);
    setError(null);
    try {
      const verifyUrl = `${window.location.origin}/certificate/verify/${userId}/${axis}`;
      await generateCertificatePdf({
        studentName,
        axisLabel: COMPETENCY_LABELS_TH[axis],
        score,
        dateLabel: new Date().toLocaleDateString("th-TH-u-ca-buddhist", { year: "numeric", month: "long", day: "numeric" }),
        verifyUrl,
      });
    } catch (err) {
      console.error("generateCertificatePdf failed:", err);
      setError("สร้าง PDF ไม่สำเร็จ กรุณาลองใหม่");
    } finally {
      setGenerating(false);
    }
  }

  if (!unlocked) {
    return (
      <div className="flex flex-col items-center justify-center gap-1 rounded-lg border border-dashed border-zinc-300 bg-zinc-50 p-4 text-center dark:border-zinc-700 dark:bg-zinc-900">
        <span className="text-2xl opacity-40" aria-hidden>
          🔒
        </span>
        <p className="text-xs font-medium text-zinc-500 dark:text-zinc-400">{COMPETENCY_LABELS_TH[axis]}</p>
        <p className="text-[11px] text-zinc-400 dark:text-zinc-500">
          {score}/100 - ต้องถึง {CERTIFICATE_THRESHOLD} เพื่อปลดล็อก
        </p>
      </div>
    );
  }

  return (
    <div className="flex flex-col items-center justify-center gap-1.5 rounded-lg border-2 border-amber-400 bg-amber-50 p-4 text-center dark:border-amber-600 dark:bg-amber-950">
      <span className="text-2xl" aria-hidden>
        🏆
      </span>
      <p className="text-xs font-semibold text-amber-900 dark:text-amber-200">{COMPETENCY_LABELS_TH[axis]}</p>
      <p className="text-[11px] text-amber-700 dark:text-amber-400">{score}/100</p>
      <button
        type="button"
        onClick={handleDownload}
        disabled={generating}
        className="mt-1 rounded-md bg-amber-600 px-2.5 py-1 text-[11px] font-medium text-white hover:bg-amber-700 disabled:opacity-60"
      >
        {generating ? "กำลังสร้าง..." : "ดาวน์โหลด PDF"}
      </button>
      {error && <p className="text-[10px] text-red-600 dark:text-red-400">{error}</p>}
    </div>
  );
}
