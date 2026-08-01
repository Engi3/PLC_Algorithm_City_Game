import type { PlayLogLite } from "./skill-radar";

export type CompetencyAxis =
  | "ladder_programming"
  | "wiring_skills"
  | "debugging_testing"
  | "problem_solving"
  | "advanced_challenge"
  | "system_control";

export const ALL_COMPETENCY_AXES: CompetencyAxis[] = [
  "ladder_programming",
  "wiring_skills",
  "debugging_testing",
  "problem_solving",
  "advanced_challenge",
  "system_control",
];

export type CompetencyScores = Record<CompetencyAxis, number>;

export const COMPETENCY_LABELS_TH: Record<CompetencyAxis, string> = {
  ladder_programming: "การเขียนโปรแกรมแลดเดอร์",
  wiring_skills: "ทักษะการเดินสาย",
  debugging_testing: "การแก้ไขข้อบกพร่อง",
  problem_solving: "การแก้ปัญหา",
  advanced_challenge: "ความท้าทายขั้นสูง",
  system_control: "การควบคุมระบบ",
};

/** The 4 axes with no other data source - a teacher sets these directly (like the existing onsite_practical_score). */
export type ManualCompetencyScores = {
  wiring_skills: number | null;
  debugging_testing: number | null;
  advanced_challenge: number | null;
  system_control: number | null;
};

function clamp0to100(n: number): number {
  return Math.max(0, Math.min(100, Math.round(n)));
}

/** Completion rate x average conciseness score of passed levels - rewards both breadth and efficient solutions. */
function computeLadderProgramming(logs: PlayLogLite[], totalLevels: number): number {
  if (totalLevels <= 0) return 0;
  const bestByLevel = new Map<string, number>();
  for (const log of logs) {
    if (!log.is_success) continue;
    const prev = bestByLevel.get(log.level_id) ?? 0;
    bestByLevel.set(log.level_id, Math.max(prev, log.score ?? 0));
  }
  if (bestByLevel.size === 0) return 0;
  const completionFraction = bestByLevel.size / totalLevels;
  const avgScore = [...bestByLevel.values()].reduce((a, b) => a + b, 0) / bestByLevel.size;
  return clamp0to100(completionFraction * avgScore);
}

/**
 * Completion rate (against ALL levels in the system, not just attempted
 * ones) x attempt efficiency (distinct levels passed / total submit
 * attempts, rewarding not burning through attempts trial-and-error style).
 * Mirrors computeLadderProgramming's completionFraction factor so passing a
 * handful of levels on the first try can't alone read as high mastery, and
 * so the score dilutes automatically as new levels are added until the
 * student catches up on them too.
 */
function computeProblemSolving(logs: PlayLogLite[], totalLevels: number): number {
  if (totalLevels <= 0 || logs.length === 0) return 0;
  const passedLevels = new Set(logs.filter((l) => l.is_success).map((l) => l.level_id)).size;
  if (passedLevels === 0) return 0;
  const completionFraction = passedLevels / totalLevels;
  const attemptEfficiency = passedLevels / logs.length;
  return clamp0to100(completionFraction * attemptEfficiency * 100);
}

/**
 * Auto fallback for debugging_testing when a teacher hasn't graded it:
 * among levels whose first-ever attempt failed, what fraction did the
 * student eventually pass? A proxy for "can recover from a bug", using
 * created_at to find the true first attempt (row order from a query is not
 * guaranteed without an explicit ORDER BY). Scaled by completion rate
 * against ALL levels in the system (same reasoning as computeProblemSolving)
 * so recovering from a couple of self-inflicted bugs alone can't read as
 * high debugging mastery.
 */
function computeDebuggingAuto(logs: PlayLogLite[], totalLevels: number): number {
  if (totalLevels <= 0) return 0;
  const byLevel = new Map<string, PlayLogLite[]>();
  for (const log of logs) {
    const arr = byLevel.get(log.level_id) ?? [];
    arr.push(log);
    byLevel.set(log.level_id, arr);
  }

  let firstAttemptFailed = 0;
  let recovered = 0;
  for (const levelLogs of byLevel.values()) {
    const sorted = [...levelLogs].sort(
      (a, b) => new Date(a.created_at).getTime() - new Date(b.created_at).getTime()
    );
    if (sorted[0].is_success) continue;
    firstAttemptFailed += 1;
    if (sorted.some((l) => l.is_success)) recovered += 1;
  }

  if (firstAttemptFailed === 0) return 0;
  const recoveryRatio = recovered / firstAttemptFailed;
  const passedLevels = new Set(logs.filter((l) => l.is_success).map((l) => l.level_id)).size;
  const completionFraction = passedLevels / totalLevels;
  return clamp0to100(recoveryRatio * completionFraction * 100);
}

/**
 * Certificate gate (Phase 5): best passing score per level, averaged across
 * every level in the system (0 for never-passed/unattempted levels) - unlike
 * computeLadderProgramming this isn't weighted by completion fraction, since
 * the certificate rule wants "≥80% average across ALL levels" to mean what
 * it says, not a completion-boosted number. Only meaningful for
 * ladder_programming/problem_solving, the 2 axes actually derived from
 * play_logs - see CertificateCard's allLevelsAverage prop.
 */
export function computeAllLevelsAverage(logs: PlayLogLite[], totalLevels: number): number {
  if (totalLevels <= 0) return 0;
  const bestByLevel = new Map<string, number>();
  for (const log of logs) {
    if (!log.is_success) continue;
    const prev = bestByLevel.get(log.level_id) ?? 0;
    bestByLevel.set(log.level_id, Math.max(prev, log.score ?? 0));
  }
  const total = [...bestByLevel.values()].reduce((a, b) => a + b, 0);
  return clamp0to100(total / totalLevels);
}

export function computeCompetencyScores(
  logs: PlayLogLite[],
  totalLevels: number,
  manual: ManualCompetencyScores
): CompetencyScores {
  return {
    ladder_programming: computeLadderProgramming(logs, totalLevels),
    wiring_skills: manual.wiring_skills !== null ? clamp0to100(manual.wiring_skills) : 0,
    debugging_testing:
      manual.debugging_testing !== null
        ? clamp0to100(manual.debugging_testing)
        : computeDebuggingAuto(logs, totalLevels),
    problem_solving: computeProblemSolving(logs, totalLevels),
    advanced_challenge: manual.advanced_challenge !== null ? clamp0to100(manual.advanced_challenge) : 0,
    system_control: manual.system_control !== null ? clamp0to100(manual.system_control) : 0,
  };
}

/** Arithmetic mean of each axis across several students' already-computed scores, for a "class average" radar. */
export function averageCompetencyScores(all: CompetencyScores[]): CompetencyScores {
  if (all.length === 0) {
    return Object.fromEntries(ALL_COMPETENCY_AXES.map((a) => [a, 0])) as CompetencyScores;
  }
  return Object.fromEntries(
    ALL_COMPETENCY_AXES.map((axis) => [axis, Math.round(all.reduce((sum, s) => sum + s[axis], 0) / all.length)])
  ) as CompetencyScores;
}
