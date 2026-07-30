"use client";

import { useState } from "react";
import { generateCoachTipAction } from "@/app/dashboard/progress/ai-actions";

/** Phase 14: button-triggered AI Personal Coach tip, focused on the student's weakest competency axis. */
export default function CoachBox() {
  const [tip, setTip] = useState<string | null>(null);
  const [source, setSource] = useState<"ai" | "fallback" | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);

  async function generate() {
    setLoading(true);
    setError(null);
    try {
      const result = await generateCoachTipAction();
      if ("error" in result) {
        setError(result.error);
      } else {
        setTip(result.tip);
        setSource(result.source);
      }
    } catch (err) {
      console.error("generateCoachTipAction failed:", err);
      setError("เกิดข้อผิดพลาด กรุณาลองใหม่ภายหลัง");
    } finally {
      setLoading(false);
    }
  }

  return (
    <div className="rounded-lg border border-blue-200 bg-blue-50 p-4 dark:border-blue-900 dark:bg-blue-950">
      <div className="mb-2 flex flex-wrap items-center justify-between gap-2">
        <h2 className="text-sm font-semibold text-blue-900 dark:text-blue-200">โค้ชส่วนตัว AI (AI Personal Coach)</h2>
        <button
          type="button"
          onClick={generate}
          disabled={loading}
          className="rounded-md bg-blue-600 px-3 py-1.5 text-sm font-medium text-white hover:bg-blue-700 disabled:opacity-60"
        >
          {loading ? "กำลังวิเคราะห์..." : tip ? "วิเคราะห์อีกครั้ง" : "ขอคำแนะนำจาก AI"}
        </button>
      </div>
      {error && <p className="text-sm text-red-600 dark:text-red-400">{error}</p>}
      {tip && (
        <div className="rounded-md bg-white p-3 dark:bg-zinc-950">
          <p className="text-sm text-blue-900 dark:text-blue-100">{tip}</p>
          {source === "fallback" && (
            <p className="mt-1 text-xs text-zinc-400 dark:text-zinc-500">
              (คำแนะนำเบื้องต้น - ไม่สามารถเชื่อมต่อ AI ได้ในขณะนี้)
            </p>
          )}
        </div>
      )}
    </div>
  );
}
