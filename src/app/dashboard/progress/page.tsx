import { redirect } from "next/navigation";
import { getCurrentProfile } from "@/lib/auth/get-profile";
import { createClient } from "@/lib/supabase/server";
import { isLevelSpec } from "@/lib/ladder/level-spec";
import { computeSkillScores, type LevelSkillMap, type PlayLogLite } from "@/lib/analytics/skill-radar";
import SkillRadarChart from "@/components/analytics/SkillRadarChart";

export default async function ProgressPage() {
  const profile = await getCurrentProfile();
  if (profile?.role !== "student") redirect("/dashboard");

  let logs: PlayLogLite[] = [];
  let levelSkills: LevelSkillMap = {};
  let levelTitles: Record<string, string> = {};
  let gameLogicScore = 0;
  let onsitePracticalScore: number | null = null;

  try {
    const supabase = await createClient();

    const { data: levels, error: levelsError } = await supabase
      .from("levels")
      .select("id, title, level_number, map_layout_json");
    if (levelsError) {
      console.error("ProgressPage: failed to load levels", levelsError);
    } else {
      for (const l of levels ?? []) {
        levelTitles[l.id] = l.title ?? `Level ${l.level_number}`;
        if (isLevelSpec(l.map_layout_json)) levelSkills[l.id] = l.map_layout_json.skill;
      }
    }

    const { data: playLogs, error: logsError } = await supabase
      .from("play_logs")
      .select("level_id, score, is_success")
      .eq("user_id", profile.id);
    if (logsError) {
      console.error("ProgressPage: failed to load play logs", logsError);
    } else {
      logs = playLogs ?? [];
    }

    const { data: scoreRow, error: scoreError } = await supabase
      .from("student_scores")
      .select("game_logic_score, onsite_practical_score")
      .eq("user_id", profile.id)
      .maybeSingle();
    if (scoreError) {
      console.error("ProgressPage: failed to load student_scores", scoreError);
    } else if (scoreRow) {
      gameLogicScore = scoreRow.game_logic_score ?? 0;
      onsitePracticalScore = scoreRow.onsite_practical_score;
    }
  } catch (err) {
    console.error("ProgressPage crashed:", err);
  }

  const skillScores = computeSkillScores(logs, levelSkills);
  const passedLevelIds = new Set(logs.filter((l) => l.is_success).map((l) => l.level_id));

  return (
    <div className="flex flex-col gap-6">
      <div>
        <h1 className="text-2xl font-semibold text-zinc-900 dark:text-zinc-50">My Progress</h1>
        <p className="mt-1 text-zinc-600 dark:text-zinc-400">
          Levels passed: {passedLevelIds.size} · Game score: {gameLogicScore}
          {onsitePracticalScore !== null && ` · Practical score: ${onsitePracticalScore}`}
        </p>
      </div>

      <SkillRadarChart datasets={[{ label: profile.username, scores: skillScores, color: "#2563eb" }]} />

      <div className="overflow-x-auto rounded-lg border border-zinc-200 dark:border-zinc-800">
        <table className="w-full min-w-[400px] text-left text-sm">
          <thead className="bg-zinc-50 text-xs uppercase text-zinc-500 dark:bg-zinc-900 dark:text-zinc-400">
            <tr>
              <th className="px-3 py-2">Level</th>
              <th className="px-3 py-2">Attempts</th>
              <th className="px-3 py-2">Best score</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-zinc-200 dark:divide-zinc-800">
            {Object.entries(levelTitles).map(([levelId, title]) => {
              const levelLogs = logs.filter((l) => l.level_id === levelId);
              const bestScore = Math.max(0, ...levelLogs.filter((l) => l.is_success).map((l) => l.score ?? 0));
              return (
                <tr key={levelId}>
                  <td className="px-3 py-2 text-zinc-900 dark:text-zinc-50">{title}</td>
                  <td className="px-3 py-2 text-zinc-600 dark:text-zinc-400">{levelLogs.length}</td>
                  <td className="px-3 py-2 text-zinc-600 dark:text-zinc-400">
                    {passedLevelIds.has(levelId) ? bestScore : "-"}
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
    </div>
  );
}
