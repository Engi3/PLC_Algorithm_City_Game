"use server";

import { getCurrentProfile } from "@/lib/auth/get-profile";
import { createClient } from "@/lib/supabase/server";
import { generateGeminiJSON, GeminiConfigError, GeminiRequestError } from "@/lib/ai/gemini";
import {
  computeCompetencyScores,
  ALL_COMPETENCY_AXES,
  COMPETENCY_LABELS_TH,
  type CompetencyAxis,
  type ManualCompetencyScores,
  type ChallengePlayLogLite,
  type GamePlayLogLite,
} from "@/lib/analytics/competency";
import type { PlayLogLite } from "@/lib/analytics/skill-radar";

export type CoachTipResult = { tip: string; axis: CompetencyAxis; score: number; source: "ai" | "fallback" };

type CoachTipSchema = { tip: string };

const RESPONSE_SCHEMA = {
  type: "OBJECT",
  properties: {
    tip: { type: "STRING" },
  },
  required: ["tip"],
};

/** Deterministic, non-AI message (Tier 2 Rule 2: never block a student if Gemini is unavailable). */
function fallbackTip(axis: CompetencyAxis, score: number): string {
  return `เราสังเกตว่าคะแนนด้าน "${COMPETENCY_LABELS_TH[axis]}" ของคุณยังต่ำสุดในบรรดา 6 ด้าน (${score}/100) ลองฝึกฝนด่านที่เกี่ยวข้องกับด้านนี้เพิ่มเติม แล้วกลับมาดูคะแนนอีกครั้งนะ!`;
}

/** Finds the lowest-scoring axis - that's what the coach box focuses its advice on. */
function findWeakestAxis(scores: Record<CompetencyAxis, number>): CompetencyAxis {
  return ALL_COMPETENCY_AXES.reduce((weakest, axis) => (scores[axis] < scores[weakest] ? axis : weakest));
}

/** Button-triggered (not automatic) AI Personal Coach tip, based on the student's own 6-axis competency scores. */
export async function generateCoachTipAction(): Promise<CoachTipResult | { error: string }> {
  const profile = await getCurrentProfile();
  if (!profile || profile.role !== "student") return { error: "Forbidden." };

  const supabase = await createClient();

  const { data: playLogs, error: logsError } = await supabase
    .from("play_logs")
    .select("level_id, score, is_success, created_at")
    .eq("user_id", profile.id);
  if (logsError) {
    console.error("generateCoachTipAction: failed to load play logs", logsError);
    return { error: "ไม่สามารถโหลดข้อมูลความคืบหน้าได้ในขณะนี้" };
  }
  const logs: PlayLogLite[] = playLogs ?? [];

  const { count: levelCount } = await supabase.from("levels").select("*", { count: "exact", head: true });
  const { count: challengeCount } = await supabase.from("challenge_levels").select("*", { count: "exact", head: true });
  const { data: challengePlayLogs, error: challengeLogsError } = await supabase
    .from("challenge_play_logs")
    .select("challenge_level_id, is_success")
    .eq("user_id", profile.id);
  if (challengeLogsError) console.error("generateCoachTipAction: failed to load challenge play logs", challengeLogsError);
  const challengeLogs: ChallengePlayLogLite[] = challengePlayLogs ?? [];

  const { count: gameLevelCount } = await supabase.from("game_levels").select("*", { count: "exact", head: true });
  const { data: gamePlayLogs, error: gameLogsError } = await supabase
    .from("game_play_logs")
    .select("game_level_id, is_success")
    .eq("user_id", profile.id);
  if (gameLogsError) console.error("generateCoachTipAction: failed to load game play logs", gameLogsError);
  const gameLogs: GamePlayLogLite[] = gamePlayLogs ?? [];

  let manual: ManualCompetencyScores = {
    wiring_skills: null,
    debugging_testing: null,
    advanced_challenge: null,
    system_control: null,
  };
  const { data: competencyRow } = await supabase
    .from("student_scores")
    .select("wiring_skills, debugging_testing, advanced_challenge, system_control")
    .eq("user_id", profile.id)
    .maybeSingle();
  if (competencyRow) {
    manual = {
      wiring_skills: competencyRow.wiring_skills ?? null,
      debugging_testing: competencyRow.debugging_testing ?? null,
      advanced_challenge: competencyRow.advanced_challenge ?? null,
      system_control: competencyRow.system_control ?? null,
    };
  }

  const scores = computeCompetencyScores(
    logs,
    levelCount ?? 0,
    manual,
    { logs: challengeLogs, totalChallenges: challengeCount ?? 0 },
    { logs: gameLogs, totalGameLevels: gameLevelCount ?? 0 }
  );
  const weakestAxis = findWeakestAxis(scores);
  const weakestScore = scores[weakestAxis];

  const scoresLine = ALL_COMPETENCY_AXES.map((a) => `${COMPETENCY_LABELS_TH[a]}: ${scores[a]}/100`).join(", ");

  const prompt = `คุณเป็นโค้ชส่วนตัวที่ให้กำลังใจนักเรียนวิชา PLC Ladder Logic เป็นภาษาไทย

คะแนนสมรรถนะทางวิศวกรรม 6 ด้านของนักเรียนคนนี้ (เต็ม 100): ${scoresLine}

ด้านที่คะแนนต่ำที่สุดคือ "${COMPETENCY_LABELS_TH[weakestAxis]}" (${weakestScore}/100)

กรุณาเขียนคำแนะนำสั้นๆ (2-3 ประโยค) เป็นภาษาไทยที่สุภาพและให้กำลังใจ โดยชี้เฉพาะเจาะจงไปที่ด้านที่คะแนนต่ำที่สุด พร้อมแนะนำสิ่งที่ควรฝึกฝนเพิ่มเติมอย่างเป็นรูปธรรม ห้ามใส่คำนำหรือหัวข้ออื่น ตอบเฉพาะข้อความคำแนะนำเท่านั้น`;

  try {
    const result = await generateGeminiJSON<CoachTipSchema>(prompt, RESPONSE_SCHEMA);
    const tip = typeof result.tip === "string" && result.tip.trim() ? result.tip.trim() : fallbackTip(weakestAxis, weakestScore);
    return { tip, axis: weakestAxis, score: weakestScore, source: "ai" };
  } catch (err) {
    console.error("generateCoachTipAction: Gemini call failed, using local fallback", err);
    if (!(err instanceof GeminiConfigError) && !(err instanceof GeminiRequestError)) {
      console.error("generateCoachTipAction: unexpected error type", err);
    }
    return { tip: fallbackTip(weakestAxis, weakestScore), axis: weakestAxis, score: weakestScore, source: "fallback" };
  }
}
