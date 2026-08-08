import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { getCurrentProfile } from "@/lib/auth/get-profile";
import { evaluateGridLevel, countGridBlocks } from "@/lib/ladder/level-eval";
import { isLevelSpec } from "@/lib/ladder/level-spec";
import { evaluateChallenge } from "@/lib/ladder/challenge-eval";
import { challengeRowToSpec, type ChallengeLevelRow } from "@/lib/ladder/challenge-types";
import { gameLevelRowToSpec, type GameLevelRow } from "@/lib/games/game-level-types";
import { runGameLevelToCompletion } from "@/lib/games/run-game-level";
import { compileGridProgram, compiledProgramToStructuredText } from "@/lib/ladder/iec-compiler";
import { generateGeminiJSON, GeminiConfigError, GeminiRequestError } from "@/lib/ai/gemini";
import { checkAiRateLimit, rateLimitMessage } from "@/lib/ai/rate-limit";
import type { GridProgram } from "@/lib/ladder/grid-types";

type AiReviewScores = { correctness: number; conciseness: number; safety: number; approach: number; feedback: string };
type ContextKind = "level" | "challenge" | "game";

const RESPONSE_SCHEMA = {
  type: "OBJECT",
  properties: {
    correctness: { type: "INTEGER" },
    conciseness: { type: "INTEGER" },
    safety: { type: "INTEGER" },
    approach: { type: "INTEGER" },
    feedback: { type: "STRING" },
  },
  required: ["correctness", "conciseness", "safety", "approach", "feedback"],
};

function clamp0to100(n: unknown): number {
  const num = typeof n === "number" ? n : Number(n);
  if (!Number.isFinite(num)) return 0;
  return Math.max(0, Math.min(100, Math.round(num)));
}

/** Verifies the submission actually passed and builds the (description, blocksNote) pair the prompt needs - one branch per context kind, sharing everything else (Gemini call, scoring, persistence) below. */
async function verifyAndDescribe(
  contextKind: ContextKind,
  contextId: string,
  program: GridProgram
): Promise<{ ok: true; description: string; blocksNote: string } | { ok: false; error: string }> {
  const supabase = await createClient();

  if (contextKind === "level") {
    const { data: level, error } = await supabase
      .from("levels")
      .select("id, optimal_blocks_count, map_layout_json")
      .eq("id", contextId)
      .single();
    if (error || !level || !isLevelSpec(level.map_layout_json)) return { ok: false, error: "Level not found or misconfigured." };

    const evalResult = evaluateGridLevel(program, level.map_layout_json);
    if (!evalResult.passed) return { ok: false, error: "โปรแกรมยังไม่ผ่านชุดทดสอบของด่านนี้ กรุณาส่งคำตอบที่ถูกต้องก่อนขอรีวิวจาก AI" };

    const blocksUsed = countGridBlocks(program);
    return {
      ok: true,
      description: level.map_layout_json.description,
      blocksNote: `จำนวนบล็อกที่ใช้: ${blocksUsed}${level.optimal_blocks_count ? ` (ค่าที่เหมาะสมที่สุดคือ ${level.optimal_blocks_count} บล็อก)` : ""}`,
    };
  }

  if (contextKind === "challenge") {
    const { data, error } = await supabase
      .from("challenge_levels")
      .select("id, challenge_id, title, description, required_competencies, hints, stages_json, max_optimal_blocks, reference_grid_program_json")
      .eq("id", contextId)
      .single();
    if (error || !data) return { ok: false, error: "Challenge not found." };

    const spec = challengeRowToSpec(data as ChallengeLevelRow);
    if (!spec) return { ok: false, error: "This challenge is misconfigured." };

    const evalResult = evaluateChallenge(program, spec);
    if (!evalResult.passed) return { ok: false, error: "โปรแกรมยังไม่ผ่านทุกด่านย่อยของ Challenge นี้ กรุณาส่งคำตอบที่ถูกต้องก่อนขอรีวิวจาก AI" };

    const blocksUsed = countGridBlocks(program);
    return {
      ok: true,
      description: spec.description,
      blocksNote: `จำนวนบล็อกที่ใช้: ${blocksUsed}${spec.maxOptimalBlocks ? ` (ค่าที่เหมาะสมที่สุดคือ ${spec.maxOptimalBlocks} บล็อก)` : ""}`,
    };
  }

  const { data, error } = await supabase
    .from("game_levels")
    .select(
      "id, level_number, game_type, title, description, hints, map_layout_json, robot_start_json, factory_initial_json, success_conditions_json, safety_constraints_json, time_limit_ticks, ticks_per_second"
    )
    .eq("id", contextId)
    .single();
  if (error || !data) return { ok: false, error: "Game level not found." };

  const spec = gameLevelRowToSpec(data as GameLevelRow);
  if (!spec) return { ok: false, error: "This game level is misconfigured." };

  const maxTicks = (spec.timeLimitTicks ?? 100) + 5;
  const outcome = runGameLevelToCompletion(program, spec, maxTicks);
  if (outcome.status !== "won") return { ok: false, error: "โปรแกรมยังไม่ผ่านด่านนี้ กรุณาส่งคำตอบที่ถูกต้องก่อนขอรีวิวจาก AI" };

  const blocksUsed = countGridBlocks(program);
  return { ok: true, description: spec.description, blocksNote: `จำนวนบล็อกที่ใช้: ${blocksUsed}` };
}

/**
 * AI code reviewer, shared by Levels/Challenge Mode/Game Mode - independent
 * of each context's own submit action's bookkeeping (energy/coins/attempt
 * logs), same as the original Levels-only version: the frontend only calls
 * this after its own submit already reported a pass, and this route
 * re-verifies that pass server-side (per context kind, see
 * verifyAndDescribe above) before ever calling Gemini, since it can award
 * bonus coins. A Gemini outage never blocks or penalizes the student - the
 * base submission already succeeded via the deterministic gate before this
 * endpoint is even called.
 */
export async function POST(request: Request) {
  let body: { contextKind?: ContextKind; contextId?: string; levelId?: string; program?: GridProgram };
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: "Invalid request body." }, { status: 400 });
  }

  // levelId is the pre-existing Levels-only shape - still accepted so no
  // caller needs updating just to keep working.
  const contextKind: ContextKind = body.contextKind ?? "level";
  const contextId = body.contextId ?? body.levelId;
  const { program } = body;
  if (!contextId || !program) {
    return NextResponse.json({ error: "Missing contextId or program." }, { status: 400 });
  }

  const profile = await getCurrentProfile();
  if (!profile) {
    return NextResponse.json({ error: "Not signed in." }, { status: 401 });
  }

  const rateLimit = checkAiRateLimit("evaluate-submission", profile.id);
  if (!rateLimit.allowed) {
    return NextResponse.json({ available: false, message: rateLimitMessage(rateLimit.retryAfterSeconds) });
  }

  const verified = await verifyAndDescribe(contextKind, contextId, program);
  if (!verified.ok) {
    return NextResponse.json({ error: verified.error }, { status: verified.error.includes("not found") ? 404 : 400 });
  }

  const structuredText = compiledProgramToStructuredText(compileGridProgram(program.grids));

  const prompt = `คุณเป็นวิศวกรอาวุโสที่ตรวจสอบโค้ด PLC Ladder Logic ของนักศึกษา

โจทย์: ${verified.description}

โปรแกรมของนักเรียน (Structured Text โดยประมาณ):
${structuredText}

${verified.blocksNote}

โปรแกรมนี้ผ่านชุดทดสอบทั้งหมดแล้ว (ทำงานถูกต้องตามข้อกำหนด) กรุณาประเมิน 4 ด้านนี้เป็นคะแนน 0-100:
- correctness: ความถูกต้องเชิงตรรกะและความสมเหตุสมผลของวิธีแก้ปัญหา
- conciseness: ความกระชับ ใช้จำนวนรังคำสั่ง (rung) และบล็อกคำสั่งอย่างมีประสิทธิภาพ เทียบกับจำนวนบล็อกที่เหมาะสมที่สุด
- safety: การมี interlock ด้านความปลอดภัย การรีเซ็ตที่เหมาะสม หรือโครงสร้างที่อ่านง่าย
- approach: แนวทางและตรรกะการคิดแก้ปัญหาของนักเรียน (ไม่ใช่แค่ว่าผ่านหรือไม่ - ประเมินว่าวิธีคิดมีประสิทธิภาพหรืออ้อมค้อม ใช้เทคนิคที่ชาญฉลาด เช่น self-hold, interlock, การแบ่งแขนงที่เหมาะสม หรือมีรูปแบบที่ไม่ดี (antipattern) เช่น การต่อวนซ้ำซ้อนโดยไม่จำเป็น)

และ feedback: คำแนะนำเชิงสร้างสรรค์เป็นภาษาไทย อธิบายว่าโค้ดนี้ดีอย่างไรหรือควรปรับปรุงอย่างไรให้ดีขึ้น รวมถึงความเห็นต่อแนวทางการแก้ปัญหาของนักเรียน (2-4 ประโยค)`;

  let review: AiReviewScores;
  try {
    review = await generateGeminiJSON<AiReviewScores>(prompt, RESPONSE_SCHEMA);
  } catch (err) {
    console.error("evaluate-submission: Gemini call failed", err);
    const message =
      err instanceof GeminiConfigError
        ? "การประเมิน AI ยังไม่ได้ตั้งค่าไว้บนเซิร์ฟเวอร์นี้"
        : err instanceof GeminiRequestError
          ? "ไม่สามารถเชื่อมต่อบริการ AI ได้ในขณะนี้ กรุณาลองใหม่ภายหลัง"
          : "เกิดข้อผิดพลาดในการประเมิน AI";
    return NextResponse.json({ available: false, message });
  }

  const correctness = clamp0to100(review.correctness);
  const conciseness = clamp0to100(review.conciseness);
  const safety = clamp0to100(review.safety);
  const approach = clamp0to100(review.approach);
  const feedback =
    typeof review.feedback === "string" && review.feedback.trim() ? review.feedback.trim() : "AI ไม่ได้ให้ความคิดเห็นเพิ่มเติม";

  // Teachers preview AI review quality while testing content; their runs
  // must never award coins or land in ai_evaluations (same rule the rest
  // of the economy already applies to teacher test-plays).
  const isEconomySubject = profile.role !== "teacher";
  const coinsAwarded = isEconomySubject ? Math.max(0, Math.round((correctness + conciseness + safety) / 3 / 10)) : 0;

  if (isEconomySubject) {
    try {
      const admin = createAdminClient();
      const { error: insertError } = await admin.from("ai_evaluations").insert({
        user_id: profile.id,
        context_kind: contextKind,
        level_id: contextKind === "level" ? contextId : null,
        challenge_id: contextKind === "challenge" ? contextId : null,
        game_level_id: contextKind === "game" ? contextId : null,
        correctness,
        conciseness,
        safety,
        approach,
        feedback,
        coins_awarded: coinsAwarded,
      });
      if (insertError) console.error("evaluate-submission: failed to insert ai_evaluations row", insertError);

      if (coinsAwarded > 0) {
        const { error: coinsError } = await admin.from("users").update({ coins: profile.coins + coinsAwarded }).eq("id", profile.id);
        if (coinsError) console.error("evaluate-submission: failed to award bonus coins", coinsError);
      }
    } catch (err) {
      console.error("evaluate-submission: persistence crashed", err);
    }
  }

  return NextResponse.json({
    available: true,
    correctness,
    conciseness,
    safety,
    approach,
    feedback,
    coinsAwarded,
  });
}
