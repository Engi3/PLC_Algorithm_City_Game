import Link from "next/link";
import { getCurrentProfile } from "@/lib/auth/get-profile";
import { computeLiveEnergy } from "@/lib/economy/energy";
import { createClient } from "@/lib/supabase/server";
import { isLevelSpec } from "@/lib/ladder/level-spec";
import type { PlayLogLite } from "@/lib/analytics/skill-radar";
import {
  computeCompetencyScores,
  computeAllLevelsAverage,
  averageCompetencyScores,
  ALL_COMPETENCY_AXES,
  type ManualCompetencyScores,
  type CompetencyAxis,
  type CompetencyScores,
  type ChallengePlayLogLite,
} from "@/lib/analytics/competency";
import { CERTIFICATE_THRESHOLD } from "@/lib/certificate/threshold";
import { loadClassData } from "@/lib/analytics/load-class-data";
import CompetencyRadarChart from "@/components/analytics/CompetencyRadarChart";

function hasAllLevelsGate(axis: CompetencyAxis): boolean {
  return axis === "ladder_programming" || axis === "problem_solving";
}

/** Mirrors CertificateCard's own unlock rule (Phase 5) - kept in sync manually since this is just a count, not a full card. */
function isCertificateUnlocked(axis: CompetencyAxis, scores: CompetencyScores, allLevelsAverage: number): boolean {
  return scores[axis] >= CERTIFICATE_THRESHOLD && (!hasAllLevelsGate(axis) || allLevelsAverage >= CERTIFICATE_THRESHOLD);
}

export default async function DashboardPage() {
  const profile = await getCurrentProfile();
  const name = profile?.first_name || profile?.username;
  const liveEnergy = profile ? computeLiveEnergy(profile.energy, profile.energy_updated_at) : 0;

  return (
    <div className="flex flex-col gap-6">
      <div>
        <h1 className="text-2xl font-semibold text-zinc-900 dark:text-zinc-50">
          ยินดีต้อนรับ, {name}
        </h1>
        <p className="mt-1 text-zinc-600 dark:text-zinc-400">
          {profile?.role === "teacher"
            ? "ภาพรวมชั้นเรียนของคุณ"
            : profile?.is_guest
              ? "You're in guest trial mode - progress isn't saved to a permanent profile."
              : "พร้อมสำหรับการฝึกเขียนโปรแกรม PLC Ladder Logic หรือยัง?"}
        </p>
      </div>

      {profile && profile.role === "teacher" && <TeacherOverview />}
      {profile && profile.role !== "teacher" && (
        <>
          <div className="grid grid-cols-2 gap-4 sm:grid-cols-4">
            <StatCard label="Coins" value={profile.coins} />
            <StatCard label="Energy" value={liveEnergy} />
            <StatCard label="Hints" value={profile.hint_credits} />
            <StatCard label="Skip Tokens" value={profile.skip_tokens} />
          </div>
          <div className="flex flex-wrap gap-3">
            <Link
              href="/dashboard/play"
              className="w-fit rounded-full bg-blue-600 px-6 py-3 font-medium text-white transition-colors hover:bg-blue-700"
            >
              Browse levels
            </Link>
            <Link
              href="/dashboard/shop"
              className="w-fit rounded-full border border-zinc-300 px-6 py-3 font-medium text-zinc-900 transition-colors hover:bg-zinc-100 dark:border-zinc-700 dark:text-zinc-50 dark:hover:bg-zinc-900"
            >
              Visit shop
            </Link>
            <Link
              href="/dashboard/guide"
              className="w-fit rounded-full border border-zinc-300 px-6 py-3 font-medium text-zinc-900 transition-colors hover:bg-zinc-100 dark:border-zinc-700 dark:text-zinc-50 dark:hover:bg-zinc-900"
            >
              คู่มือการใช้งาน
            </Link>
          </div>
          <StudentSummary userId={profile.id} username={profile.username} />
        </>
      )}
    </div>
  );
}

function StatCard({ label, value }: { label: string; value: React.ReactNode }) {
  return (
    <div className="rounded-lg border border-zinc-200 bg-white p-4 dark:border-zinc-800 dark:bg-zinc-950">
      <p className="text-xs uppercase tracking-wide text-zinc-500 dark:text-zinc-400">
        {label}
      </p>
      <p className="mt-1 text-2xl font-semibold text-zinc-900 dark:text-zinc-50">
        {value}
      </p>
    </div>
  );
}

/**
 * Phase 6: condensed student home summary - radar + certificate unlock
 * count + a link out to the full /dashboard/progress page, which stays the
 * detailed view (per-level table, coach box, individual certificate
 * downloads) rather than being duplicated here.
 */
async function StudentSummary({ userId, username }: { userId: string; username: string }) {
  let logs: PlayLogLite[] = [];
  let levelCount = 0;
  let challengeLogs: ChallengePlayLogLite[] = [];
  let challengeCount = 0;
  let manual: ManualCompetencyScores = {
    wiring_skills: null,
    debugging_testing: null,
    advanced_challenge: null,
    system_control: null,
  };

  try {
    const supabase = await createClient();
    const { data: levels, error: levelsError } = await supabase.from("levels").select("id");
    if (levelsError) {
      console.error("DashboardPage/StudentSummary: failed to load levels", levelsError);
    } else {
      levelCount = levels?.length ?? 0;
    }

    const { count: challengeCountResult, error: challengeCountError } = await supabase
      .from("challenge_levels")
      .select("*", { count: "exact", head: true });
    if (challengeCountError) {
      console.error("DashboardPage/StudentSummary: failed to count challenge_levels", challengeCountError);
    } else {
      challengeCount = challengeCountResult ?? 0;
    }

    const { data: challengePlayLogs, error: challengeLogsError } = await supabase
      .from("challenge_play_logs")
      .select("challenge_level_id, is_success")
      .eq("user_id", userId);
    if (challengeLogsError) {
      console.error("DashboardPage/StudentSummary: failed to load challenge play logs", challengeLogsError);
    } else {
      challengeLogs = challengePlayLogs ?? [];
    }

    const { data: playLogs, error: logsError } = await supabase
      .from("play_logs")
      .select("level_id, score, is_success, created_at")
      .eq("user_id", userId);
    if (logsError) {
      console.error("DashboardPage/StudentSummary: failed to load play logs", logsError);
    } else {
      logs = playLogs ?? [];
    }

    const { data: competencyRow, error: competencyError } = await supabase
      .from("student_scores")
      .select("wiring_skills, debugging_testing, advanced_challenge, system_control")
      .eq("user_id", userId)
      .maybeSingle();
    if (competencyError) {
      console.error("DashboardPage/StudentSummary: failed to load competency scores", competencyError);
    } else if (competencyRow) {
      manual = {
        wiring_skills: competencyRow.wiring_skills ?? null,
        debugging_testing: competencyRow.debugging_testing ?? null,
        advanced_challenge: competencyRow.advanced_challenge ?? null,
        system_control: competencyRow.system_control ?? null,
      };
    }
  } catch (err) {
    console.error("DashboardPage/StudentSummary crashed:", err);
  }

  const competencyScores = computeCompetencyScores(logs, levelCount, manual, {
    logs: challengeLogs,
    totalChallenges: challengeCount,
  });
  const allLevelsAverage = computeAllLevelsAverage(logs, levelCount);
  const certificatesUnlocked = ALL_COMPETENCY_AXES.filter((axis) =>
    isCertificateUnlocked(axis, competencyScores, allLevelsAverage)
  ).length;
  const passedLevels = new Set(logs.filter((l) => l.is_success).map((l) => l.level_id)).size;

  return (
    <div className="rounded-lg border border-zinc-200 bg-white p-4 dark:border-zinc-800 dark:bg-zinc-950">
      <div className="mb-3 flex items-center justify-between gap-2">
        <h2 className="text-sm font-semibold text-zinc-900 dark:text-zinc-50">
          สมรรถนะทางวิศวกรรมและใบประกาศนียบัตร
        </h2>
        <Link href="/dashboard/progress" className="text-xs font-medium text-blue-600 hover:underline dark:text-blue-400">
          ดูความก้าวหน้าแบบเต็ม →
        </Link>
      </div>
      <div className="grid grid-cols-1 items-center gap-4 sm:grid-cols-2">
        <CompetencyRadarChart datasets={[{ label: username, scores: competencyScores, color: "#7c3aed" }]} />
        <div className="flex flex-col gap-3 text-center sm:text-left">
          <div>
            <p className="text-3xl font-semibold text-amber-600 dark:text-amber-400">
              {certificatesUnlocked}/{ALL_COMPETENCY_AXES.length}
            </p>
            <p className="text-xs text-zinc-500 dark:text-zinc-400">ใบประกาศนียบัตรที่ปลดล็อกแล้ว</p>
          </div>
          <div>
            <p className="text-3xl font-semibold text-zinc-900 dark:text-zinc-50">
              {passedLevels}/{levelCount}
            </p>
            <p className="text-xs text-zinc-500 dark:text-zinc-400">ด่านที่ผ่านแล้ว</p>
          </div>
        </div>
      </div>
    </div>
  );
}

/**
 * Phase 6: condensed teacher class overview - reuses loadClassData() (the
 * same live snapshot /dashboard/analytics and the AI insights action use)
 * for a few KPI tiles + class-average radar, linking out to the full
 * /dashboard/analytics page for the per-student table, CSV export, and AI
 * insights rather than duplicating those here.
 */
async function TeacherOverview() {
  const { students, levelCount, challengeCount } = await loadClassData();

  const totalStudents = students.length;
  const activeStudents = students.filter((s) => s.logs.length > 0).length;
  const totalSubmissions = students.reduce((sum, s) => sum + s.logs.length, 0);

  const perStudentCompetency = students.map((s) =>
    computeCompetencyScores(
      s.logs,
      levelCount,
      {
        wiring_skills: s.wiringSkills,
        debugging_testing: s.debuggingTesting,
        advanced_challenge: s.advancedChallenge,
        system_control: s.systemControl,
      },
      { logs: s.challengeLogs, totalChallenges: challengeCount }
    )
  );
  const perStudentAllLevelsAverage = students.map((s) => computeAllLevelsAverage(s.logs, levelCount));
  let passed = 0;
  const total = perStudentCompetency.length * ALL_COMPETENCY_AXES.length;
  perStudentCompetency.forEach((scores, i) => {
    const allLevelsAverage = perStudentAllLevelsAverage[i];
    for (const axis of ALL_COMPETENCY_AXES) {
      if (isCertificateUnlocked(axis, scores, allLevelsAverage)) passed += 1;
    }
  });
  const competencyPassRate = total > 0 ? Math.round((passed / total) * 100) : 0;
  const classAverageCompetency = averageCompetencyScores(perStudentCompetency);

  return (
    <div className="flex flex-col gap-6">
      <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
        <StatCard label="Total Students" value={totalStudents} />
        <StatCard label="Active Students" value={activeStudents} />
        <StatCard label="Total Submissions" value={totalSubmissions} />
        <StatCard label={`Competency Pass Rate (≥${CERTIFICATE_THRESHOLD})`} value={`${competencyPassRate}%`} />
      </div>

      <div className="rounded-lg border border-zinc-200 bg-white p-4 dark:border-zinc-800 dark:bg-zinc-950">
        <div className="mb-3 flex items-center justify-between gap-2">
          <h2 className="text-sm font-semibold text-zinc-900 dark:text-zinc-50">สมรรถนะเฉลี่ยของชั้นเรียน</h2>
          <Link href="/dashboard/analytics" className="text-xs font-medium text-blue-600 hover:underline dark:text-blue-400">
            ดูภาพรวมแบบเต็ม →
          </Link>
        </div>
        <CompetencyRadarChart datasets={[{ label: "Class Average", scores: classAverageCompetency, color: "#7c3aed" }]} />
      </div>
    </div>
  );
}
