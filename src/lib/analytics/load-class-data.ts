import "server-only";
import { createClient } from "@/lib/supabase/server";
import { isLevelSpec } from "@/lib/ladder/level-spec";
import type { LevelSkillMap, PlayLogLite } from "./skill-radar";

export type ClassStudent = {
  id: string;
  username: string;
  firstName: string | null;
  lastName: string | null;
  studentId: string | null;
  gameLogicScore: number;
  onsitePracticalScore: number | null;
  wiringSkills: number | null;
  debuggingTesting: number | null;
  advancedChallenge: number | null;
  systemControl: number | null;
  levelsPassed: number;
  logs: PlayLogLite[];
};

export type ClassData = {
  students: ClassStudent[];
  levelSkills: LevelSkillMap;
  levelTitles: Record<string, string>;
  levelCount: number;
};

/** Shared by the analytics dashboard and the AI insights action, so both always see the same live snapshot. */
export async function loadClassData(): Promise<ClassData> {
  const supabase = await createClient();
  let levelSkills: LevelSkillMap = {};
  const levelTitles: Record<string, string> = {};
  let levelCount = 0;
  let students: ClassStudent[] = [];

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
        gameLogicScore: score?.game_logic_score ?? 0,
        onsitePracticalScore: score?.onsite_practical_score ?? null,
        wiringSkills: competencyScore?.wiring_skills ?? null,
        debuggingTesting: competencyScore?.debugging_testing ?? null,
        advancedChallenge: competencyScore?.advanced_challenge ?? null,
        systemControl: competencyScore?.system_control ?? null,
        levelsPassed,
        logs: userLogs,
      };
    });
  }

  return { students, levelSkills, levelTitles, levelCount };
}
