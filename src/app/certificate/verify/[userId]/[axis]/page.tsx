import { createAdminClient } from "@/lib/supabase/admin";
import {
  computeCompetencyScores,
  computeAllLevelsAverage,
  ALL_COMPETENCY_AXES,
  COMPETENCY_LABELS_TH,
  type CompetencyAxis,
  type ManualCompetencyScores,
} from "@/lib/analytics/competency";
import { CERTIFICATE_THRESHOLD } from "@/lib/certificate/threshold";
import type { PlayLogLite } from "@/lib/analytics/skill-radar";

function isCompetencyAxis(value: string): value is CompetencyAxis {
  return (ALL_COMPETENCY_AXES as string[]).includes(value);
}

/**
 * Public, unauthenticated verification page - what a certificate's QR code
 * points to. Re-derives the student's CURRENT score live from the database
 * rather than trusting anything printed on the PDF itself, so a screenshot-
 * edited certificate can't fake a pass: this page is the source of truth.
 */
export default async function VerifyCertificatePage({
  params,
}: {
  params: Promise<{ userId: string; axis: string }>;
}) {
  const { userId, axis: axisParam } = await params;

  if (!isCompetencyAxis(axisParam)) {
    return <NotFoundCard message="ไม่พบประเภทใบประกาศนียบัตรนี้" />;
  }
  const axis = axisParam;

  const admin = createAdminClient();
  const { data: user, error: userError } = await admin
    .from("users")
    .select("first_name, last_name, username, role")
    .eq("id", userId)
    .maybeSingle();

  if (userError || !user || user.role !== "student") {
    return <NotFoundCard message="ไม่พบข้อมูลนักเรียนนี้" />;
  }

  const studentName = user.first_name && user.last_name ? `${user.first_name} ${user.last_name}` : user.username;

  const { data: playLogs } = await admin
    .from("play_logs")
    .select("level_id, score, is_success, created_at")
    .eq("user_id", userId);
  const logs: PlayLogLite[] = playLogs ?? [];

  const { count: levelCount } = await admin.from("levels").select("*", { count: "exact", head: true });

  let manual: ManualCompetencyScores = {
    wiring_skills: null,
    debugging_testing: null,
    advanced_challenge: null,
    system_control: null,
  };
  const { data: competencyRow } = await admin
    .from("student_scores")
    .select("wiring_skills, debugging_testing, advanced_challenge, system_control")
    .eq("user_id", userId)
    .maybeSingle();
  if (competencyRow) {
    manual = {
      wiring_skills: competencyRow.wiring_skills ?? null,
      debugging_testing: competencyRow.debugging_testing ?? null,
      advanced_challenge: competencyRow.advanced_challenge ?? null,
      system_control: competencyRow.system_control ?? null,
    };
  }

  const scores = computeCompetencyScores(logs, levelCount ?? 0, manual);
  const score = scores[axis];
  // Phase 5: ladder_programming/problem_solving also require ≥80% average
  // across every level in the system - re-derived live here too, same as
  // score itself, so a screenshot-edited certificate can't fake past this
  // gate either (see this file's own doc comment).
  const allLevelsAverage = computeAllLevelsAverage(logs, levelCount ?? 0);
  const hasAllLevelsGate = axis === "ladder_programming" || axis === "problem_solving";
  const passed = score >= CERTIFICATE_THRESHOLD && (!hasAllLevelsGate || allLevelsAverage >= CERTIFICATE_THRESHOLD);

  return (
    <div className="mx-auto flex min-h-screen max-w-md flex-col items-center justify-center gap-4 p-6 text-center">
      <span className="text-5xl" aria-hidden>
        {passed ? "✅" : "⚠️"}
      </span>
      <h1 className="text-xl font-semibold text-zinc-900 dark:text-zinc-50">
        {passed ? "ตรวจสอบใบประกาศนียบัตรสำเร็จ" : "คะแนนปัจจุบันต่ำกว่าเกณฑ์แล้ว"}
      </h1>
      <div className="w-full rounded-lg border border-zinc-200 bg-white p-4 text-left dark:border-zinc-800 dark:bg-zinc-950">
        <p className="text-sm text-zinc-500 dark:text-zinc-400">ชื่อนักเรียน</p>
        <p className="mb-2 text-base font-medium text-zinc-900 dark:text-zinc-50">{studentName}</p>
        <p className="text-sm text-zinc-500 dark:text-zinc-400">ด้านความสามารถ</p>
        <p className="mb-2 text-base font-medium text-zinc-900 dark:text-zinc-50">{COMPETENCY_LABELS_TH[axis]}</p>
        <p className="text-sm text-zinc-500 dark:text-zinc-400">คะแนนล่าสุด</p>
        <p
          className={`text-base font-medium ${passed ? "text-green-600 dark:text-green-400" : "text-amber-600 dark:text-amber-400"}`}
        >
          {score}/100
        </p>
        {hasAllLevelsGate && (
          <>
            <p className="mt-2 text-sm text-zinc-500 dark:text-zinc-400">คะแนนเฉลี่ยทุกด่านในระบบ</p>
            <p
              className={`text-base font-medium ${allLevelsAverage >= CERTIFICATE_THRESHOLD ? "text-green-600 dark:text-green-400" : "text-amber-600 dark:text-amber-400"}`}
            >
              {allLevelsAverage}/100
            </p>
          </>
        )}
      </div>
      <p className="text-xs text-zinc-400 dark:text-zinc-500">
        ผลการตรวจสอบนี้คำนวณจากข้อมูลปัจจุบัน ณ เวลาที่เข้าดูหน้านี้ - PLC Algorithm Practice
      </p>
    </div>
  );
}

function NotFoundCard({ message }: { message: string }) {
  return (
    <div className="mx-auto flex min-h-screen max-w-md flex-col items-center justify-center gap-3 p-6 text-center">
      <span className="text-5xl" aria-hidden>
        ❌
      </span>
      <h1 className="text-lg font-semibold text-zinc-900 dark:text-zinc-50">{message}</h1>
      <p className="text-sm text-zinc-500 dark:text-zinc-400">ลิงก์นี้อาจไม่ถูกต้องหรือหมดอายุแล้ว</p>
    </div>
  );
}
