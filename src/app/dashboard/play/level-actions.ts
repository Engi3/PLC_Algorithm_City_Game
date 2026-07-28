"use server";

import { createClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { getCurrentProfile } from "@/lib/auth/get-profile";
import { evaluateLevel, countBlocks, computeScore } from "@/lib/ladder/level-eval";
import { isLevelSpec } from "@/lib/ladder/level-spec";
import type { LadderProgram } from "@/lib/ladder/types";

export type SubmitLevelResult =
  | {
      passed: boolean;
      score: number;
      bestScore: number;
      failedCases: number[];
      error?: undefined;
    }
  | { error: string };

export async function submitLevelAction(
  levelId: string,
  program: LadderProgram
): Promise<SubmitLevelResult> {
  try {
    const profile = await getCurrentProfile();
    if (!profile) return { error: "Not signed in." };

    const supabase = await createClient();

    const { data: level, error: levelError } = await supabase
      .from("levels")
      .select("id, optimal_blocks_count, map_layout_json")
      .eq("id", levelId)
      .single();

    if (levelError || !level) {
      console.error("submitLevelAction: level not found", levelError);
      return { error: "Level not found." };
    }
    if (!isLevelSpec(level.map_layout_json)) {
      console.error("submitLevelAction: malformed level spec", levelId);
      return { error: "This level is misconfigured." };
    }

    const evalResult = evaluateLevel(program, level.map_layout_json);
    const blocksUsed = countBlocks(program);
    const score = evalResult.passed ? computeScore(blocksUsed, level.optimal_blocks_count) : 0;

    const { data: priorAttempts, error: attemptsError } = await supabase
      .from("play_logs")
      .select("id, score")
      .eq("user_id", profile.id)
      .eq("level_id", levelId);

    if (attemptsError) {
      console.error("submitLevelAction: failed to load prior attempts", attemptsError);
      return { error: "Something went wrong. Please try again." };
    }

    const priorBestScore = Math.max(0, ...(priorAttempts ?? []).map((a) => a.score ?? 0));
    const attemptNumber = (priorAttempts?.length ?? 0) + 1;

    const { error: insertError } = await supabase.from("play_logs").insert({
      user_id: profile.id,
      level_id: levelId,
      ladder_blocks_json: program,
      is_success: evalResult.passed,
      attempts: attemptNumber,
      score,
    });

    if (insertError) {
      console.error("submitLevelAction: failed to insert play_log", insertError);
      return { error: "Could not save your attempt. Please try again." };
    }

    // Only guests/students accumulate a game score; guests aren't persisted
    // meaningfully long-term but scoring them is harmless.
    if (evalResult.passed && score > priorBestScore) {
      try {
        const admin = createAdminClient();
        const { data: existing } = await admin
          .from("student_scores")
          .select("game_logic_score")
          .eq("user_id", profile.id)
          .maybeSingle();

        const delta = score - priorBestScore;
        const newTotal = (existing?.game_logic_score ?? 0) + delta;

        const { error: upsertError } = await admin
          .from("student_scores")
          .upsert({ user_id: profile.id, game_logic_score: newTotal }, { onConflict: "user_id" });

        if (upsertError) {
          console.error("submitLevelAction: failed to upsert student_scores", upsertError);
        }
      } catch (err) {
        console.error("submitLevelAction: score upsert crashed", err);
      }
    }

    return {
      passed: evalResult.passed,
      score,
      bestScore: Math.max(priorBestScore, score),
      failedCases: evalResult.results.filter((r) => !r.passed).map((r) => r.index),
    };
  } catch (err) {
    console.error("submitLevelAction crashed:", err);
    return { error: "Something went wrong. Please try again." };
  }
}
