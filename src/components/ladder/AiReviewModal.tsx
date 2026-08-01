"use client";

import { useEffect, useRef, useState } from "react";
import type { GridProgram } from "@/lib/ladder/grid-types";

type AiReviewResponse =
  | { available: true; correctness: number; conciseness: number; safety: number; approach: number; feedback: string; coinsAwarded: number }
  | { available: false; message: string }
  | { error: string };

function ScoreBar({ label, value }: { label: string; value: number }) {
  const color = value >= 80 ? "bg-green-500" : value >= 50 ? "bg-yellow-500" : "bg-red-500";
  return (
    <div>
      <div className="mb-1 flex items-center justify-between text-xs">
        <span className="font-medium text-zinc-700 dark:text-zinc-300">{label}</span>
        <span className="text-zinc-500 dark:text-zinc-400">{value}/100</span>
      </div>
      <div className="h-2 w-full overflow-hidden rounded-full bg-zinc-200 dark:bg-zinc-800">
        <div className={`h-full ${color}`} style={{ width: `${value}%` }} />
      </div>
    </div>
  );
}

/** Fetched on mount and shown as a modal - triggered after a level's test cases already passed, per Rule 1 (never call the API on a failing submission). */
export default function AiReviewModal({
  levelId,
  program,
  onClose,
}: {
  levelId: string;
  program: GridProgram;
  onClose: () => void;
}) {
  const [loading, setLoading] = useState(true);
  const [result, setResult] = useState<AiReviewResponse | null>(null);
  const requested = useRef(false);

  useEffect(() => {
    if (requested.current) return;
    requested.current = true;
    (async () => {
      try {
        const res = await fetch("/api/evaluate-submission", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ levelId, program }),
        });
        const data = (await res.json()) as AiReviewResponse;
        setResult(data);
      } catch (err) {
        console.error("AI review request failed:", err);
        setResult({ available: false, message: "เกิดข้อผิดพลาด กรุณาลองใหม่ภายหลัง" });
      } finally {
        setLoading(false);
      }
    })();
  }, [levelId, program]);

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4" onClick={onClose}>
      <div
        className="flex w-full max-w-md flex-col gap-4 rounded-lg bg-white p-5 shadow-xl dark:bg-zinc-950"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="flex items-center justify-between">
          <h3 className="text-sm font-semibold text-zinc-900 dark:text-zinc-50">รีวิวโค้ดจาก AI</h3>
          <button
            type="button"
            onClick={onClose}
            aria-label="Close"
            className="text-zinc-400 hover:text-zinc-600 dark:hover:text-zinc-200"
          >
            x
          </button>
        </div>

        {loading && (
          <p className="text-sm text-zinc-500 dark:text-zinc-400">กำลังวิเคราะห์โค้ดของคุณ...</p>
        )}

        {!loading && result && "error" in result && (
          <p className="text-sm text-red-600 dark:text-red-400">{result.error}</p>
        )}

        {!loading && result && "available" in result && !result.available && (
          <p className="text-sm text-amber-600 dark:text-amber-400">{result.message}</p>
        )}

        {!loading && result && "available" in result && result.available && (
          <>
            <div className="flex flex-col gap-3">
              <ScoreBar label="ความถูกต้อง (Correctness)" value={result.correctness} />
              <ScoreBar label="ความกระชับ (Conciseness)" value={result.conciseness} />
              <ScoreBar label="ความปลอดภัย (Safety)" value={result.safety} />
              <ScoreBar label="แนวทางการแก้ปัญหา (Approach)" value={result.approach} />
            </div>
            <p className="rounded-md bg-purple-50 px-3 py-2 text-sm text-purple-900 dark:bg-purple-950 dark:text-purple-200">
              {result.feedback}
            </p>
            {result.coinsAwarded > 0 && (
              <p className="text-sm font-medium text-amber-600 dark:text-amber-400">
                ได้รับเหรียญโบนัส {result.coinsAwarded} เหรียญ!
              </p>
            )}
          </>
        )}
      </div>
    </div>
  );
}
