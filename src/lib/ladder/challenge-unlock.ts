import "server-only";
import type { createClient } from "@/lib/supabase/server";

type SupabaseServerClient = Awaited<ReturnType<typeof createClient>>;

export type LevelGateStatus = { unlocked: boolean; levelsPassed: number; totalLevels: number };

/** Challenge Mode as a whole stays locked until the student has passed every level currently in the system (today: 130). Teachers are never gated - see the caller. */
export async function checkLevelGate(supabase: SupabaseServerClient, userId: string): Promise<LevelGateStatus> {
  const { count: totalLevels, error: levelsError } = await supabase.from("levels").select("*", { count: "exact", head: true });
  if (levelsError) console.error("checkLevelGate: failed to count levels", levelsError);

  const { data: logs, error: logsError } = await supabase
    .from("play_logs")
    .select("level_id, is_success")
    .eq("user_id", userId)
    .eq("is_success", true);
  if (logsError) console.error("checkLevelGate: failed to load play logs", logsError);

  const levelsPassed = new Set((logs ?? []).map((l) => l.level_id)).size;
  const total = totalLevels ?? 0;
  return { unlocked: total > 0 && levelsPassed >= total, levelsPassed, totalLevels: total };
}

/**
 * Sequential per-challenge unlock: challenge 1 is unlocked as soon as the
 * level gate above passes; challenge N (N>1) unlocks only once challenge
 * N-1 has been passed. `challenges` must already be sorted by challengeId
 * ascending. Returns a map of challenge_levels.id -> unlocked.
 */
export function computeChallengeUnlockStatus(
  challenges: { id: string; challengeId: number }[],
  passedIds: Set<string>
): Map<string, boolean> {
  const result = new Map<string, boolean>();
  let prevPassed = true;
  for (const c of challenges) {
    result.set(c.id, prevPassed);
    prevPassed = passedIds.has(c.id);
  }
  return result;
}
