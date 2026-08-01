"use client";

import type { ChallengeStage } from "@/lib/ladder/challenge-types";
import type { StageStatus } from "@/lib/ladder/use-challenge-plc-engine";

const STATUS_STYLES: Record<StageStatus, { badge: string; icon: string; label: string }> = {
  pending: { badge: "border-zinc-300 bg-white text-zinc-400 dark:border-zinc-700 dark:bg-zinc-900 dark:text-zinc-500", icon: "○", label: "ยังไม่ถึง" },
  active: { badge: "border-blue-500 bg-blue-50 text-blue-700 dark:border-blue-500 dark:bg-blue-950 dark:text-blue-300", icon: "▶", label: "กำลังทำ" },
  passed: { badge: "border-emerald-500 bg-emerald-50 text-emerald-700 dark:border-emerald-600 dark:bg-emerald-950 dark:text-emerald-300", icon: "✓", label: "ผ่าน" },
  failed: { badge: "border-red-500 bg-red-50 text-red-700 dark:border-red-600 dark:bg-red-950 dark:text-red-300", icon: "✗", label: "ไม่ผ่าน" },
};

export default function ChallengeStageProgress({
  stages,
  statuses,
}: {
  stages: ChallengeStage[];
  statuses: StageStatus[];
}) {
  return (
    <div className="rounded-lg border border-zinc-200 bg-white p-4 dark:border-zinc-800 dark:bg-zinc-950">
      <p className="mb-3 text-xs font-semibold uppercase tracking-wide text-zinc-500 dark:text-zinc-400">
        ขั้นตอนภารกิจ (Mission Stages)
      </p>
      <ol className="flex flex-col gap-2">
        {stages.map((stage, i) => {
          const status = statuses[i] ?? "pending";
          const style = STATUS_STYLES[status];
          return (
            <li key={stage.id} className={`flex items-center gap-2.5 rounded-md border px-3 py-2 text-sm ${style.badge}`}>
              <span className="flex h-5 w-5 shrink-0 items-center justify-center rounded-full border border-current text-[11px] font-bold">
                {style.icon}
              </span>
              <span className="flex-1 leading-snug">{stage.name}</span>
              <span className="shrink-0 text-[10px] font-medium opacity-80">{style.label}</span>
            </li>
          );
        })}
      </ol>
    </div>
  );
}
