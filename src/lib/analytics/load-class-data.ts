import "server-only";
import { createAdminClient } from "@/lib/supabase/admin";
import { isLevelSpec } from "@/lib/ladder/level-spec";
import type { ChallengePlayLogLite, GamePlayLogLite } from "./competency";
import type { LevelSkillMap, PlayLogLite } from "./skill-radar";

export type ClassStudent = {
  id: string;
  username: string;
  firstName: string | null;
  lastName: string | null;
  studentId: string | null;
  className: string | null;
  gameLogicScore: number;
  onsitePracticalScore: number | null;
  wiringSkills: number | null;
  debuggingTesting: number | null;
  advancedChallenge: number | null;
  systemControl: number | null;
  levelsPassed: number;
  logs: PlayLogLite[];
  challengeLogs: ChallengePlayLogLite[];
  gameLogs: GamePlayLogLite[];
};

export type ClassData = {
  students: ClassStudent[];
  levelSkills: LevelSkillMap;
  levelTitles: Record<string, string>;
  levelCount: number;
  /** challenge_levels.id -> challenge_id (1-50), so per-student challengeLogs (keyed by the UUID) can be bucketed into the 5 curriculum chapters (see CHALLENGE_CHAPTERS in challenge-types.ts) without a second per-page query. */
  challengeIdByLevelId: Record<string, number>;
  challengeCount: number;
  /** game_levels.id -> level_number (1-100), same bucketing trick as challengeIdByLevelId but for GAME_CHAPTERS (game-level-types.ts). */
  gameLevelNumberById: Record<string, number>;
  gameLevelCount: number;
};

/**
 * Shared by the analytics dashboard and the AI insights action (teacher-only
 * pages), and by the Leaderboard page + student rank widgets (student-
 * facing) - uses the admin/service-role client rather than the requesting
 * user's own RLS-scoped session, since a student's RLS policy on `users`
 * only allows reading their own row: with the regular client, a student
 * viewing the Leaderboard or their own rank would only ever see themselves
 * instead of the whole class. Every field this function selects (name,
 * student ID, scores, play logs) is already meant to be visible class-wide
 * for ranking purposes, so bypassing RLS here is intentional, not a leak -
 * same reasoning /certificate/verify/[userId]/[axis]/page.tsx already uses.
 */
export async function loadClassData(): Promise<ClassData> {
  const supabase = createAdminClient();
  let levelSkills: LevelSkillMap = {};
  const levelTitles: Record<string, string> = {};
  let levelCount = 0;
  let students: ClassStudent[] = [];
  const challengeIdByLevelId: Record<string, number> = {};
  let challengeCount = 0;
  const gameLevelNumberById: Record<string, number> = {};
  let gameLevelCount = 0;

  const { data: levels, error: levelsError } = await supabase
    .from("levels")
    .select("id, title, level_number, map_layout_json");
  if (levelsError) {
    console.error("loadClassData: failed to load levels", levelsError);
  } else {
    levelCount = levels?.length ?? 0;
    for (const l of levels ?? []) {
      levelTitles[l.id] = l.title ?? `Level ${l.level_number}`;
      if (isLevelSpec(l.map_layout_json)) levelSkills[l.id] = l.map_layout_json.skill;
    }
  }

  const { data: challengeLevels, error: challengeLevelsError } = await supabase
    .from("challenge_levels")
    .select("id, challenge_id");
  if (challengeLevelsError) {
    console.error("loadClassData: failed to load challenge_levels", challengeLevelsError);
  } else {
    challengeCount = challengeLevels?.length ?? 0;
    for (const c of challengeLevels ?? []) challengeIdByLevelId[c.id] = c.challenge_id;
  }

  const { data: gameLevels, error: gameLevelsError } = await supabase.from("game_levels").select("id, level_number");
  if (gameLevelsError) {
    console.error("loadClassData: failed to load game_levels", gameLevelsError);
  } else {
    gameLevelCount = gameLevels?.length ?? 0;
    for (const g of gameLevels ?? []) gameLevelNumberById[g.id] = g.level_number;
  }

  const { data: studentUsers, error: usersError } = await supabase
    .from("users")
    .select("id, username, first_name, last_name, student_id")
    .eq("role", "student")
    .eq("approval_status", "approved")
    .order("username", { ascending: true });

  if (usersError) {
    console.error("loadClassData: failed to load students", usersError);
  } else if (studentUsers && studentUsers.length > 0) {
    const studentIds = studentUsers.map((s) => s.id);

    // Queried separately: until migration 0016 runs, this column doesn't
    // exist yet - folding it into the required select above would fail
    // the WHOLE query and hide every student, not just the class filter.
    // Same split already used for the mode-override columns.
    const { data: classNames, error: classNameError } = await supabase
      .from("users")
      .select("id, class_name")
      .in("id", studentIds);
    if (classNameError) console.error("loadClassData: failed to load class_name (migration 0016 may not be run yet)", classNameError);
    const classNameByUser = new Map((classNames ?? []).map((c) => [c.id, c.class_name as string | null]));

    const { data: scores, error: scoresError } = await supabase
      .from("student_scores")
      .select("user_id, game_logic_score, onsite_practical_score")
      .in("user_id", studentIds);
    if (scoresError) console.error("loadClassData: failed to load scores", scoresError);
    const scoreByUser = new Map((scores ?? []).map((s) => [s.user_id, s]));

    // Queried separately from the block above: a PostgREST select() is
    // all-or-nothing, so until the Phase 12 migration (0005_competency_radar.sql)
    // runs, requesting these columns in the same query as game_logic_score
    // would fail the WHOLE query and wrongly zero out real, existing scores
    // too. Splitting them means only the new competency fields degrade to
    // null pre-migration, not the scores that already work today.
    const { data: competency, error: competencyError } = await supabase
      .from("student_scores")
      .select("user_id, wiring_skills, debugging_testing, advanced_challenge, system_control")
      .in("user_id", studentIds);
    if (competencyError) console.error("loadClassData: failed to load competency scores", competencyError);
    const competencyByUser = new Map((competency ?? []).map((s) => [s.user_id, s]));

    const { data: logs, error: logsError } = await supabase
      .from("play_logs")
      .select("user_id, level_id, score, is_success, created_at")
      .in("user_id", studentIds);
    if (logsError) console.error("loadClassData: failed to load play logs", logsError);
    const logsByUser = new Map<string, PlayLogLite[]>();
    for (const log of logs ?? []) {
      const arr = logsByUser.get(log.user_id) ?? [];
      arr.push(log);
      logsByUser.set(log.user_id, arr);
    }

    const { data: challengeLogs, error: challengeLogsError } = await supabase
      .from("challenge_play_logs")
      .select("user_id, challenge_level_id, is_success")
      .in("user_id", studentIds);
    if (challengeLogsError) console.error("loadClassData: failed to load challenge play logs", challengeLogsError);
    const challengeLogsByUser = new Map<string, ChallengePlayLogLite[]>();
    for (const log of challengeLogs ?? []) {
      const arr = challengeLogsByUser.get(log.user_id) ?? [];
      arr.push(log);
      challengeLogsByUser.set(log.user_id, arr);
    }

    const { data: gameLogs, error: gameLogsError } = await supabase
      .from("game_play_logs")
      .select("user_id, game_level_id, is_success")
      .in("user_id", studentIds);
    if (gameLogsError) console.error("loadClassData: failed to load game play logs", gameLogsError);
    const gameLogsByUser = new Map<string, GamePlayLogLite[]>();
    for (const log of gameLogs ?? []) {
      const arr = gameLogsByUser.get(log.user_id) ?? [];
      arr.push(log);
      gameLogsByUser.set(log.user_id, arr);
    }

    students = studentUsers.map((u) => {
      const score = scoreByUser.get(u.id);
      const competencyScore = competencyByUser.get(u.id);
      const userLogs = logsByUser.get(u.id) ?? [];
      const levelsPassed = new Set(userLogs.filter((l) => l.is_success).map((l) => l.level_id)).size;
      return {
        id: u.id,
        username: u.username,
        firstName: u.first_name,
        lastName: u.last_name,
        studentId: u.student_id,
        className: classNameByUser.get(u.id) ?? null,
        gameLogicScore: score?.game_logic_score ?? 0,
        onsitePracticalScore: score?.onsite_practical_score ?? null,
        wiringSkills: competencyScore?.wiring_skills ?? null,
        debuggingTesting: competencyScore?.debugging_testing ?? null,
        advancedChallenge: competencyScore?.advanced_challenge ?? null,
        systemControl: competencyScore?.system_control ?? null,
        levelsPassed,
        logs: userLogs,
        challengeLogs: challengeLogsByUser.get(u.id) ?? [],
        gameLogs: gameLogsByUser.get(u.id) ?? [],
      };
    });
  }

  return {
    students,
    levelSkills,
    levelTitles,
    levelCount,
    challengeIdByLevelId,
    challengeCount,
    gameLevelNumberById,
    gameLevelCount,
  };
}
