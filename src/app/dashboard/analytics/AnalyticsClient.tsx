"use client";

import { useMemo, useState } from "react";
import { useActionState } from "react";
import { useFormStatus } from "react-dom";
import SkillRadarChart from "@/components/analytics/SkillRadarChart";
import { computeSkillScores, type LevelSkillMap, type PlayLogLite } from "@/lib/analytics/skill-radar";
import { toCsv, downloadCsv } from "@/lib/analytics/csv";
import { updatePracticalScoreAction, type ActionState } from "./actions";

export type StudentRow = {
  id: string;
  username: string;
  firstName: string | null;
  lastName: string | null;
  studentId: string | null;
  gameLogicScore: number;
  onsitePracticalScore: number | null;
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

export default function AnalyticsClient({
  students,
  levelSkills,
}: {
  students: StudentRow[];
  levelSkills: LevelSkillMap;
}) {
  const [selected, setSelected] = useState<string>("class-average");

  const classAverageScores = useMemo(
    () => computeSkillScores(students.flatMap((s) => s.logs), levelSkills),
    [students, levelSkills]
  );

  const selectedStudent = students.find((s) => s.id === selected);
  const selectedScores = selectedStudent
    ? computeSkillScores(selectedStudent.logs, levelSkills)
    : classAverageScores;

  function exportCsv() {
    const rows = students.map((s) => ({
      Username: s.username,
      "First name": s.firstName ?? "",
      "Last name": s.lastName ?? "",
      "Student ID": s.studentId ?? "",
      "Game score": s.gameLogicScore,
      "Practical score": s.onsitePracticalScore ?? "",
      "Levels passed": s.levelsPassed,
    }));
    downloadCsv(`student-status-${new Date().toISOString().slice(0, 10)}.csv`, toCsv(rows));
  }

  return (
    <div className="flex flex-col gap-6">
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
        <table className="w-full min-w-[720px] text-left text-sm">
          <thead className="bg-zinc-50 text-xs uppercase text-zinc-500 dark:bg-zinc-900 dark:text-zinc-400">
            <tr>
              <th className="px-3 py-2">Name</th>
              <th className="px-3 py-2">Username</th>
              <th className="px-3 py-2">Student ID</th>
              <th className="px-3 py-2">Levels passed</th>
              <th className="px-3 py-2">Game score</th>
              <th className="px-3 py-2">Practical score</th>
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
              </tr>
            ))}
            {students.length === 0 && (
              <tr>
                <td colSpan={6} className="px-3 py-6 text-center text-zinc-400">
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
