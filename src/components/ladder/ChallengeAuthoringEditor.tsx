"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { useLadderGrid } from "@/lib/ladder/use-ladder-grid";
import { useVariablePool } from "@/lib/ladder/use-variable-pool";
import GridEditorSurface from "@/components/ladder-grid/GridEditorSurface";
import { evaluateChallenge } from "@/lib/ladder/challenge-eval";
import { isChallengeStagesJson, COMPETENCY_TAG_LABELS, type RequiredCompetency } from "@/lib/ladder/challenge-types";
import {
  generateChallengeDraftAction,
  createChallengeAction,
  type CreateChallengeResult,
} from "@/app/dashboard/challenges/new/actions";
import { useAiCooldown } from "@/lib/ai/use-ai-cooldown";

const ALL_COMPETENCIES: RequiredCompetency[] = ["NO_NC", "TIMER", "COUNTER", "ANALOG", "INTERLOCK", "MATH"];

const EMPTY_STAGES_JSON = JSON.stringify(
  {
    testCases: [
      {
        stages: [{ id: "stage1", name: "ขั้นที่ 1: ...", frames: [{ inputs: { X0: true }, ticks: 0 }], expect: [{ kind: "bit", address: "Y0", expected: true }] }],
      },
    ],
  },
  null,
  2
);

/**
 * Challenge Mode authoring - no visual multi-stage/safety-constraint
 * builder exists yet (that's roughly as much work as the whole Challenge
 * Mode engine), so the scripted-test-case side is a reviewable JSON
 * textarea (either AI-drafted or hand-written) rather than a full form.
 * What this DOES give the teacher: a live Grid Editor to build a real
 * reference solution and a "Test" button that runs the exact same
 * evaluateChallenge() the graded Play page uses against the current draft
 * - the same self-verification discipline this session's own 50
 * hand-authored challenges relied on, just interactive instead of a
 * throwaway script.
 */
export default function ChallengeAuthoringEditor() {
  const router = useRouter();
  const grid = useLadderGrid();
  const pool = useVariablePool();

  const [title, setTitle] = useState("");
  const [description, setDescription] = useState("");
  const [hints, setHints] = useState<string[]>([]);
  const [newHint, setNewHint] = useState("");
  const [competencies, setCompetencies] = useState<Set<RequiredCompetency>>(new Set());
  const [maxOptimalBlocks, setMaxOptimalBlocks] = useState(10);
  const [stagesJsonText, setStagesJsonText] = useState(EMPTY_STAGES_JSON);

  const [roughIdea, setRoughIdea] = useState("");
  const [aiLoading, setAiLoading] = useState(false);
  const [aiError, setAiError] = useState<string | null>(null);
  const aiCooldown = useAiCooldown();

  const [testResult, setTestResult] = useState<{ passed: boolean; detail: string } | null>(null);
  const [saving, setSaving] = useState(false);
  const [saveResult, setSaveResult] = useState<CreateChallengeResult | null>(null);

  function toggleCompetency(tag: RequiredCompetency) {
    setCompetencies((prev) => {
      const next = new Set(prev);
      if (next.has(tag)) next.delete(tag);
      else next.add(tag);
      return next;
    });
  }

  function addHint() {
    if (!newHint.trim()) return;
    setHints((prev) => [...prev, newHint.trim()]);
    setNewHint("");
  }

  function removeHint(index: number) {
    setHints((prev) => prev.filter((_, i) => i !== index));
  }

  async function handleAiGenerate() {
    if (aiCooldown.active) return;
    setAiLoading(true);
    setAiError(null);
    try {
      const result = await generateChallengeDraftAction(roughIdea);
      if (!result.ok) {
        setAiError(result.error);
        return;
      }
      setTitle(result.title);
      setDescription(result.description);
      setHints(result.hints);
      setCompetencies(new Set(result.requiredCompetencies));
      setMaxOptimalBlocks(result.maxOptimalBlocks);
      setStagesJsonText(JSON.stringify(result.stagesJson, null, 2));
      setTestResult(null);
    } catch (err) {
      console.error("handleAiGenerate failed:", err);
      setAiError("เกิดข้อผิดพลาดที่ไม่คาดคิด");
    } finally {
      setAiLoading(false);
      aiCooldown.start();
    }
  }

  function handleTest() {
    let parsed: unknown;
    try {
      parsed = JSON.parse(stagesJsonText);
    } catch (err) {
      setTestResult({ passed: false, detail: `JSON ไม่ถูกต้อง: ${(err as Error).message}` });
      return;
    }
    if (!isChallengeStagesJson(parsed)) {
      setTestResult({ passed: false, detail: "โครงสร้าง JSON ไม่ถูกต้อง (ต้องมี testCases เป็นอาร์เรย์)" });
      return;
    }
    const spec = {
      challengeId: 0,
      title: title || "(ยังไม่ตั้งชื่อ)",
      description,
      requiredCompetencies: [...competencies],
      maxOptimalBlocks,
      testCases: parsed.testCases,
    };
    const result = evaluateChallenge(grid.gridProgram, spec);
    if (result.passed) {
      setTestResult({ passed: true, detail: "วงจรที่สร้างไว้ผ่านทุกสถานการณ์ทดสอบ ✓" });
      return;
    }
    const details = result.results
      .map((r, i) => {
        if (r.passed) return `สถานการณ์ ${i + 1}: ผ่าน`;
        if (r.fault) return `สถานการณ์ ${i + 1}: เกิดอุบัติเหตุ - ${r.fault.description}`;
        const lastStage = r.stageResults[r.stageResults.length - 1];
        return `สถานการณ์ ${i + 1}: ไม่ผ่านที่ขั้นตอน "${lastStage?.stageName ?? "?"}"`;
      })
      .join("\n");
    setTestResult({ passed: false, detail: details });
  }

  async function handleSave() {
    setSaving(true);
    setSaveResult(null);
    try {
      const result = await createChallengeAction({
        title,
        description,
        hints,
        requiredCompetencies: [...competencies],
        maxOptimalBlocks,
        stagesJsonText,
      });
      setSaveResult(result);
      if (!result.error && result.challengeLevelId) {
        router.push(`/dashboard/challenges/${result.challengeLevelId}`);
      }
    } catch (err) {
      console.error("handleSave failed:", err);
      setSaveResult({ error: "เกิดข้อผิดพลาดที่ไม่คาดคิด" });
    } finally {
      setSaving(false);
    }
  }

  return (
    <div className="flex flex-col gap-5">
      <div className="rounded-lg border border-purple-200 bg-purple-50 p-4 dark:border-purple-900 dark:bg-purple-950">
        <h2 className="text-sm font-semibold text-purple-900 dark:text-purple-200">✨ ให้ AI ช่วยสร้างโจทย์</h2>
        <p className="mt-1 text-xs text-purple-700 dark:text-purple-400">
          พิมพ์แนวคิดโจทย์คร่าวๆ เป็นภาษาไทย แล้วให้ AI ช่วยแต่งชื่อ คำอธิบาย คำใบ้ และเงื่อนไขการทดสอบให้ - ตรวจสอบและทดสอบด้วยวงจรจริงก่อนบันทึกเสมอ
        </p>
        <textarea
          value={roughIdea}
          onChange={(e) => setRoughIdea(e.target.value)}
          rows={3}
          placeholder="เช่น: สถานีบรรจุขวดที่ต้องนับขวดให้ครบ 10 ขวดต่อลัง แล้วส่งสัญญาณเปลี่ยนลังใหม่ พร้อมเซนเซอร์ตรวจน้ำหนักขวดที่ไม่ครบ"
          className="mt-2 w-full rounded-md border border-purple-300 bg-white p-2 text-sm dark:border-purple-800 dark:bg-zinc-950"
        />
        <button
          type="button"
          onClick={handleAiGenerate}
          disabled={aiLoading || aiCooldown.active}
          className="mt-2 rounded-md bg-purple-600 px-4 py-2 text-sm font-medium text-white hover:bg-purple-700 disabled:opacity-60"
        >
          {aiLoading ? "กำลังสร้าง..." : aiCooldown.active ? `รออีก ${aiCooldown.secondsLeft} วิ` : "✨ ให้ AI ช่วยสร้าง"}
        </button>
        {aiError && <p className="mt-2 text-xs text-red-600 dark:text-red-400">{aiError}</p>}
      </div>

      <div className="grid grid-cols-1 gap-4 md:grid-cols-2">
        <div className="flex flex-col gap-1">
          <label className="text-xs font-semibold text-zinc-600 dark:text-zinc-400">ชื่อโจทย์</label>
          <input
            value={title}
            onChange={(e) => setTitle(e.target.value)}
            className="rounded-md border border-zinc-300 px-3 py-2 text-sm dark:border-zinc-700 dark:bg-zinc-900"
          />
        </div>
        <div className="flex flex-col gap-1">
          <label className="text-xs font-semibold text-zinc-600 dark:text-zinc-400">บล็อกสูงสุดที่แนะนำ</label>
          <input
            type="number"
            min={1}
            value={maxOptimalBlocks}
            onChange={(e) => setMaxOptimalBlocks(Number(e.target.value))}
            className="rounded-md border border-zinc-300 px-3 py-2 text-sm dark:border-zinc-700 dark:bg-zinc-900"
          />
        </div>
      </div>

      <div className="flex flex-col gap-1">
        <label className="text-xs font-semibold text-zinc-600 dark:text-zinc-400">คำอธิบายโจทย์สถานการณ์</label>
        <textarea
          value={description}
          onChange={(e) => setDescription(e.target.value)}
          rows={4}
          className="rounded-md border border-zinc-300 px-3 py-2 text-sm dark:border-zinc-700 dark:bg-zinc-900"
        />
      </div>

      <div>
        <p className="mb-1 text-xs font-semibold text-zinc-600 dark:text-zinc-400">ทักษะที่เกี่ยวข้อง (required competencies)</p>
        <div className="flex flex-wrap gap-2">
          {ALL_COMPETENCIES.map((tag) => (
            <button
              key={tag}
              type="button"
              onClick={() => toggleCompetency(tag)}
              className={`rounded-full border px-3 py-1 text-xs font-medium ${
                competencies.has(tag)
                  ? "border-amber-500 bg-amber-100 text-amber-800 dark:bg-amber-950 dark:text-amber-300"
                  : "border-zinc-300 bg-white text-zinc-600 dark:border-zinc-700 dark:bg-zinc-900 dark:text-zinc-400"
              }`}
            >
              {COMPETENCY_TAG_LABELS[tag]}
            </button>
          ))}
        </div>
      </div>

      <div>
        <p className="mb-1 text-xs font-semibold text-zinc-600 dark:text-zinc-400">คำใบ้ (Hints)</p>
        <div className="flex flex-col gap-1.5">
          {hints.map((hint, i) => (
            <div key={i} className="flex items-center gap-2">
              <span className="flex-1 rounded bg-zinc-100 px-2 py-1 text-xs text-zinc-700 dark:bg-zinc-900 dark:text-zinc-300">
                {i + 1}. {hint}
              </span>
              <button type="button" onClick={() => removeHint(i)} className="text-xs text-red-500 hover:underline">
                ลบ
              </button>
            </div>
          ))}
        </div>
        <div className="mt-2 flex gap-2">
          <input
            value={newHint}
            onChange={(e) => setNewHint(e.target.value)}
            placeholder="เพิ่มคำใบ้..."
            className="flex-1 rounded-md border border-zinc-300 px-3 py-1.5 text-sm dark:border-zinc-700 dark:bg-zinc-900"
          />
          <button
            type="button"
            onClick={addHint}
            className="rounded-md border border-zinc-300 px-3 py-1.5 text-sm font-medium text-zinc-700 hover:bg-zinc-100 dark:border-zinc-700 dark:text-zinc-300 dark:hover:bg-zinc-900"
          >
            + เพิ่ม
          </button>
        </div>
      </div>

      <div className="flex flex-col gap-1">
        <label className="text-xs font-semibold text-zinc-600 dark:text-zinc-400">
          เงื่อนไขการทดสอบ (stages_json) - แก้ไขเองได้โดยตรง
        </label>
        <textarea
          value={stagesJsonText}
          onChange={(e) => setStagesJsonText(e.target.value)}
          rows={14}
          spellCheck={false}
          className="w-full rounded-md border border-zinc-300 bg-zinc-50 px-3 py-2 font-mono text-xs dark:border-zinc-700 dark:bg-zinc-950"
        />
      </div>

      <div className="rounded-lg border border-zinc-200 bg-white p-4 dark:border-zinc-800 dark:bg-zinc-950">
        <h2 className="mb-2 text-sm font-semibold text-zinc-900 dark:text-zinc-50">
          ทดสอบด้วยวงจรจริง - ต่อวงจรคำตอบที่ถูกต้องแล้วกด &quot;ทดสอบโจทย์นี้&quot;
        </h2>
        <GridEditorSurface grid={grid} pool={pool} banner={null} />
        <div className="mt-4 flex flex-wrap items-center gap-3">
          <button
            type="button"
            onClick={handleTest}
            className="rounded-md bg-blue-600 px-4 py-2 text-sm font-medium text-white hover:bg-blue-700"
          >
            ▶ ทดสอบโจทย์นี้
          </button>
          {testResult && (
            <span
              className={`text-xs font-medium ${testResult.passed ? "text-emerald-600 dark:text-emerald-400" : "text-red-600 dark:text-red-400"}`}
            >
              {testResult.passed ? "✓ ผ่าน" : "✗ ไม่ผ่าน"}
            </span>
          )}
        </div>
        {testResult && !testResult.passed && (
          <pre className="mt-2 whitespace-pre-wrap rounded-md bg-red-50 p-2 text-xs text-red-800 dark:bg-red-950 dark:text-red-300">
            {testResult.detail}
          </pre>
        )}
      </div>

      <div className="flex flex-wrap items-center gap-3 border-t border-zinc-200 pt-4 dark:border-zinc-800">
        <button
          type="button"
          onClick={handleSave}
          disabled={saving}
          className="rounded-md bg-emerald-600 px-5 py-2.5 text-sm font-semibold text-white hover:bg-emerald-700 disabled:opacity-60"
        >
          {saving ? "กำลังบันทึก..." : "💾 บันทึกโจทย์"}
        </button>
        {saveResult?.error && <span className="text-xs text-red-600 dark:text-red-400">{saveResult.error}</span>}
      </div>
    </div>
  );
}
