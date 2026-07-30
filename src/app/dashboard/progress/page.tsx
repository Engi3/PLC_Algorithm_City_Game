import Link from "next/link";
import { redirect } from "next/navigation";
import { getCurrentProfile } from "@/lib/auth/get-profile";
import { createClient } from "@/lib/supabase/server";
import { isLevelSpec } from "@/lib/ladder/level-spec";
import { computeSkillScores, type LevelSkillMap, type PlayLogLite } from "@/lib/analytics/skill-radar";
import {
  computeCompetencyScores,
  ALL_COMPETENCY_AXES,
  type ManualCompetencyScores,
} from "@/lib/analytics/competency";
import SkillRadarChart from "@/components/analytics/SkillRadarChart";
import CompetencyRadarChart from "@/components/analytics/CompetencyRadarChart";
import CoachBox from "@/components/progress/CoachBox";
import CertificateCard from "@/components/progress/CertificateCard";

type LevelRow = { id: string; levelNumber: number; title: string };

export default async function ProgressPage() {
  const profile = await getCurrentProfile();
  if (profile?.role !== "student") redirect("/dashboard");

  let logs: PlayLogLite[] = [];
  let levelSkills: LevelSkillMap = {};
  // Ordered by level_number to match the "Play Levels" list exactly -
  // without an explicit ORDER BY, Postgres row order is unspecified, so
  // this table could silently drift out of sync with /dashboard/play.
  let levelRows: LevelRow[] = [];
  let levelCount = 0;
  let gameLogicScore = 0;
  let onsitePracticalScore: number | null = null;
  let manualCompetency: ManualCompetencyScores = {
    wiring_skills: null,
    debugging_testing: null,
    advanced_challenge: null,
    system_control: null,
  };

  try {
    const supabase = await createClient();

    const { data: levels, error: levelsError } = await supabase
      .from("levels")
      .select("id, title, level_number, map_layout_json")
      .order("level_number", { ascending: true });
    if (levelsError) {
      console.error("ProgressPage: failed to load levels", levelsError);
    } else {
      levelCount = levels?.length ?? 0;
      for (const l of levels ?? []) {
        levelRows.push({ id: l.id, levelNumber: l.level_number, title: l.title ?? `Level ${l.level_number}` });
        if (isLevelSpec(l.map_layout_json)) levelSkills[l.id] = l.map_layout_json.skill;
      }
    }

    const { data: playLogs, error: logsError } = await supabase
      .from("play_logs")
      .select("level_id, score, is_success, created_at")
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

    // Queried separately: a PostgREST select() is all-or-nothing, so until
    // the Phase 12 migration runs, asking for these columns alongside
    // game_logic_score would fail the WHOLE query and wrongly zero out a
    // real, already-working score too. See load-class-data.ts for the same
    // split, applied there for the teacher's class-wide view.
    const { data: competencyRow, error: competencyError } = await supabase
      .from("student_scores")
      .select("wiring_skills, debugging_testing, advanced_challenge, system_control")
      .eq("user_id", profile.id)
      .maybeSingle();
    if (competencyError) {
      console.error("ProgressPage: failed to load competency scores", competencyError);
    } else if (competencyRow) {
      manualCompetency = {
        wiring_skills: competencyRow.wiring_skills ?? null,
        debugging_testing: competencyRow.debugging_testing ?? null,
        advanced_challenge: competencyRow.advanced_challenge ?? null,
        system_control: competencyRow.system_control ?? null,
      };
    }
  } catch (err) {
    console.error("ProgressPage crashed:", err);
  }

  const skillScores = computeSkillScores(logs, levelSkills);
  const competencyScores = computeCompetencyScores(logs, levelCount, manualCompetency);
  const passedLevelIds = new Set(logs.filter((l) => l.is_success).map((l) => l.level_id));
  const studentName =
    profile.first_name && profile.last_name ? `${profile.first_name} ${profile.last_name}` : profile.username;

  return (
    <div className="flex flex-col gap-6">
      <div>
        <h1 className="text-2xl font-semibold text-zinc-900 dark:text-zinc-50">My Progress</h1>
        <p className="mt-1 text-zinc-600 dark:text-zinc-400">
          Levels passed: {passedLevelIds.size} · Game score: {gameLogicScore}
          {onsitePracticalScore !== null && ` · Practical score: ${onsitePracticalScore}`}
        </p>
      </div>

      <CoachBox />

      <div className="grid grid-cols-1 gap-6 md:grid-cols-2">
        <div>
          <h2 className="mb-2 text-center text-sm font-semibold text-zinc-700 dark:text-zinc-300">
            ทักษะเกม (Skill Breakdown)
          </h2>
          <SkillRadarChart datasets={[{ label: profile.username, scores: skillScores, color: "#2563eb" }]} />
        </div>
        <div>
          <h2 className="mb-2 text-center text-sm font-semibold text-zinc-700 dark:text-zinc-300">
            สมรรถนะทางวิศวกรรม 6 ด้าน (Engineering Competency)
          </h2>
          <CompetencyRadarChart datasets={[{ label: profile.username, scores: competencyScores, color: "#7c3aed" }]} />
        </div>
      </div>

      <div>
        <h2 className="mb-2 text-sm font-semibold text-zinc-900 dark:text-zinc-50">
          ใบประกาศนียบัตรความสามารถ (Certificates)
        </h2>
        <p className="mb-3 text-xs text-zinc-500 dark:text-zinc-400">
          ปลดล็อกใบประกาศนียบัตรแต่ละด้านเมื่อคะแนนถึง 80/100 ขึ้นไป
        </p>
        <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 md:grid-cols-6">
          {ALL_COMPETENCY_AXES.map((axis) => (
            <CertificateCard
              key={axis}
              axis={axis}
              score={competencyScores[axis]}
              studentName={studentName}
              userId={profile.id}
            />
          ))}
        </div>
      </div>

      <div className="overflow-x-auto rounded-lg border border-zinc-200 dark:border-zinc-800">
        <table className="w-full min-w-[400px] text-left text-sm">
          <thead className="bg-zinc-50 text-xs uppercase text-zinc-500 dark:bg-zinc-900 dark:text-zinc-400">
            <tr>
              <th className="px-3 py-2">Level</th>
              <th className="px-3 py-2">Attempts</th>
              <th className="px-3 py-2">Status</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-zinc-200 dark:divide-zinc-800">
            {levelRows.map(({ id: levelId, levelNumber, title }) => {
              const levelLogs = logs.filter((l) => l.level_id === levelId);
              const bestScore = Math.max(0, ...levelLogs.filter((l) => l.is_success).map((l) => l.score ?? 0));
              const passed = passedLevelIds.has(levelId);
              return (
                <tr key={levelId}>
                  <td className="px-3 py-2">
                    <Link
                      href={`/dashboard/play/${levelId}`}
                      className="text-zinc-900 hover:text-blue-600 hover:underline dark:text-zinc-50 dark:hover:text-blue-400"
                    >
                      <span className="mr-1 text-xs font-semibold text-zinc-400">Level {levelNumber}</span>
                      {title}
                    </Link>
                  </td>
                  <td className="px-3 py-2 text-zinc-600 dark:text-zinc-400">{levelLogs.length}</td>
                  <td className="px-3 py-2">
                    {passed ? (
                      <span className="rounded-full bg-green-100 px-2 py-0.5 text-xs font-medium text-green-800 dark:bg-green-950 dark:text-green-400">
                        Best: {bestScore}
                      </span>
                    ) : (
                      <span className="rounded-full bg-zinc-100 px-2 py-0.5 text-xs font-medium text-zinc-500 dark:bg-zinc-900 dark:text-zinc-400">
                        Not passed
                      </span>
                    )}
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
