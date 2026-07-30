"use client";

import { useMemo, useState } from "react";
import { useActionState } from "react";
import { useFormStatus } from "react-dom";
import SkillRadarChart from "@/components/analytics/SkillRadarChart";
import CompetencyRadarChart from "@/components/analytics/CompetencyRadarChart";
import MarkdownContent from "@/components/markdown/MarkdownContent";
import { computeSkillScores, type LevelSkillMap, type PlayLogLite } from "@/lib/analytics/skill-radar";
import { computeCompetencyScores, averageCompetencyScores } from "@/lib/analytics/competency";
import { toCsv, downloadCsv } from "@/lib/analytics/csv";
import {
  updatePracticalScoreAction,
  updateCompetencyScoreAction,
  grantBonusCoinsAction,
  type ActionState,
} from "./actions";
import { generateClassInsightsAction } from "./ai-actions";

export type StudentRow = {
  id: string;
  username: string;
  firstName: string | null;
  lastName: string | null;
  studentId: string | null;
  gameLogicScore: number;
  onsitePracticalScore: number | null;
  wiringSkills: number | null;
  debuggingTesting: number | null;
  advancedChallenge: number | null;
  systemControl: number | null;
  levelsPassed: number;
  logs: PlayLogLite[];
};

const initialState: ActionState = { error: null };

function PracticalScoreForm({ studentId, current }: { studentId: string; current: number | null }) {
  const [state, formAction] = useActionState(updatePracticalScoreAction, initialState);
  return (
    <form action={formAction} className="flex items-center gap-1">
      <input type="hidden" name="userId" value={studentId} />
      <input
        type="number"
        name="score"
        min={0}
        max={100}
        defaultValue={current ?? ""}
        placeholder="-"
        className="w-16 rounded border border-zinc-300 px-1.5 py-1 text-xs dark:border-zinc-700 dark:bg-zinc-900"
      />
      <SaveButton />
      {state.error && <span className="text-xs text-red-600 dark:text-red-400">{state.error}</span>}
    </form>
  );
}

function CompetencyScoreForm({
  studentId,
  axis,
  current,
}: {
  studentId: string;
  axis: "wiring_skills" | "debugging_testing" | "advanced_challenge" | "system_control";
  current: number | null;
}) {
  const [state, formAction] = useActionState(updateCompetencyScoreAction, initialState);
  return (
    <form action={formAction} className="flex items-center gap-1">
      <input type="hidden" name="userId" value={studentId} />
      <input type="hidden" name="axis" value={axis} />
      <input
        type="number"
        name="score"
        min={0}
        max={100}
        defaultValue={current ?? ""}
        placeholder="-"
        className="w-16 rounded border border-zinc-300 px-1.5 py-1 text-xs dark:border-zinc-700 dark:bg-zinc-900"
      />
      <SaveButton />
      {state.error && <span className="text-xs text-red-600 dark:text-red-400">{state.error}</span>}
    </form>
  );
}

function SaveButton() {
  const { pending } = useFormStatus();
  return (
    <button
      type="submit"
      disabled={pending}
      className="rounded bg-zinc-700 px-2 py-1 text-xs font-medium text-white hover:bg-zinc-800 disabled:opacity-60"
    >
      {pending ? "..." : "Save"}
    </button>
  );
}

function BonusCoinsForm({ studentId }: { studentId: string }) {
  const [state, formAction] = useActionState(grantBonusCoinsAction, initialState);
  return (
    <form action={formAction} className="flex items-center gap-1">
      <input type="hidden" name="userId" value={studentId} />
      <input
        type="number"
        name="amount"
        min={1}
        max={1000}
        placeholder="10"
        className="w-16 rounded border border-zinc-300 px-1.5 py-1 text-xs dark:border-zinc-700 dark:bg-zinc-900"
      />
      <GrantCoinsButton />
      {state.error && <span className="text-xs text-red-600 dark:text-red-400">{state.error}</span>}
      {state.success && <span className="text-xs text-green-600 dark:text-green-400">{state.success}</span>}
    </form>
  );
}

function GrantCoinsButton() {
  const { pending } = useFormStatus();
  return (
    <button
      type="submit"
      disabled={pending}
      className="rounded bg-amber-500 px-2 py-1 text-xs font-medium text-white hover:bg-amber-600 disabled:opacity-60"
    >
      {pending ? "..." : "มอบเหรียญ"}
    </button>
  );
}

function AiInsightsPanel() {
  const [insights, setInsights] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);

  async function generate() {
    setLoading(true);
    setError(null);
    try {
      const result = await generateClassInsightsAction();
      if ("error" in result && result.error) {
        setError(result.error);
      } else if ("insights" in result && result.insights) {
        setInsights(result.insights);
      }
    } catch (err) {
      console.error("generateClassInsightsAction failed:", err);
      setError("Something went wrong generating insights.");
    } finally {
      setLoading(false);
    }
  }

  return (
    <div className="rounded-lg border border-purple-200 bg-purple-50 p-4 dark:border-purple-900 dark:bg-purple-950">
      <div className="mb-2 flex flex-wrap items-center justify-between gap-2">
        <h2 className="text-sm font-semibold text-purple-900 dark:text-purple-200">AI Insights (Gemini)</h2>
        <button
          type="button"
          onClick={generate}
          disabled={loading}
          className="rounded-md bg-purple-600 px-3 py-1.5 text-sm font-medium text-white hover:bg-purple-700 disabled:opacity-60"
        >
          {loading ? "กำลังวิเคราะห์..." : "วิเคราะห์ภาพรวมชั้นเรียนด้วย AI"}
        </button>
      </div>
      {error && <p className="text-sm text-red-600 dark:text-red-400">{error}</p>}
      {insights && (
        <div className="rounded-md bg-white p-3 dark:bg-zinc-950">
          <MarkdownContent content={insights} />
        </div>
      )}
    </div>
  );
}

export default function AnalyticsClient({
  students,
  levelSkills,
  levelCount,
}: {
  students: StudentRow[];
  levelSkills: LevelSkillMap;
  levelCount: number;
}) {
  const [selected, setSelected] = useState<string>("class-average");

  const classAverageScores = useMemo(
    () => computeSkillScores(students.flatMap((s) => s.logs), levelSkills),
    [students, levelSkills]
  );

  const perStudentCompetency = useMemo(
    () =>
      students.map((s) =>
        computeCompetencyScores(s.logs, levelCount, {
          wiring_skills: s.wiringSkills,
          debugging_testing: s.debuggingTesting,
          advanced_challenge: s.advancedChallenge,
          system_control: s.systemControl,
        })
      ),
    [students, levelCount]
  );
  const classAverageCompetency = useMemo(
    () => averageCompetencyScores(perStudentCompetency),
    [perStudentCompetency]
  );

  const selectedStudent = students.find((s) => s.id === selected);
  const selectedIndex = students.findIndex((s) => s.id === selected);
  const selectedScores = selectedStudent
    ? computeSkillScores(selectedStudent.logs, levelSkills)
    : classAverageScores;
  const selectedCompetencyScores =
    selectedIndex >= 0 ? perStudentCompetency[selectedIndex] : classAverageCompetency;

  function exportCsv() {
    const rows = students.map((s) => ({
      Username: s.username,
      "First name": s.firstName ?? "",
      "Last name": s.lastName ?? "",
      "Student ID": s.studentId ?? "",
      "Game score": s.gameLogicScore,
      "Practical score": s.onsitePracticalScore ?? "",
      "Wiring skills": s.wiringSkills ?? "",
      "Debugging & testing": s.debuggingTesting ?? "",
      "Advanced challenge": s.advancedChallenge ?? "",
      "System control": s.systemControl ?? "",
      "Levels passed": s.levelsPassed,
    }));
    downloadCsv(`student-status-${new Date().toISOString().slice(0, 10)}.csv`, toCsv(rows));
  }

  return (
    <div className="flex flex-col gap-6">
      <AiInsightsPanel />

      <div className="rounded-lg border border-zinc-200 bg-white p-4 dark:border-zinc-800 dark:bg-zinc-950">
        <div className="mb-3 flex items-center justify-between gap-2">
          <select
            value={selected}
            onChange={(e) => setSelected(e.target.value)}
            className="rounded border border-zinc-300 px-2 py-1.5 text-sm dark:border-zinc-700 dark:bg-zinc-900"
          >
            <option value="class-average">Class Average</option>
            {students.map((s) => (
              <option key={s.id} value={s.id}>
                {s.firstName} {s.lastName} ({s.username})
              </option>
            ))}
          </select>
        </div>
        <div className="grid grid-cols-1 gap-4 md:grid-cols-2">
          <div>
            <p className="mb-1 text-center text-xs font-semibold uppercase tracking-wide text-zinc-500 dark:text-zinc-400">
              Skill Breakdown
            </p>
            <SkillRadarChart
              datasets={[
                {
                  label: selectedStudent ? selectedStudent.username : "Class Average",
                  scores: selectedScores,
                  color: "#2563eb",
                },
              ]}
            />
          </div>
          <div>
            <p className="mb-1 text-center text-xs font-semibold uppercase tracking-wide text-zinc-500 dark:text-zinc-400">
              Engineering Competency (6-Axis)
            </p>
            <CompetencyRadarChart
              datasets={[
                {
                  label: selectedStudent ? selectedStudent.username : "Class Average",
                  scores: selectedCompetencyScores,
                  color: "#7c3aed",
                },
              ]}
            />
          </div>
        </div>
      </div>

      <div className="flex items-center justify-between">
        <h2 className="text-sm font-semibold text-zinc-900 dark:text-zinc-50">Student status</h2>
        <button
          type="button"
          onClick={exportCsv}
          className="rounded-md bg-blue-600 px-3 py-1.5 text-sm font-medium text-white hover:bg-blue-700"
        >
          Export to CSV
        </button>
      </div>

      <div className="overflow-x-auto rounded-lg border border-zinc-200 dark:border-zinc-800">
        <table className="w-full min-w-[1320px] text-left text-sm">
          <thead className="bg-zinc-50 text-xs uppercase text-zinc-500 dark:bg-zinc-900 dark:text-zinc-400">
            <tr>
              <th className="px-3 py-2">Name</th>
              <th className="px-3 py-2">Username</th>
              <th className="px-3 py-2">Student ID</th>
              <th className="px-3 py-2">Levels passed</th>
              <th className="px-3 py-2">Game score</th>
              <th className="px-3 py-2">Practical score</th>
              <th className="px-3 py-2">Wiring</th>
              <th className="px-3 py-2">Debugging</th>
              <th className="px-3 py-2">Advanced</th>
              <th className="px-3 py-2">System Ctrl</th>
              <th className="px-3 py-2">Bonus Coins</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-zinc-200 dark:divide-zinc-800">
            {students.map((s) => (
              <tr key={s.id}>
                <td className="px-3 py-2 text-zinc-900 dark:text-zinc-50">
                  {s.firstName} {s.lastName}
                </td>
                <td className="px-3 py-2 font-mono text-xs text-zinc-600 dark:text-zinc-400">
                  {s.username}
                </td>
                <td className="px-3 py-2 text-zinc-600 dark:text-zinc-400">{s.studentId ?? "-"}</td>
                <td className="px-3 py-2 text-zinc-600 dark:text-zinc-400">{s.levelsPassed}</td>
                <td className="px-3 py-2 text-zinc-600 dark:text-zinc-400">{s.gameLogicScore}</td>
                <td className="px-3 py-2">
                  <PracticalScoreForm studentId={s.id} current={s.onsitePracticalScore} />
                </td>
                <td className="px-3 py-2">
                  <CompetencyScoreForm studentId={s.id} axis="wiring_skills" current={s.wiringSkills} />
                </td>
                <td className="px-3 py-2">
                  <CompetencyScoreForm studentId={s.id} axis="debugging_testing" current={s.debuggingTesting} />
                </td>
                <td className="px-3 py-2">
                  <CompetencyScoreForm studentId={s.id} axis="advanced_challenge" current={s.advancedChallenge} />
                </td>
                <td className="px-3 py-2">
                  <CompetencyScoreForm studentId={s.id} axis="system_control" current={s.systemControl} />
                </td>
                <td className="px-3 py-2">
                  <BonusCoinsForm studentId={s.id} />
                </td>
              </tr>
            ))}
            {students.length === 0 && (
              <tr>
                <td colSpan={11} className="px-3 py-6 text-center text-zinc-400">
                  No approved students yet.
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </div>
    </div>
  );
}
