"use server";

import { generateGeminiText, GeminiConfigError, GeminiRequestError } from "@/lib/ai/gemini";
import { programToStructuredText } from "@/lib/ladder/render-st";
import type { Inputs, LadderProgram, SimMemory } from "@/lib/ladder/types";

export type HintResult = { hint: string; error?: undefined } | { error: string; hint?: undefined };

function hasUnassignedAddress(program: LadderProgram): boolean {
  return program.rungs.some(
    (r) =>
      r.branches.some((b) => b.cells.some((c) => c && !c.address)) ||
      (r.output !== null && !r.output.address)
  );
}

export async function getHintAction(
  program: LadderProgram,
  inputs: Inputs,
  memory: SimMemory
): Promise<HintResult> {
  try {
    const st = programToStructuredText(program);
    const unassignedNote = hasUnassignedAddress(program)
      ? "หมายเหตุ: มีบาง contact หรือ output ที่ยังไม่ได้กำหนดแอดเดรส (address)"
      : "";

    const prompt = `คุณเป็นติวเตอร์สอน PLC Ladder Logic ให้กับนักศึกษาเมคคาทรอนิกส์ที่กำลังฝึกในแซนด์บ็อกซ์

โปรแกรมปัจจุบัน (แปลงเป็น Structured Text โดยประมาณ):
${st}

สถานะ Input: ${JSON.stringify(inputs)}
สถานะ Coil: ${JSON.stringify(memory.coils)}
สถานะ Timer: ${JSON.stringify(memory.timers)}
สถานะ Counter: ${JSON.stringify(memory.counters)}
${unassignedNote}

ให้คำแนะนำสั้นๆ เพียง 1 ข้อ (ไม่เกิน 3 ประโยค) แบบโค้ชชิ่ง ชี้ให้นักเรียนสังเกตและคิดเอง
ห้ามเฉลยคำตอบหรือบอกวิธีแก้ตรงๆ ให้ถามคำถามหรือชี้จุดสังเกตแทน ตอบเป็นภาษาไทย`;

    const hint = await generateGeminiText(prompt);
    return { hint };
  } catch (err) {
    console.error("getHintAction failed:", err);
    if (err instanceof GeminiConfigError) {
      return { error: "AI hints are not configured on this server yet." };
    }
    if (err instanceof GeminiRequestError) {
      return { error: "Could not reach the AI service. Please try again." };
    }
    return { error: "Something went wrong getting a hint." };
  }
}
