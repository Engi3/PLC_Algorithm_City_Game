"use client";

import type { SafetyFault } from "@/lib/ladder/challenge-eval";

/** Task 5.2: pops up the instant the live engine detects a SafetyFault - separate from a plain failed stage checkpoint (shown quietly in ChallengeStageProgress instead), since a safety violation is the one failure mode the spec calls out as needing an explicit, unmissable diagnostic. */
export default function SafetyFaultModal({
  fault,
  stageName,
  onRetry,
}: {
  fault: SafetyFault;
  stageName: string;
  onRetry: () => void;
}) {
  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 p-4">
      <div className="flex w-full max-w-md flex-col gap-4 rounded-lg border-2 border-red-500 bg-white p-5 shadow-2xl dark:bg-zinc-950">
        <div className="flex items-center gap-3">
          <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full bg-red-100 text-xl dark:bg-red-950">
            🚨
          </span>
          <div>
            <p className="text-[11px] font-semibold uppercase tracking-wide text-red-600 dark:text-red-400">
              Safety Fault Detected
            </p>
            <h3 className="text-sm font-semibold text-zinc-900 dark:text-zinc-50">เกิดเหตุการณ์ไม่ปลอดภัย</h3>
          </div>
        </div>

        <div className="rounded-md border border-red-200 bg-red-50 p-3 text-sm text-red-900 dark:border-red-900 dark:bg-red-950/50 dark:text-red-200">
          {fault.description}
        </div>

        <p className="text-xs text-zinc-500 dark:text-zinc-400">
          เกิดขึ้นระหว่างขั้นตอน: <span className="font-medium text-zinc-700 dark:text-zinc-300">{stageName}</span>
        </p>

        <p className="text-xs text-zinc-500 dark:text-zinc-400">
          ระบบหยุดการจำลองทันทีเพื่อความปลอดภัย - ตรวจสอบวงจรของคุณและลองใหม่อีกครั้ง
        </p>

        <button
          type="button"
          onClick={onRetry}
          className="w-full rounded-md bg-red-600 px-4 py-2 text-sm font-medium text-white hover:bg-red-700"
        >
          รีเซ็ตและลองใหม่ (Reset &amp; Retry)
        </button>
      </div>
    </div>
  );
}
