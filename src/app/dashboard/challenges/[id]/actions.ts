"use server";

import { createClient } from "@/lib/supabase/server";
import { getCurrentProfile } from "@/lib/auth/get-profile";
import { evaluateChallenge, type ChallengeTestCaseResult } from "@/lib/ladder/challenge-eval";
import { challengeRowToSpec, type ChallengeLevelRow } from "@/lib/ladder/challenge-types";
import type { GridProgram } from "@/lib/ladder/grid-types";

export type SubmitChallengeResult =
  | { passed: boolean; results: ChallengeTestCaseResult[]; attempts: number; error?: undefined }
  | { error: string };

/**
 * Official Challenge Mode grading - runs every test case in the spec (not
 * just the one the live walkthrough shows), same as submitLevelAction does
 * for regular Levels. challenge_play_logs has no score/ladder_blocks_json
 * columns (see 0009_challenge_play_logs.sql) since Challenge Mode isn't
 * wired into the coin/energy economy - it only tracks pass/fail + attempt
 * count for the Challenge Browser and (Task 5.3) the teacher dashboard.
 */
export async function submitChallengeAction(
  challengeLevelId: string,
  program: GridProgram
): Promise<SubmitChallengeResult> {
  try {
    const profile = await getCurrentProfile();
    if (!profile) return { error: "Not signed in." };

    const supabase = await createClient();
    const { data, error } = await supabase
      .from("challenge_levels")
      .select("id, challenge_id, title, description, required_competencies, hints, stages_json, max_optimal_blocks, reference_grid_program_json")
      .eq("id", challengeLevelId)
      .single();

    if (error || !data) {
      console.error("submitChallengeAction: challenge not found", error);
      return { error: "Challenge not found." };
    }

    const spec = challengeRowToSpec(data as ChallengeLevelRow);
    if (!spec) {
      console.error("submitChallengeAction: malformed challenge spec", challengeLevelId);
      return { error: "This challenge is misconfigured." };
    }

    const evalResult = evaluateChallenge(program, spec);

    const { data: priorAttempts, error: attemptsError } = await supabase
      .from("challenge_play_logs")
      .select("id")
      .eq("user_id", profile.id)
      .eq("challenge_level_id", challengeLevelId);

    if (attemptsError) {
      console.error("submitChallengeAction: failed to load prior attempts", attemptsError);
      return { error: "Something went wrong. Please try again." };
    }

    const attemptNumber = (priorAttempts?.length ?? 0) + 1;

    const { error: insertError } = await supabase.from("challenge_play_logs").insert({
      user_id: profile.id,
      challenge_level_id: challengeLevelId,
      is_success: evalResult.passed,
      attempts: attemptNumber,
    });

    if (insertError) {
      console.error("submitChallengeAction: failed to insert challenge_play_log", insertError);
      return { error: "Could not save your attempt. Please try again." };
    }

    return { passed: evalResult.passed, results: evalResult.results, attempts: attemptNumber };
  } catch (err) {
    console.error("submitChallengeAction crashed:", err);
    return { error: "Something went wrong. Please try again." };
  }
}
