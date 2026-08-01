"use client";

import { useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import { COIL_ADDRESSES, INPUT_ADDRESSES, type Inputs } from "@/lib/ladder/types";
import { readBit } from "@/lib/ladder/engine";
import { COIL_COLUMN, isCoilNode, type GridProgram } from "@/lib/ladder/grid-types";
import { programToGridProgram } from "@/lib/ladder/grid-adapter";
import { evaluateGridLevel, type LevelEvalResult } from "@/lib/ladder/level-eval";
import { SKILL_LABELS, type LevelSpec, type LevelTestCase, type SkillCategory } from "@/lib/ladder/level-spec";
import { useLadderGrid } from "@/lib/ladder/use-ladder-grid";
import { useVariablePool } from "@/lib/ladder/use-variable-pool";
import GridEditorSurface from "@/components/ladder-grid/GridEditorSurface";
import { saveLevelAction } from "@/app/dashboard/levels/actions";

export type InitialLevel = {
  id: string;
  levelNumber: number;
  title: string;
  optimalBlocksCount: number | null;
  spec: LevelSpec;
};

/**
 * Grid-native counterpart of the legacy `relevantExpectAddresses` this
 * replaced - same purpose (offer every allowed output plus any TIMER/
 * COUNTER's `.DN` done-bit as a candidate for a test case's expected
 * outcome), just reading coil-column nodes out of every rung's grid instead
 * of a legacy Rung's `outputs` array.
 */
function relevantGridExpectAddresses(gridProgram: GridProgram, allowedOutputs: string[]): string[] {
  const addrs = new Set<string>(allowedOutputs);
  for (const grid of gridProgram.grids) {
    for (const row of grid.cells) {
      const node = row[COIL_COLUMN].node;
      if (!node || !isCoilNode(node) || !node.address) continue;
      if (node.kind === "TIMER" || node.kind === "COUNTER") {
        addrs.add(`${node.address}.DN`);
      }
    }
  }
  return [...addrs];
}

/** Seeds the authoring editor's grid from whichever reference-solution shape the level was last saved with - preferring the grid-native field, falling back to a lossless legacy->grid conversion for levels saved before this migration, or starting empty for a brand new level. */
function initialGridProgram(spec: LevelSpec | undefined): GridProgram | undefined {
  if (!spec) return undefined;
  if (spec.referenceGridProgram) return spec.referenceGridProgram;
  if (spec.referenceProgram) return programToGridProgram(spec.referenceProgram);
  return undefined;
}

export default function LevelAuthoringEditor({ initialLevel }: { initialLevel?: InitialLevel }) {
  const router = useRouter();
  const grid = useLadderGrid(useMemo(() => initialGridProgram(initialLevel?.spec), [initialLevel]));
  const pool = useVariablePool();

  const [title, setTitle] = useState(initialLevel?.title ?? "");
  const [levelNumber, setLevelNumber] = useState(initialLevel?.levelNumber ?? 1);
  const [description, setDescription] = useState(initialLevel?.spec.description ?? "");
  const [skill, setSkill] = useState<SkillCategory>(initialLevel?.spec.skill ?? "basic_logic");
  const [optimalBlocksCount, setOptimalBlocksCount] = useState<number | "">(
    initialLevel?.optimalBlocksCount ?? ""
  );
  const [allowedInputs, setAllowedInputs] = useState<string[]>(initialLevel?.spec.allowedInputs ?? []);
  const [allowedOutputs, setAllowedOutputs] = useState<string[]>(initialLevel?.spec.allowedOutputs ?? []);
  const [hintsText, setHintsText] = useState((initialLevel?.spec.hints ?? []).join("\n"));

  const [testCases, setTestCases] = useState<LevelTestCase[]>(initialLevel?.spec.testCases ?? []);
  const [currentFrames, setCurrentFrames] = useState<{ inputs: Inputs; ticks: number }[]>([]);
  const [pendingTicks, setPendingTicks] = useState(0);
  const [expectChecked, setExpectChecked] = useState<Record<string, boolean>>({});

  const [testResult, setTestResult] = useState<LevelEvalResult | null>(null);
  const [saveError, setSaveError] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);

  const { gridProgram, inputs, memory } = grid;
  const expectAddresses = useMemo(
    () => relevantGridExpectAddresses(gridProgram, allowedOutputs),
    [gridProgram, allowedOutputs]
  );

  function toggleInAllowedInputs(addr: string) {
    setAllowedInputs((prev) => (prev.includes(addr) ? prev.filter((a) => a !== addr) : [...prev, addr]));
  }
  function toggleInAllowedOutputs(addr: string) {
    setAllowedOutputs((prev) => (prev.includes(addr) ? prev.filter((a) => a !== addr) : [...prev, addr]));
  }

  /**
   * The test-case recorder wraps the grid's own toggleInput/setInputValue/
   * step so every input change or scan tick during recording resets
   * `pendingTicks` back to 0 the moment inputs change (a frame's `ticks`
   * counts scans *after* that frame's inputs were applied, not before) -
   * unchanged in spirit from the legacy recorder, just driven by the grid
   * hook's equivalents instead of `useLadderProgram`'s.
   */
  function recordToggleInput(addr: string) {
    grid.toggleInput(addr);
    setPendingTicks(0);
  }

  function recordSetInputValue(addr: string, value: boolean) {
    grid.setInputValue(addr, value);
    setPendingTicks(0);
  }

  function recordSetAnalogInput(addr: string, value: number) {
    grid.setAnalogInput(addr, value);
    setPendingTicks(0);
  }

  function recordStep() {
    grid.step();
    setPendingTicks((t) => t + 1);
  }

  function resetRecording() {
    grid.reset();
    setCurrentFrames([]);
    setPendingTicks(0);
  }

  function addFrame() {
    setCurrentFrames((prev) => [...prev, { inputs: { ...inputs }, ticks: pendingTicks }]);
    setPendingTicks(0);
  }

  function captureTestCase() {
    const frames =
      currentFrames.length > 0 || pendingTicks > 0
        ? [...currentFrames, { inputs: { ...inputs }, ticks: pendingTicks }]
        : [{ inputs: { ...inputs }, ticks: 0 }];

    const expect: Record<string, boolean> = {};
    for (const addr of expectAddresses) {
      if (expectChecked[addr]) expect[addr] = readBit(addr, inputs, memory);
    }
    if (Object.keys(expect).length === 0) {
      setSaveError("Check at least one address to include in this test case's expected outcome.");
      return;
    }

    setTestCases((prev) => [...prev, { frames, expect }]);
    setCurrentFrames([]);
    setPendingTicks(0);
    setSaveError(null);
  }

  function removeTestCase(index: number) {
    setTestCases((prev) => prev.filter((_, i) => i !== index));
  }

  function runTest() {
    const spec: LevelSpec = { description, skill, allowedInputs, allowedOutputs, testCases };
    setTestResult(evaluateGridLevel(gridProgram, spec));
  }

  async function save() {
    setSaving(true);
    setSaveError(null);
    try {
      const hints = hintsText
        .split("\n")
        .map((h) => h.trim())
        .filter((h) => h.length > 0);
      const spec: LevelSpec = {
        description,
        skill,
        allowedInputs,
        allowedOutputs,
        testCases,
        hints,
        referenceGridProgram: gridProgram,
      };
      const result = await saveLevelAction({
        levelId: initialLevel?.id,
        levelNumber,
        title,
        optimalBlocksCount: optimalBlocksCount === "" ? null : optimalBlocksCount,
        spec,
      });
      if (result.error) {
        setSaveError(result.error);
      } else {
        router.push("/dashboard/levels");
      }
    } catch (err) {
      console.error("save level failed:", err);
      setSaveError("Something went wrong. Please try again.");
    } finally {
      setSaving(false);
    }
  }

  return (
    <div className="flex flex-col gap-6">
      <div className="grid grid-cols-1 gap-4 rounded-lg border border-zinc-200 bg-white p-4 dark:border-zinc-800 dark:bg-zinc-950 sm:grid-cols-2">
        <label className="flex flex-col gap-1 text-sm">
          <span className="font-medium text-zinc-700 dark:text-zinc-300">Title</span>
          <input
            value={title}
            onChange={(e) => setTitle(e.target.value)}
            className="rounded border border-zinc-300 px-2 py-1.5 dark:border-zinc-700 dark:bg-zinc-900"
          />
        </label>
        <label className="flex flex-col gap-1 text-sm">
          <span className="font-medium text-zinc-700 dark:text-zinc-300">Level number</span>
          <input
            type="number"
            min={1}
            value={levelNumber}
            onChange={(e) => setLevelNumber(Number(e.target.value) || 1)}
            className="rounded border border-zinc-300 px-2 py-1.5 dark:border-zinc-700 dark:bg-zinc-900"
          />
        </label>
        <label className="flex flex-col gap-1 text-sm sm:col-span-2">
          <span className="font-medium text-zinc-700 dark:text-zinc-300">
            Description (scenario text, shown to students)
          </span>
          <textarea
            value={description}
            onChange={(e) => setDescription(e.target.value)}
            rows={3}
            className="rounded border border-zinc-300 px-2 py-1.5 dark:border-zinc-700 dark:bg-zinc-900"
          />
        </label>
        <label className="flex flex-col gap-1 text-sm">
          <span className="font-medium text-zinc-700 dark:text-zinc-300">Skill category</span>
          <select
            value={skill}
            onChange={(e) => setSkill(e.target.value as SkillCategory)}
            className="rounded border border-zinc-300 px-2 py-1.5 dark:border-zinc-700 dark:bg-zinc-900"
          >
            {Object.entries(SKILL_LABELS).map(([value, label]) => (
              <option key={value} value={value}>
                {label}
              </option>
            ))}
          </select>
        </label>
        <label className="flex flex-col gap-1 text-sm">
          <span className="font-medium text-zinc-700 dark:text-zinc-300">
            Optimal block count (for scoring)
          </span>
          <input
            type="number"
            min={1}
            value={optimalBlocksCount}
            onChange={(e) => setOptimalBlocksCount(e.target.value === "" ? "" : Number(e.target.value))}
            className="rounded border border-zinc-300 px-2 py-1.5 dark:border-zinc-700 dark:bg-zinc-900"
          />
        </label>

        <label className="flex flex-col gap-1 text-sm sm:col-span-2">
          <span className="font-medium text-zinc-700 dark:text-zinc-300">
            Hints (one per line, revealed progressively to a stuck student)
          </span>
          <textarea
            value={hintsText}
            onChange={(e) => setHintsText(e.target.value)}
            rows={3}
            className="rounded border border-zinc-300 px-2 py-1.5 dark:border-zinc-700 dark:bg-zinc-900"
          />
        </label>

        <div className="flex flex-col gap-1 text-sm">
          <span className="font-medium text-zinc-700 dark:text-zinc-300">Allowed inputs (informational)</span>
          <div className="flex flex-wrap gap-2">
            {[...INPUT_ADDRESSES, ...pool.customVariables.filter((v) => v.kind === "input").map((v) => v.address)].map((addr) => (
              <label key={addr} className="flex items-center gap-1 text-xs">
                <input
                  type="checkbox"
                  checked={allowedInputs.includes(addr)}
                  onChange={() => toggleInAllowedInputs(addr)}
                />
                {addr}
              </label>
            ))}
          </div>
        </div>
        <div className="flex flex-col gap-1 text-sm">
          <span className="font-medium text-zinc-700 dark:text-zinc-300">Allowed outputs (informational)</span>
          <div className="flex flex-wrap gap-2">
            {[
              ...COIL_ADDRESSES,
              ...pool.customVariables.filter((v) => v.kind === "output" || v.kind === "relay").map((v) => v.address),
            ].map((addr) => (
              <label key={addr} className="flex items-center gap-1 text-xs">
                <input
                  type="checkbox"
                  checked={allowedOutputs.includes(addr)}
                  onChange={() => toggleInAllowedOutputs(addr)}
                />
                {addr}
              </label>
            ))}
          </div>
        </div>
      </div>

      <div>
        <h2 className="mb-2 text-sm font-semibold text-zinc-900 dark:text-zinc-50">
          Reference solution & test case recorder
        </h2>
        <p className="mb-3 text-xs text-zinc-500 dark:text-zinc-400">
          Build a working solution below. Set inputs and Step to advance time,
          click &quot;+ Add frame&quot; to record a step, then &quot;Capture
          test case&quot; to save the current expected outputs. Use Reset to
          start a fresh test case from empty memory.
        </p>

        <GridEditorSurface
          grid={grid}
          pool={pool}
          onStep={recordStep}
          onToggleInput={recordToggleInput}
          onSetInputValue={recordSetInputValue}
          onSetAnalogInput={recordSetAnalogInput}
          onReset={resetRecording}
          banner={
            <div className="rounded-lg border border-purple-200 bg-purple-50 p-3 text-xs text-purple-800 dark:border-purple-900 dark:bg-purple-950 dark:text-purple-300">
              <strong>Reference Solution Editor.</strong> วงจรที่สร้างในนี้คือคำตอบต้นแบบของด่านนี้ - นักเรียนจะไม่เห็นวงจรนี้เลย ใช้ปุ่ม Step/Reset
              ด้านล่างเพื่อบันทึก test case และตรวจสอบว่าโจทย์แก้ได้จริงเท่านั้น
            </div>
          }
        />

        <div className="mt-3 flex flex-wrap items-center gap-3">
          <span className="text-xs text-zinc-500 dark:text-zinc-400">
            Pending ticks this frame: {pendingTicks}
          </span>
          <button
            type="button"
            onClick={addFrame}
            className="rounded-md border border-zinc-300 px-3 py-1.5 text-sm font-medium text-zinc-700 hover:bg-zinc-100 dark:border-zinc-700 dark:text-zinc-300"
          >
            + Add frame
          </button>
        </div>

        <div className="mt-2 text-xs text-zinc-500 dark:text-zinc-400">
          Frames recorded so far: {currentFrames.length}
          {currentFrames.length > 0 &&
            ` (${currentFrames.map((f) => `ticks=${f.ticks}`).join(", ")})`}
        </div>

        {expectAddresses.length > 0 && (
          <div className="mt-3 rounded-lg border border-zinc-200 bg-white p-3 dark:border-zinc-800 dark:bg-zinc-950">
            <p className="mb-2 text-xs font-semibold uppercase tracking-wide text-zinc-500 dark:text-zinc-400">
              Include in expected outcome (current value shown)
            </p>
            <div className="flex flex-wrap gap-3">
              {expectAddresses.map((addr) => (
                <label key={addr} className="flex items-center gap-1 text-xs">
                  <input
                    type="checkbox"
                    checked={expectChecked[addr] ?? false}
                    onChange={(e) =>
                      setExpectChecked((prev) => ({ ...prev, [addr]: e.target.checked }))
                    }
                  />
                  {addr} = {String(readBit(addr, inputs, memory))}
                </label>
              ))}
            </div>
            <button
              type="button"
              onClick={captureTestCase}
              className="mt-3 rounded-md bg-blue-600 px-3 py-1.5 text-sm font-medium text-white hover:bg-blue-700"
            >
              Capture test case
            </button>
          </div>
        )}
      </div>

      <div>
        <h2 className="mb-2 text-sm font-semibold text-zinc-900 dark:text-zinc-50">
          Test cases ({testCases.length})
        </h2>
        <ul className="flex flex-col gap-1">
          {testCases.map((tc, i) => (
            <li
              key={i}
              className="flex items-center justify-between rounded border border-zinc-200 px-3 py-1.5 text-xs dark:border-zinc-800"
            >
              <span>
                Case {i + 1}: {tc.frames.length} frame{tc.frames.length === 1 ? "" : "s"} &rarr; expect{" "}
                {JSON.stringify(tc.expect)}
                {testResult && (
                  <span
                    className={
                      testResult.results[i]?.passed
                        ? "ml-2 font-semibold text-green-600 dark:text-green-400"
                        : "ml-2 font-semibold text-red-600 dark:text-red-400"
                    }
                  >
                    {testResult.results[i]?.passed ? "PASS" : "FAIL"}
                  </span>
                )}
              </span>
              <button
                type="button"
                onClick={() => removeTestCase(i)}
                className="text-red-500 hover:underline"
              >
                Remove
              </button>
            </li>
          ))}
          {testCases.length === 0 && (
            <li className="text-xs text-zinc-400">No test cases yet - capture one above.</li>
          )}
        </ul>

        <div className="mt-3 flex flex-wrap items-center gap-3">
          <button
            type="button"
            onClick={runTest}
            disabled={testCases.length === 0}
            className="rounded-md bg-purple-600 px-4 py-2 text-sm font-medium text-white hover:bg-purple-700 disabled:opacity-60"
          >
            Test Level (run current program against all test cases)
          </button>
          {testResult && (
            <span
              className={`text-sm font-medium ${
                testResult.passed ? "text-green-600 dark:text-green-400" : "text-red-600 dark:text-red-400"
              }`}
            >
              {testResult.passed ? "All test cases pass" : "Some test cases fail"}
            </span>
          )}
        </div>
      </div>

      <div className="flex flex-col gap-2 border-t border-zinc-200 pt-4 dark:border-zinc-800">
        {saveError && <p className="text-sm text-red-600 dark:text-red-400">{saveError}</p>}
        <button
          type="button"
          onClick={save}
          disabled={saving}
          className="w-fit rounded-md bg-green-600 px-4 py-2 text-sm font-medium text-white hover:bg-green-700 disabled:opacity-60"
        >
          {saving ? "Saving..." : initialLevel ? "Save changes" : "Create level"}
        </button>
      </div>
    </div>
  );
}
