"use server";

import { createClient } from "@/lib/supabase/server";
import { getCurrentProfile } from "@/lib/auth/get-profile";
import { gameLevelRowToSpec, type GameLevelRow } from "@/lib/games/game-level-types";
import { runGameLevelToCompletion } from "@/lib/games/run-game-level";
import type { GridProgram } from "@/lib/ladder/grid-types";

export type SubmitGameLevelResult = { passed: boolean; error?: undefined } | { error: string };

/**
 * Official Game Mode grading - replays the submitted GridProgram to
 * completion server-side (run-game-level.ts) rather than trusting the
 * client's own live `outcome` state, same "server re-verifies" principle
 * submitChallengeAction already applies to Challenge Mode.
 */
export async function submitGameLevelAction(gameLevelId: string, program: GridProgram): Promise<SubmitGameLevelResult> {
  try {
    const profile = await getCurrentProfile();
    if (!profile) return { error: "Not signed in." };

    const supabase = await createClient();
    const { data, error } = await supabase
      .from("game_levels")
      .select(
        "id, level_number, game_type, title, description, hints, map_layout_json, robot_start_json, factory_initial_json, success_conditions_json, safety_constraints_json, time_limit_ticks, ticks_per_second"
      )
      .eq("id", gameLevelId)
      .single();

    if (error || !data) {
      console.error("submitGameLevelAction: game level not found", error);
      return { error: "Game level not found." };
    }

    const spec = gameLevelRowToSpec(data as GameLevelRow);
    if (!spec) {
      console.error("submitGameLevelAction: malformed game level spec", gameLevelId);
      return { error: "This level is misconfigured." };
    }

    const maxTicks = (spec.timeLimitTicks ?? 100) + 5;
    const outcome = runGameLevelToCompletion(program, spec, maxTicks);
    const passed = outcome.status === "won";

    const { error: insertError } = await supabase.from("game_play_logs").insert({
      user_id: profile.id,
      game_level_id: gameLevelId,
      is_success: passed,
    });

    if (insertError) {
      console.error("submitGameLevelAction: failed to insert game_play_log", insertError);
      return { error: "Could not save your attempt. Please try again." };
    }

    return { passed };
  } catch (err) {
    console.error("submitGameLevelAction crashed:", err);
    return { error: "Something went wrong. Please try again." };
  }
}
