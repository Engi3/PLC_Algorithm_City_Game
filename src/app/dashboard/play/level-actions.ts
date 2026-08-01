"use server";

import { createClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { getCurrentProfile } from "@/lib/auth/get-profile";
import { evaluateGridLevel, countGridBlocks, computeScore, MIN_SCORE } from "@/lib/ladder/level-eval";
import { isLevelSpec } from "@/lib/ladder/level-spec";
import type { GridProgram } from "@/lib/ladder/grid-types";
import { applyEnergyRegen, computeCoinsForScore } from "@/lib/economy/energy";

export type SubmitLevelResult =
  | {
      passed: boolean;
      score: number;
      bestScore: number;
      failedCases: number[];
      energyRemaining: number | null;
      coinsEarned: number;
      error?: undefined;
    }
  | { error: string };

export async function submitLevelAction(
  levelId: string,
  program: GridProgram
): Promise<SubmitLevelResult> {
  try {
    const profile = await getCurrentProfile();
    if (!profile) return { error: "Not signed in." };

    // Teachers can test-play any level (e.g. sanity-checking outside the
    // authoring editor) without touching the energy/coin economy at all.
    const isEconomySubject = profile.role !== "teacher";

    let energyAfterRegen = profile.energy;
    let energyUpdatedAt = new Date(profile.energy_updated_at);
    if (isEconomySubject) {
      const regen = applyEnergyRegen(profile.energy, profile.energy_updated_at);
      energyAfterRegen = regen.energy;
      energyUpdatedAt = regen.energyUpdatedAt;

      if (energyAfterRegen <= 0) {
        // Persist the regen catch-up even though we're blocking, so the
        // wait-time display is accurate next time they check.
        if (energyUpdatedAt.getTime() !== new Date(profile.energy_updated_at).getTime()) {
          const admin = createAdminClient();
          await admin
            .from("users")
            .update({ energy: energyAfterRegen, energy_updated_at: energyUpdatedAt.toISOString() })
            .eq("id", profile.id);
        }
        return { error: "หมดพลังงาน! รอพลังงานฟื้นฟู หรือซื้อ Energy Refill จากร้านค้า" };
      }
    }

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

    const evalResult = evaluateGridLevel(program, level.map_layout_json);
    const blocksUsed = countGridBlocks(program);
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

    let coinsEarned = 0;
    // Teachers test-play levels to sanity-check them; their attempts must
    // never land in student_scores, since that table feeds the main
    // student ranking/analytics view.
    if (isEconomySubject && evalResult.passed && score > priorBestScore) {
      coinsEarned = computeCoinsForScore(score);
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

    let energyRemaining: number | null = null;
    if (isEconomySubject) {
      energyRemaining = Math.max(0, energyAfterRegen - 1);
      try {
        const admin = createAdminClient();
        const { error: userUpdateError } = await admin
          .from("users")
          .update({
            energy: energyRemaining,
            energy_updated_at: energyUpdatedAt.toISOString(),
            ...(coinsEarned > 0 ? { coins: profile.coins + coinsEarned } : {}),
          })
          .eq("id", profile.id);
        if (userUpdateError) {
          console.error("submitLevelAction: failed to update energy/coins", userUpdateError);
        }
      } catch (err) {
        console.error("submitLevelAction: energy/coins update crashed", err);
      }
    }

    return {
      passed: evalResult.passed,
      score,
      bestScore: Math.max(priorBestScore, score),
      failedCases: evalResult.results.filter((r) => !r.passed).map((r) => r.index),
      energyRemaining,
      coinsEarned,
    };
  } catch (err) {
    console.error("submitLevelAction crashed:", err);
    return { error: "Something went wrong. Please try again." };
  }
}

export type SkipLevelResult =
  | { passed: true; score: number; skipTokensRemaining: number; error?: undefined }
  | { error: string };

/** Redeems one skip_token to mark a level passed at the minimum score, without solving it. */
export async function skipLevelAction(levelId: string): Promise<SkipLevelResult> {
  try {
    const profile = await getCurrentProfile();
    if (!profile) return { error: "Not signed in." };
    if (profile.role === "teacher") {
      return { error: "อาจารย์ไม่จำเป็นต้องใช้ Skip Token ในโหมดทดสอบด่าน" };
    }
    if (profile.skip_tokens <= 0) {
      return { error: "คุณไม่มี Skip Token กรุณาซื้อจากร้านค้า" };
    }

    const supabase = await createClient();
    const { data: priorAttempts, error: attemptsError } = await supabase
      .from("play_logs")
      .select("id, score, is_success")
      .eq("user_id", profile.id)
      .eq("level_id", levelId);

    if (attemptsError) {
      console.error("skipLevelAction: failed to load prior attempts", attemptsError);
      return { error: "Something went wrong. Please try again." };
    }

    const priorBestScore = Math.max(
      0,
      ...(priorAttempts ?? []).filter((a) => a.is_success).map((a) => a.score ?? 0)
    );
    if (priorBestScore > 0) {
      return { error: "คุณผ่านด่านนี้ไปแล้ว ไม่จำเป็นต้องใช้ Skip Token" };
    }
    const attemptNumber = (priorAttempts?.length ?? 0) + 1;

    const { error: insertError } = await supabase.from("play_logs").insert({
      user_id: profile.id,
      level_id: levelId,
      ladder_blocks_json: { grids: [] },
      is_success: true,
      attempts: attemptNumber,
      score: MIN_SCORE,
    });
    if (insertError) {
      console.error("skipLevelAction: failed to insert play_log", insertError);
      return { error: "Could not save this attempt. Please try again." };
    }

    const admin = createAdminClient();

    try {
      const { data: existing } = await admin
        .from("student_scores")
        .select("game_logic_score")
        .eq("user_id", profile.id)
        .maybeSingle();
      const newTotal = (existing?.game_logic_score ?? 0) + MIN_SCORE;
      const { error: upsertError } = await admin
        .from("student_scores")
        .upsert({ user_id: profile.id, game_logic_score: newTotal }, { onConflict: "user_id" });
      if (upsertError) console.error("skipLevelAction: failed to upsert student_scores", upsertError);
    } catch (err) {
      console.error("skipLevelAction: score upsert crashed", err);
    }

    const skipTokensRemaining = profile.skip_tokens - 1;
    const { error: tokenUpdateError } = await admin
      .from("users")
      .update({ skip_tokens: skipTokensRemaining })
      .eq("id", profile.id);
    if (tokenUpdateError) {
      console.error("skipLevelAction: failed to deduct skip token", tokenUpdateError);
    }

    return { passed: true, score: MIN_SCORE, skipTokensRemaining };
  } catch (err) {
    console.error("skipLevelAction crashed:", err);
    return { error: "Something went wrong. Please try again." };
  }
}
