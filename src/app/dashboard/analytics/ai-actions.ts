"use server";

import { getCurrentProfile } from "@/lib/auth/get-profile";
import { loadClassData } from "@/lib/analytics/load-class-data";
import { computeSkillScores, type LevelSkillMap, type PlayLogLite } from "@/lib/analytics/skill-radar";
import { SKILL_LABELS, type SkillCategory } from "@/lib/ladder/level-spec";
import { generateGeminiJSON, GeminiConfigError, GeminiRequestError } from "@/lib/ai/gemini";
import { checkAiRateLimit, rateLimitMessage } from "@/lib/ai/rate-limit";

export type ClassInsightsResult =
  | { insights: string; source: "ai" | "fallback"; error?: undefined }
  | { error: string; insights?: undefined };

type ClassInsightsSchema = { summary: string };

const RESPONSE_SCHEMA = {
  type: "OBJECT",
  properties: {
    summary: { type: "STRING" },
  },
  required: ["summary"],
};

/** A level 2+ distinct students have attempted and not yet passed - a concrete, class-wide "stuck here" signal. */
function findCommonlyFailedLevels(
  students: { logs: PlayLogLite[] }[],
  levelTitles: Record<string, string>
): { levelId: string; label: string; studentsStuck: number }[] {
  const stuckCountByLevel = new Map<string, number>();
  for (const student of students) {
    const byLevel = new Map<string, PlayLogLite[]>();
    for (const log of student.logs) {
      const arr = byLevel.get(log.level_id) ?? [];
      arr.push(log);
      byLevel.set(log.level_id, arr);
    }
    for (const [levelId, logs] of byLevel) {
      if (logs.some((l) => l.is_success)) continue;
      stuckCountByLevel.set(levelId, (stuckCountByLevel.get(levelId) ?? 0) + 1);
    }
  }
  return [...stuckCountByLevel.entries()]
    .filter(([, count]) => count >= 2)
    .sort((a, b) => b[1] - a[1])
    .slice(0, 8)
    .map(([levelId, count]) => ({ levelId, label: levelTitles[levelId] ?? levelId, studentsStuck: count }));
}

function buildFallbackSummary(
  skillLine: string,
  commonlyFailed: { label: string; studentsStuck: number }[],
  gameCompletionRate: number
): string {
  const failedLine =
    commonlyFailed.length > 0
      ? commonlyFailed.map((l) => `${l.label} (${l.studentsStuck} คนยังไม่ผ่าน)`).join(", ")
      : "ไม่มีด่านที่นักเรียนหลายคนติดขัดเป็นพิเศษ";
  return `สรุปข้อมูลดิบ (ไม่ผ่าน AI): คะแนนเฉลี่ยแต่ละทักษะ - ${skillLine}. ด่านที่นักเรียนหลายคนยังติดขัด: ${failedLine}. ความคืบหน้า Game Mode เฉลี่ยของทั้งชั้น: ${gameCompletionRate}%`;
}

/**
 * Sends only class-wide aggregates to Gemini - average score per skill
 * category and which levels multiple students are stuck on - never
 * individual student names or per-student scores, per Phase 15's
 * "anonymized class score averages" requirement.
 */
export async function generateClassInsightsAction(): Promise<ClassInsightsResult> {
  const profile = await getCurrentProfile();
  if (!profile || profile.role !== "teacher") return { error: "Forbidden." };

  const rateLimit = checkAiRateLimit("class-insights", profile.id);
  if (!rateLimit.allowed) return { error: rateLimitMessage(rateLimit.retryAfterSeconds) };

  const { students, levelSkills, levelTitles, gameLevelCount } = await loadClassData();
  if (students.length === 0) {
    return { error: "ยังไม่มีนักเรียนที่อนุมัติแล้วให้วิเคราะห์" };
  }

  const classAverageScores = computeSkillScores(students.flatMap((s) => s.logs), levelSkills as LevelSkillMap);
  const skillLine = (Object.entries(classAverageScores) as [SkillCategory, number][])
    .map(([skill, score]) => `${SKILL_LABELS[skill]}: ${score}/100`)
    .join(", ");

  const commonlyFailed = findCommonlyFailedLevels(students, levelTitles);
  const failedLine =
    commonlyFailed.length > 0
      ? commonlyFailed.map((l) => `${l.label} (นักเรียนที่ยังไม่ผ่าน ${l.studentsStuck} คน)`).join("; ")
      : "ไม่มีด่านที่นักเรียนหลายคนติดขัดเป็นพิเศษ";

  // Same "class-wide aggregate only" anonymization as the skill/failed-level
  // lines above - one completion percentage across all 100 Game Mode
  // levels (Maze/Factory/Hybrid real-time PLC control), not per-student.
  const gamePassedTotal = students.reduce(
    (sum, s) => sum + new Set(s.gameLogs.filter((l) => l.is_success).map((l) => l.game_level_id)).size,
    0
  );
  const gameCompletionRate =
    students.length > 0 && gameLevelCount > 0 ? Math.round((gamePassedTotal / (students.length * gameLevelCount)) * 100) : 0;

  const prompt = `คุณเป็นผู้ช่วยอาจารย์วิเคราะห์ผลการเรียนวิชา PLC Ladder Logic ของนักเรียนทั้งชั้นเรียนจำนวน ${students.length} คน (ข้อมูลนี้เป็นค่าเฉลี่ยรวมของทั้งชั้น ไม่มีการระบุชื่อนักเรียนรายบุคคล)

คะแนนเฉลี่ยของทั้งชั้นเรียนแยกตามทักษะ (เต็ม 100): ${skillLine}

ด่านที่นักเรียนหลายคน (ตั้งแต่ 2 คนขึ้นไป) ยังติดขัดไม่ผ่าน: ${failedLine}

ความคืบหน้า Game Mode (จำลองควบคุมหุ่นยนต์ AGV ในเขาวงกตและสายการผลิตโรงงานแบบเรียลไทม์ ${gameLevelCount} ด่าน) เฉลี่ยของทั้งชั้นเรียน: ${gameCompletionRate}%

กรุณาวิเคราะห์และให้คำแนะนำเป็นภาษาไทย กระชับ (3-5 ประโยค) ว่าหัวข้อ PLC ใดที่อาจารย์ควรทบทวนเพิ่มเติมในการบรรยายหน้าชั้นเรียน โดยอ้างอิงข้อมูลข้างต้นให้ชัดเจน (รวมถึงความคืบหน้า Game Mode หากมีนัยสำคัญ) ตอบเฉพาะเนื้อหาคำแนะนำเท่านั้น ห้ามใส่คำนำหรือคำลงท้าย`;

  try {
    const result = await generateGeminiJSON<ClassInsightsSchema>(prompt, RESPONSE_SCHEMA);
    const summary = typeof result.summary === "string" && result.summary.trim() ? result.summary.trim() : null;
    if (!summary) throw new GeminiRequestError("Gemini returned an empty summary.");
    return { insights: summary, source: "ai" };
  } catch (err) {
    console.error("generateClassInsightsAction: Gemini call failed, using local fallback", err);
    if (!(err instanceof GeminiConfigError) && !(err instanceof GeminiRequestError)) {
      console.error("generateClassInsightsAction: unexpected error type", err);
    }
    return { insights: buildFallbackSummary(skillLine, commonlyFailed, gameCompletionRate), source: "fallback" };
  }
}
