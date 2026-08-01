import type { SkillCategory } from "@/lib/ladder/level-spec";

export const ALL_SKILLS: SkillCategory[] = [
  "basic_logic",
  "latching",
  "timers",
  "counters",
  "efficiency",
];

export type LevelSkillMap = Record<string, SkillCategory>;
export type PlayLogLite = { level_id: string; score: number | null; is_success: boolean; created_at: string };
export type SkillScores = Record<SkillCategory, number>;

/**
 * Best score per passed level, summed per skill category and divided by the
 * TOTAL number of levels that exist in that category system-wide (not just
 * the ones attempted) - so passing a couple of levels in a category doesn't
 * alone read as high mastery of it, and the score dilutes automatically as
 * more levels are added to a category until the student catches up on
 * those too. `levelSkills` already covers every level in the system (see
 * load-class-data.ts/progress page's queries), so counting its keys per
 * category gives the true denominator. A category with zero levels defined
 * scores 0 rather than dividing by zero.
 */
export function computeSkillScores(logs: PlayLogLite[], levelSkills: LevelSkillMap): SkillScores {
  const bestByLevel = new Map<string, number>();
  for (const log of logs) {
    if (!log.is_success) continue;
    const prev = bestByLevel.get(log.level_id) ?? 0;
    bestByLevel.set(log.level_id, Math.max(prev, log.score ?? 0));
  }

  const sums = new Map<SkillCategory, { achieved: number; totalLevels: number }>(
    ALL_SKILLS.map((s) => [s, { achieved: 0, totalLevels: 0 }])
  );

  for (const skill of Object.values(levelSkills)) {
    const bucket = sums.get(skill);
    if (bucket) bucket.totalLevels += 1;
  }

  for (const [levelId, score] of bestByLevel) {
    const skill = levelSkills[levelId];
    if (!skill) continue;
    const bucket = sums.get(skill)!;
    bucket.achieved += score;
  }

  return Object.fromEntries(
    ALL_SKILLS.map((s) => {
      const bucket = sums.get(s)!;
      const pct = bucket.totalLevels > 0 ? bucket.achieved / bucket.totalLevels : 0;
      return [s, Math.max(0, Math.min(100, Math.round(pct)))];
    })
  ) as SkillScores;
}
