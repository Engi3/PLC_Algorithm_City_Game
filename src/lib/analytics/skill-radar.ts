import type { SkillCategory } from "@/lib/ladder/level-spec";

export const ALL_SKILLS: SkillCategory[] = [
  "basic_logic",
  "latching",
  "timers",
  "counters",
  "efficiency",
];

export type LevelSkillMap = Record<string, SkillCategory>;
export type PlayLogLite = { level_id: string; score: number | null; is_success: boolean };
export type SkillScores = Record<SkillCategory, number>;

/**
 * Best score per level (passed attempts only), averaged per skill category.
 * A category with no passed levels scores 0, not "missing" - keeps the
 * radar chart's shape meaningful even for a student who hasn't tried a
 * category yet.
 */
export function computeSkillScores(logs: PlayLogLite[], levelSkills: LevelSkillMap): SkillScores {
  const bestByLevel = new Map<string, number>();
  for (const log of logs) {
    if (!log.is_success) continue;
    const prev = bestByLevel.get(log.level_id) ?? 0;
    bestByLevel.set(log.level_id, Math.max(prev, log.score ?? 0));
  }

  const sums = new Map<SkillCategory, { total: number; count: number }>(
    ALL_SKILLS.map((s) => [s, { total: 0, count: 0 }])
  );

  for (const [levelId, score] of bestByLevel) {
    const skill = levelSkills[levelId];
    if (!skill) continue;
    const bucket = sums.get(skill)!;
    bucket.total += score;
    bucket.count += 1;
  }

  return Object.fromEntries(
    ALL_SKILLS.map((s) => {
      const bucket = sums.get(s)!;
      return [s, bucket.count > 0 ? Math.round(bucket.total / bucket.count) : 0];
    })
  ) as SkillScores;
}
