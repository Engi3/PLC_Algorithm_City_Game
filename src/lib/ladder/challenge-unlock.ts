import "server-only";
import type { createClient } from "@/lib/supabase/server";
import { isLevelSpec, type SkillCategory } from "./level-spec";

type SupabaseServerClient = Awaited<ReturnType<typeof createClient>>;

/** Fixed display order for the per-category breakdown - matches level-spec.ts's SKILL_LABELS/SKILL_BADGE_CLASSES ordering. */
const SKILL_CATEGORY_ORDER: SkillCategory[] = ["basic_logic", "latching", "timers", "counters", "efficiency"];

/** How much of a skill category's levels must be passed for that category to count toward the gate. */
const CATEGORY_UNLOCK_RATIO = 0.5;

export type CategoryProgress = { skill: SkillCategory; passed: number; total: number };
export type LevelGateStatus = { unlocked: boolean; categories: CategoryProgress[] };

/**
 * Challenge Mode as a whole stays locked until the student has passed at
 * least 50% of the Levels in EVERY skill category (Basic Logic, Latching,
 * Timers, Counters, Efficiency) - not a single blanket "pass everything"
 * count. A category with zero levels can't be failed (vacuously satisfied),
 * though that shouldn't happen in practice. Teachers are never gated - see
 * the caller.
 */
export async function checkLevelGate(supabase: SupabaseServerClient, userId: string): Promise<LevelGateStatus> {
  const { data: levels, error: levelsError } = await supabase.from("levels").select("id, map_layout_json");
  if (levelsError) console.error("checkLevelGate: failed to load levels", levelsError);

  const skillByLevelId = new Map<string, SkillCategory>();
  for (const level of levels ?? []) {
    if (isLevelSpec(level.map_layout_json)) skillByLevelId.set(level.id, level.map_layout_json.skill);
  }

  const { data: logs, error: logsError } = await supabase
    .from("play_logs")
    .select("level_id, is_success")
    .eq("user_id", userId)
    .eq("is_success", true);
  if (logsError) console.error("checkLevelGate: failed to load play logs", logsError);

  const passedLevelIds = new Set((logs ?? []).map((l) => l.level_id));

  const totals = new Map<SkillCategory, number>();
  const passed = new Map<SkillCategory, number>();
  for (const [levelId, skill] of skillByLevelId) {
    totals.set(skill, (totals.get(skill) ?? 0) + 1);
    if (passedLevelIds.has(levelId)) passed.set(skill, (passed.get(skill) ?? 0) + 1);
  }

  const categories: CategoryProgress[] = SKILL_CATEGORY_ORDER.map((skill) => ({
    skill,
    passed: passed.get(skill) ?? 0,
    total: totals.get(skill) ?? 0,
  }));

  const unlocked = categories.every((c) => c.total === 0 || c.passed / c.total >= CATEGORY_UNLOCK_RATIO);
  return { unlocked, categories };
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
