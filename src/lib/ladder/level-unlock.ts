import "server-only";
import { createClient } from "@/lib/supabase/server";

/**
 * The highest `level_number` a student may currently open in the Levels
 * track: the lowest-numbered level they haven't passed yet (the "frontier"),
 * or the last level if every level so far is passed. Levels with a higher
 * number than this are locked - strictly sequential progression, same
 * enforcement point pattern as challenge-unlock.ts uses for Challenge Mode.
 */
export async function computeUnlockedLevelNumber(userId: string): Promise<number> {
  const supabase = await createClient();

  const { data: levels, error: levelsError } = await supabase
    .from("levels")
    .select("id, level_number")
    .order("level_number", { ascending: true });
  if (levelsError || !levels || levels.length === 0) return 1;

  const { data: passedLogs, error: logsError } = await supabase
    .from("play_logs")
    .select("level_id")
    .eq("user_id", userId)
    .eq("is_success", true);
  if (logsError) {
    console.error("computeUnlockedLevelNumber: failed to load play logs", logsError);
    return 1;
  }
  const passedIds = new Set((passedLogs ?? []).map((l) => l.level_id));

  for (const level of levels) {
    if (!passedIds.has(level.id)) return level.level_number;
  }
  return levels[levels.length - 1].level_number;
}

/** Teachers test-play freely; guests are trial accounts with no permanent progress to gate - same bypass rule Game/Challenge Mode's unlock gates already use. */
export function bypassesLevelLock(role: "student" | "teacher" | "guest"): boolean {
  return role !== "student";
}
