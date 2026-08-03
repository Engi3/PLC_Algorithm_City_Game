"use client";

import { useState } from "react";
import CertificateGenerator from "./CertificateGenerator";
import { CERTIFICATE_THRESHOLD } from "@/lib/certificate/threshold";
import { COMPETENCY_LABELS_TH, type CompetencyAxis } from "@/lib/analytics/competency";

export default function CertificateCard({
  axis,
  score,
  studentName,
  studentId,
  userId,
  rankLabel,
  allLevelsAverage,
}: {
  axis: CompetencyAxis;
  score: number;
  studentName: string;
  studentId: string | null;
  userId: string;
  /** Leaderboard rank at render time, e.g. "#3 / 25 คน" - shown on the certificate if available. */
  rankLabel?: string;
  /** Phase 5: for ladder_programming/problem_solving only - the "≥80% average across ALL levels" additional gate, computed by computeAllLevelsAverage. Undefined for the other 4 axes, which have no such gate. */
  allLevelsAverage?: number;
}) {
  const [showGenerator, setShowGenerator] = useState(false);
  const meetsAllLevelsGate = allLevelsAverage === undefined || allLevelsAverage >= CERTIFICATE_THRESHOLD;
  const unlocked = score >= CERTIFICATE_THRESHOLD && meetsAllLevelsGate;

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
        {allLevelsAverage !== undefined && (
          <p className="text-[11px] text-zinc-400 dark:text-zinc-500">
            คะแนนเฉลี่ยทุกด่าน: {allLevelsAverage}/100 - ต้องถึง {CERTIFICATE_THRESHOLD}
          </p>
        )}
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
        onClick={() => setShowGenerator(true)}
        className="mt-1 rounded-md bg-amber-600 px-2.5 py-1 text-[11px] font-medium text-white hover:bg-amber-700"
      >
        ดูใบประกาศนียบัตร
      </button>
      {showGenerator && (
        <CertificateGenerator
          axis={axis}
          score={score}
          studentName={studentName}
          studentId={studentId}
          userId={userId}
          rankLabel={rankLabel}
          onClose={() => setShowGenerator(false)}
        />
      )}
    </div>
  );
}
