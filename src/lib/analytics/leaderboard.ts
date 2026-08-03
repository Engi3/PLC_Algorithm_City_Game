import {
  computeCompetencyScores,
  type CompetencyAxis,
  type CompetencyScores,
  type ManualCompetencyScores,
  type ChallengePlayLogLite,
  type GamePlayLogLite,
} from "./competency";
import type { PlayLogLite } from "./skill-radar";

/** Minimal shape computeLeaderboard needs from a student - a subset of ClassStudent (load-class-data.ts) plus className, so this module doesn't force every caller through loadClassData(). */
export type LeaderboardStudent = {
  id: string;
  username: string;
  firstName: string | null;
  lastName: string | null;
  studentId: string | null;
  className: string | null;
  wiringSkills: number | null;
  debuggingTesting: number | null;
  advancedChallenge: number | null;
  systemControl: number | null;
  logs: PlayLogLite[];
  challengeLogs: ChallengePlayLogLite[];
  gameLogs: GamePlayLogLite[];
};

export type LeaderboardEntry = {
  id: string;
  username: string;
  firstName: string | null;
  lastName: string | null;
  studentId: string | null;
  className: string | null;
  competencyScores: CompetencyScores;
  /** Arithmetic mean of the 6 competency axes (0-100) - the leaderboard's default "total score" sort key. */
  totalScore: number;
  /** 1-based standard competition rank (ties share a rank, e.g. 1,1,3) computed against whatever sort key was passed to computeLeaderboard. */
  rank: number;
};

/**
 * Ranks students by a chosen sort key - "total" (average of all 6
 * competency axes) or a single CompetencyAxis - using standard competition
 * ranking (ties share the same rank, the next distinct score skips ahead,
 * e.g. 1, 1, 3). Shared by the /dashboard/leaderboard page and the
 * student-overview "your rank" widget so both always agree on the same
 * number for the same student.
 */
export function computeLeaderboard(
  students: LeaderboardStudent[],
  levelCount: number,
  challengeCount: number,
  gameLevelCount: number,
  sortKey: "total" | CompetencyAxis = "total"
): LeaderboardEntry[] {
  const withScores = students.map((s) => {
    const manual: ManualCompetencyScores = {
      wiring_skills: s.wiringSkills,
      debugging_testing: s.debuggingTesting,
      advanced_challenge: s.advancedChallenge,
      system_control: s.systemControl,
    };
    const competencyScores = computeCompetencyScores(
      s.logs,
      levelCount,
      manual,
      { logs: s.challengeLogs, totalChallenges: challengeCount },
      { logs: s.gameLogs, totalGameLevels: gameLevelCount }
    );
    const axisValues = Object.values(competencyScores);
    const totalScore = Math.round(axisValues.reduce((a, b) => a + b, 0) / axisValues.length);
    return {
      id: s.id,
      username: s.username,
      firstName: s.firstName,
      lastName: s.lastName,
      studentId: s.studentId,
      className: s.className,
      competencyScores,
      totalScore,
    };
  });

  const sortValue = (e: (typeof withScores)[number]) => (sortKey === "total" ? e.totalScore : e.competencyScores[sortKey]);
  const sorted = [...withScores].sort((a, b) => sortValue(b) - sortValue(a));

  let rank = 0;
  let prevValue: number | null = null;
  return sorted.map((entry, i) => {
    const value = sortValue(entry);
    if (prevValue === null || value !== prevValue) {
      rank = i + 1;
      prevValue = value;
    }
    return { ...entry, rank };
  });
}
