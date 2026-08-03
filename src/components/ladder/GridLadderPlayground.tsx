"use client";

import { useState } from "react";
import { useLadderGrid } from "@/lib/ladder/use-ladder-grid";
import { useVariablePool } from "@/lib/ladder/use-variable-pool";
import GridEditorSurface from "@/components/ladder-grid/GridEditorSurface";
import AiReviewModal from "./AiReviewModal";
import { getHintAction } from "@/app/dashboard/play/actions";
import {
  submitLevelAction,
  skipLevelAction,
  type SubmitLevelResult,
  type SkipLevelResult,
} from "@/app/dashboard/play/level-actions";
import { SKILL_BADGE_CLASSES, SKILL_LABELS, type SkillCategory } from "@/lib/ladder/level-spec";

export type LevelInfo = { id: string; description: string; skill: SkillCategory | null; hints?: string[] };

/**
 * Student play mode, rebuilt on the grid editor - see GridEditorSurface.tsx
 * for the shared editing surface (same one Sandbox and Levels authoring
 * use) and level-eval.ts's evaluateGridLevel/countGridBlocks for why
 * grading runs directly against the student's GridProgram instead of
 * converting through the legacy Rung/Branch/Output shape (that converter
 * silently truncates rows with more than 4 series contacts, a real risk
 * now that the grid editor supports mid-wire taps and arbitrary branching -
 * grading a truncated copy of what the student actually built would be a
 * correctness bug).
 */
export default function GridLadderPlayground({ level }: { level?: LevelInfo } = {}) {
  const grid = useLadderGrid();
  const pool = useVariablePool();

  const [hintsRevealed, setHintsRevealed] = useState(0);
  const [hint, setHint] = useState<string | null>(null);
  const [hintError, setHintError] = useState<string | null>(null);
  const [hintLoading, setHintLoading] = useState(false);
  const [submitResult, setSubmitResult] = useState<SubmitLevelResult | null>(null);
  const [submitting, setSubmitting] = useState(false);
  const [skipResult, setSkipResult] = useState<SkipLevelResult | null>(null);
  const [skipping, setSkipping] = useState(false);
  const [hintCreditsRemaining, setHintCreditsRemaining] = useState<number | null>(null);
  const [showAiReview, setShowAiReview] = useState(false);

  async function askForHint() {
    setHintLoading(true);
    setHintError(null);
    setHint(null);
    try {
      const result = await getHintAction(grid.gridProgram, grid.inputs, grid.memory);
      if ("error" in result && result.error) {
        setHintError(result.error);
      } else if ("hint" in result && result.hint) {
        setHint(result.hint);
        setHintCreditsRemaining(result.hintCreditsRemaining);
      }
    } catch (err) {
      console.error("askForHint failed:", err);
      setHintError("Something went wrong getting a hint.");
    } finally {
      setHintLoading(false);
    }
  }

  async function submitLevel() {
    if (!level) return;
    setSubmitting(true);
    setSubmitResult(null);
    try {
      const result = await submitLevelAction(level.id, grid.gridProgram);
      setSubmitResult(result);
    } catch (err) {
      console.error("submitLevel failed:", err);
      setSubmitResult({ error: "Something went wrong. Please try again." });
    } finally {
      setSubmitting(false);
    }
  }

  async function useSkipToken() {
    if (!level) return;
    setSkipping(true);
    setSkipResult(null);
    try {
      const result = await skipLevelAction(level.id);
      setSkipResult(result);
    } catch (err) {
      console.error("useSkipToken failed:", err);
      setSkipResult({ error: "Something went wrong. Please try again." });
    } finally {
      setSkipping(false);
    }
  }

  return (
    <div className="flex flex-col gap-4">
      <GridEditorSurface
        grid={grid}
        pool={pool}
        banner={
          level ? (
            <div className="flex flex-col gap-2 rounded-lg border border-blue-200 bg-blue-50 p-4 dark:border-blue-900 dark:bg-blue-950">
              {level.skill && (
                <span className={`w-fit rounded px-2 py-0.5 text-[11px] font-medium ${SKILL_BADGE_CLASSES[level.skill]}`}>
                  {SKILL_LABELS[level.skill]}
                </span>
              )}
              <p className="text-sm text-blue-900 dark:text-blue-100">{level.description}</p>

              {level.hints && level.hints.length > 0 && (
                <div className="flex flex-col gap-1">
                  {level.hints.slice(0, hintsRevealed).map((h, i) => (
                    <p key={i} className="rounded bg-blue-100 px-2 py-1 text-xs text-blue-800 dark:bg-blue-900 dark:text-blue-200">
                      คำใบ้ {i + 1}: {h}
                    </p>
                  ))}
                  {hintsRevealed < level.hints.length && (
                    <button
                      type="button"
                      onClick={() => setHintsRevealed((n) => n + 1)}
                      className="w-fit text-xs font-medium text-blue-700 hover:underline dark:text-blue-300"
                    >
                      ดูคำใบ้ {hintsRevealed + 1}/{level.hints.length}
                    </button>
                  )}
                </div>
              )}
            </div>
          ) : (
            <div className="rounded-lg border border-blue-200 bg-blue-50 p-3 text-xs text-blue-800 dark:border-blue-900 dark:bg-blue-950 dark:text-blue-300">
              <strong>Industrial Ladder Editor.</strong> วางบล็อก ต่อสาย และรัน Power Flow ได้ทันที (Run/Step/Stop)
            </div>
          )
        }
      />

      {level && (
        <div className="flex flex-wrap items-center gap-3">
          <button
            type="button"
            onClick={submitLevel}
            disabled={submitting}
            className="rounded-md bg-green-600 px-4 py-2 text-sm font-medium text-white hover:bg-green-700 disabled:opacity-60"
          >
            {submitting ? "Checking..." : "Submit"}
          </button>
          <button
            type="button"
            onClick={useSkipToken}
            disabled={skipping}
            className="rounded-md border border-amber-400 px-4 py-2 text-sm font-medium text-amber-700 hover:bg-amber-50 disabled:opacity-60 dark:text-amber-400 dark:hover:bg-amber-950"
          >
            {skipping ? "..." : "Use Skip Token"}
          </button>
        </div>
      )}

      {level && submitResult && (
        <div
          className={`rounded-md px-3 py-2 text-sm ${
            "error" in submitResult
              ? "bg-red-50 text-red-700 dark:bg-red-950 dark:text-red-400"
              : submitResult.passed
                ? "bg-green-50 text-green-800 dark:bg-green-950 dark:text-green-400"
                : "bg-yellow-50 text-yellow-800 dark:bg-yellow-950 dark:text-yellow-400"
          }`}
        >
          {"error" in submitResult
            ? submitResult.error
            : submitResult.passed
              ? `Passed! Score: ${submitResult.score} (best: ${submitResult.bestScore})${submitResult.coinsEarned > 0 ? ` - earned ${submitResult.coinsEarned} coins!` : ""}${submitResult.energyRemaining !== null ? ` Energy left: ${submitResult.energyRemaining}.` : ""}`
              : `Not quite - failed test case(s) ${submitResult.failedCases.map((i) => i + 1).join(", ")}. Try again.${submitResult.energyRemaining !== null ? ` Energy left: ${submitResult.energyRemaining}.` : ""}`}
        </div>
      )}

      {level && submitResult && !("error" in submitResult) && submitResult.passed && (
        <button
          type="button"
          onClick={() => setShowAiReview(true)}
          className="w-fit rounded-md bg-purple-600 px-4 py-2 text-sm font-medium text-white hover:bg-purple-700"
        >
          ขอรีวิวโค้ดจาก AI (Request AI Review)
        </button>
      )}

      {level && skipResult && (
        <div
          className={`rounded-md px-3 py-2 text-sm ${
            "error" in skipResult
              ? "bg-red-50 text-red-700 dark:bg-red-950 dark:text-red-400"
              : "bg-green-50 text-green-800 dark:bg-green-950 dark:text-green-400"
          }`}
        >
          {"error" in skipResult
            ? skipResult.error
            : `Level skipped! Score: ${skipResult.score}. Skip Tokens left: ${skipResult.skipTokensRemaining}.`}
        </div>
      )}

      <div className="flex flex-col gap-2 border-t border-zinc-200 pt-4 dark:border-zinc-800">
        <button
          type="button"
          onClick={askForHint}
          disabled={hintLoading}
          className="w-fit rounded-md bg-purple-600 px-4 py-2 text-sm font-medium text-white hover:bg-purple-700 disabled:opacity-60"
        >
          {hintLoading ? "Thinking..." : "Ask AI for a hint"}
        </button>
        {hint && (
          <p className="rounded-md bg-purple-50 px-3 py-2 text-sm text-purple-900 dark:bg-purple-950 dark:text-purple-200">
            {hint}
            {hintCreditsRemaining !== null && (
              <span className="mt-1 block text-xs opacity-75">Hint credits left: {hintCreditsRemaining}</span>
            )}
          </p>
        )}
        {hintError && <p className="text-sm text-red-600 dark:text-red-400">{hintError}</p>}
      </div>

      {showAiReview && level && (
        <AiReviewModal contextKind="level" contextId={level.id} program={grid.gridProgram} onClose={() => setShowAiReview(false)} />
      )}
    </div>
  );
}
