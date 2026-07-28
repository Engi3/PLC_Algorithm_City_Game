import { redirect } from "next/navigation";
import { getCurrentProfile } from "@/lib/auth/get-profile";
import { createClient } from "@/lib/supabase/server";
import { isLevelSpec } from "@/lib/ladder/level-spec";
import type { LevelSkillMap, PlayLogLite } from "@/lib/analytics/skill-radar";
import AnalyticsClient, { type StudentRow } from "./AnalyticsClient";

export default async function AnalyticsPage() {
  const profile = await getCurrentProfile();
  if (profile?.role !== "teacher") redirect("/dashboard");

  let students: StudentRow[] = [];
  let levelSkills: LevelSkillMap = {};
  let levelCount = 0;

  try {
    const supabase = await createClient();

    const { data: levels, error: levelsError } = await supabase
      .from("levels")
      .select("id, map_layout_json");
    if (levelsError) {
      console.error("AnalyticsPage: failed to load levels", levelsError);
    } else {
      levelCount = levels?.length ?? 0;
      for (const l of levels ?? []) {
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
      console.error("AnalyticsPage: failed to load students", usersError);
    } else if (studentUsers && studentUsers.length > 0) {
      const studentIds = studentUsers.map((s) => s.id);

      const { data: scores, error: scoresError } = await supabase
        .from("student_scores")
        .select("user_id, game_logic_score, onsite_practical_score")
        .in("user_id", studentIds);
      if (scoresError) console.error("AnalyticsPage: failed to load scores", scoresError);
      const scoreByUser = new Map((scores ?? []).map((s) => [s.user_id, s]));

      const { data: logs, error: logsError } = await supabase
        .from("play_logs")
        .select("user_id, level_id, score, is_success")
        .in("user_id", studentIds);
      if (logsError) console.error("AnalyticsPage: failed to load play logs", logsError);
      const logsByUser = new Map<string, PlayLogLite[]>();
      for (const log of logs ?? []) {
        const arr = logsByUser.get(log.user_id) ?? [];
        arr.push(log);
        logsByUser.set(log.user_id, arr);
      }

      students = studentUsers.map((u) => {
        const score = scoreByUser.get(u.id);
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
          levelsPassed,
          logs: userLogs,
        };
      });
    }
  } catch (err) {
    console.error("AnalyticsPage crashed:", err);
  }

  return (
    <div className="flex flex-col gap-6">
      <div>
        <h1 className="text-2xl font-semibold text-zinc-900 dark:text-zinc-50">
          Analytics & Export
        </h1>
        <p className="mt-1 text-zinc-600 dark:text-zinc-400">
          {students.length} student{students.length === 1 ? "" : "s"} · {levelCount} level
          {levelCount === 1 ? "" : "s"}
        </p>
      </div>
      <AnalyticsClient students={students} levelSkills={levelSkills} />
    </div>
  );
}
