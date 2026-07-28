"use server";

import { getCurrentProfile } from "@/lib/auth/get-profile";
import { loadClassData, type ClassStudent } from "@/lib/analytics/load-class-data";
import { computeSkillScores, type LevelSkillMap } from "@/lib/analytics/skill-radar";
import { SKILL_LABELS, type SkillCategory } from "@/lib/ladder/level-spec";
import { generateGeminiText, GeminiConfigError, GeminiRequestError } from "@/lib/ai/gemini";

export type ClassInsightsResult = { insights: string; error?: undefined } | { error: string; insights?: undefined };

/** A level attempted 2+ times but never passed is a concrete "stuck here" signal worth surfacing to the teacher. */
function summarizeStudent(
  student: ClassStudent,
  levelSkills: LevelSkillMap,
  levelTitles: Record<string, string>
): string {
  const skillScores = computeSkillScores(student.logs, levelSkills);
  const skillsLine = Object.entries(skillScores)
    .map(([skill, score]) => `${SKILL_LABELS[skill as SkillCategory]}: ${score}`)
    .join(", ");

  const attemptsByLevel = new Map<string, { attempts: number; passed: boolean }>();
  for (const log of student.logs) {
    const cur = attemptsByLevel.get(log.level_id) ?? { attempts: 0, passed: false };
    cur.attempts += 1;
    if (log.is_success) cur.passed = true;
    attemptsByLevel.set(log.level_id, cur);
  }
  const strugglingLevels = [...attemptsByLevel.entries()]
    .filter(([, v]) => !v.passed && v.attempts >= 2)
    .map(([levelId]) => levelTitles[levelId] ?? levelId);

  const strugglingNote =
    strugglingLevels.length > 0 ? `, ด่านที่พยายามหลายครั้งแต่ยังไม่ผ่าน: ${strugglingLevels.join(", ")}` : "";

  return `- ${student.username}: ผ่านด่านแล้ว ${student.levelsPassed} ด่าน, คะแนนรวม ${student.gameLogicScore}, คะแนนแต่ละทักษะ (${skillsLine})${strugglingNote}`;
}

export async function generateClassInsightsAction(): Promise<ClassInsightsResult> {
  try {
    const profile = await getCurrentProfile();
    if (!profile || profile.role !== "teacher") return { error: "Forbidden." };

    const { students, levelSkills, levelTitles } = await loadClassData();
    if (students.length === 0) {
      return { error: "ยังไม่มีนักเรียนที่อนุมัติแล้วให้วิเคราะห์" };
    }

    const studentLines = students.map((s) => summarizeStudent(s, levelSkills, levelTitles)).join("\n");

    const prompt = `คุณเป็นผู้ช่วยอาจารย์วิเคราะห์ผลการเรียนวิชา PLC Ladder Logic ของนักเรียนกลุ่มหนึ่ง โดยมีทักษะ 5 ด้าน (Basic Logic, Latching, Timers, Counters, Efficiency) คะแนนแต่ละด้านอยู่ระหว่าง 0-100

ข้อมูลนักเรียนแต่ละคน (ระบุด้วยชื่อผู้ใช้):
${studentLines}

กรุณาวิเคราะห์และตอบเป็นภาษาไทย แบ่งเป็น 2 ส่วนชัดเจนโดยใช้หัวข้อระดับ ## :
## ภาพรวมชั้นเรียน
สรุปผลการเรียนโดยรวมของทั้งชั้น จุดแข็งและจุดอ่อนที่พบบ่อย (2-4 ประโยค)

## คำแนะนำรายบุคคล
สำหรับนักเรียนที่ดูเหมือนกำลังติดขัดในทักษะหรือด่านใดด่านหนึ่ง ให้ระบุชื่อผู้ใช้เป็นหัวข้อย่อยและคำแนะนำสั้นๆ ว่าควรทบทวนเรื่องอะไร (ถ้าไม่มีนักเรียนที่น่ากังวลเป็นพิเศษ ให้บอกว่าภาพรวมทั้งชั้นเรียนอยู่ในเกณฑ์ดี)

ตอบในรูปแบบ Markdown สั้นกระชับ ใช้ bullet list ได้ ห้ามใส่คำนำหรือคำลงท้ายอื่นนอกจาก 2 หัวข้อนี้`;

    const insights = await generateGeminiText(prompt);
    return { insights };
  } catch (err) {
    console.error("generateClassInsightsAction failed:", err);
    if (err instanceof GeminiConfigError) {
      return { error: "AI insights are not configured on this server yet." };
    }
    if (err instanceof GeminiRequestError) {
      return { error: "Could not reach the AI service. Please try again." };
    }
    return { error: "Something went wrong generating insights." };
  }
}
