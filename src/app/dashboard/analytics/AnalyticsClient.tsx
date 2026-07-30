"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { useActionState } from "react";
import { useFormStatus } from "react-dom";
import SkillRadarChart from "@/components/analytics/SkillRadarChart";
import CompetencyRadarChart from "@/components/analytics/CompetencyRadarChart";
import MarkdownContent from "@/components/markdown/MarkdownContent";
import { computeSkillScores, type LevelSkillMap, type PlayLogLite } from "@/lib/analytics/skill-radar";
import {
  computeCompetencyScores,
  averageCompetencyScores,
  ALL_COMPETENCY_AXES,
  type CompetencyScores,
} from "@/lib/analytics/competency";
import { toCsv, downloadCsv } from "@/lib/analytics/csv";
import {
  updatePracticalScoreAction,
  updateCompetencyScoreAction,
  grantBonusCoinsAction,
  getStudentAiEvaluationsAction,
  type ActionState,
  type StudentAiEvaluation,
} from "./actions";
import { generateClassInsightsAction } from "./ai-actions";
import { CERTIFICATE_THRESHOLD } from "@/lib/certificate/threshold";

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
        className="w-12 rounded border border-zinc-300 px-1 py-1 text-xs dark:border-zinc-700 dark:bg-zinc-900"
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
        className="w-12 rounded border border-zinc-300 px-1 py-1 text-xs dark:border-zinc-700 dark:bg-zinc-900"
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
        className="w-14 rounded border border-zinc-300 px-1 py-1 text-xs dark:border-zinc-700 dark:bg-zinc-900"
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
  const [source, setSource] = useState<"ai" | "fallback" | null>(null);
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
        setSource(result.source);
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
          {source === "fallback" && (
            <p className="mt-2 text-xs text-zinc-400 dark:text-zinc-500">
              (สรุปเบื้องต้นจากข้อมูลดิบ - ไม่สามารถเชื่อมต่อ AI ได้ในขณะนี้)
            </p>
          )}
        </div>
      )}
    </div>
  );
}

function EvaluationCard({ evaluation }: { evaluation: StudentAiEvaluation }) {
  return (
    <div className="rounded-md border border-zinc-200 p-2.5 text-xs dark:border-zinc-800">
      <div className="mb-1 flex flex-wrap items-center justify-between gap-1">
        <span className="font-medium text-zinc-900 dark:text-zinc-50">
          ด่าน {evaluation.levelNumber}: {evaluation.levelTitle}
        </span>
        <span className="text-zinc-400">{new Date(evaluation.createdAt).toLocaleString("th-TH")}</span>
      </div>
      <div className="mb-1 flex flex-wrap gap-3 text-zinc-600 dark:text-zinc-400">
        <span>ถูกต้อง: {evaluation.correctness}</span>
        <span>กระชับ: {evaluation.conciseness}</span>
        <span>ปลอดภัย: {evaluation.safety}</span>
        {evaluation.coinsAwarded > 0 && (
          <span className="font-medium text-amber-600 dark:text-amber-400">+{evaluation.coinsAwarded} coins</span>
        )}
      </div>
      <p className="text-zinc-700 dark:text-zinc-300">{evaluation.feedback}</p>
    </div>
  );
}

/** Phase 15: click-to-open drill-down with a student's full radar, teacher-graded score forms, and AI evaluation history. */
function StudentDrillDownModal({
  student,
  competencyScores,
  onClose,
}: {
  student: StudentRow;
  competencyScores: CompetencyScores;
  onClose: () => void;
}) {
  const [evaluations, setEvaluations] = useState<StudentAiEvaluation[] | null>(null);
  const [evalError, setEvalError] = useState<string | null>(null);
  const [loadingEvals, setLoadingEvals] = useState(true);
  const requested = useRef(false);

  useEffect(() => {
    if (requested.current) return;
    requested.current = true;
    (async () => {
      try {
        const result = await getStudentAiEvaluationsAction(student.id);
        if ("error" in result) setEvalError(result.error);
        else setEvaluations(result.evaluations);
      } catch (err) {
        console.error("getStudentAiEvaluationsAction failed:", err);
        setEvalError("เกิดข้อผิดพลาด กรุณาลองใหม่ภายหลัง");
      } finally {
        setLoadingEvals(false);
      }
    })();
  }, [student.id]);

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4" onClick={onClose}>
      <div
        className="flex max-h-[90vh] w-full max-w-2xl flex-col gap-4 overflow-y-auto rounded-lg bg-white p-5 shadow-xl dark:bg-zinc-950"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="flex items-center justify-between">
          <h3 className="text-sm font-semibold text-zinc-900 dark:text-zinc-50">
            {student.firstName} {student.lastName}{" "}
            <span className="font-mono text-xs font-normal text-zinc-400">({student.username})</span>
          </h3>
          <button
            type="button"
            onClick={onClose}
            aria-label="Close"
            className="text-zinc-400 hover:text-zinc-600 dark:hover:text-zinc-200"
          >
            x
          </button>
        </div>

        <div className="mx-auto w-full max-w-xs">
          <CompetencyRadarChart
            datasets={[{ label: student.username, scores: competencyScores, color: "#7c3aed" }]}
          />
        </div>

        <div>
          <p className="mb-2 text-xs font-semibold uppercase tracking-wide text-zinc-500 dark:text-zinc-400">
            ให้คะแนน (Teacher-graded)
          </p>
          <div className="grid grid-cols-2 gap-3 sm:grid-cols-3">
            <div className="flex flex-col gap-1">
              <span className="text-xs text-zinc-500 dark:text-zinc-400">Practical</span>
              <PracticalScoreForm studentId={student.id} current={student.onsitePracticalScore} />
            </div>
            <div className="flex flex-col gap-1">
              <span className="text-xs text-zinc-500 dark:text-zinc-400">Wiring</span>
              <CompetencyScoreForm studentId={student.id} axis="wiring_skills" current={student.wiringSkills} />
            </div>
            <div className="flex flex-col gap-1">
              <span className="text-xs text-zinc-500 dark:text-zinc-400">Debugging</span>
              <CompetencyScoreForm
                studentId={student.id}
                axis="debugging_testing"
                current={student.debuggingTesting}
              />
            </div>
            <div className="flex flex-col gap-1">
              <span className="text-xs text-zinc-500 dark:text-zinc-400">Advanced</span>
              <CompetencyScoreForm
                studentId={student.id}
                axis="advanced_challenge"
                current={student.advancedChallenge}
              />
            </div>
            <div className="flex flex-col gap-1">
              <span className="text-xs text-zinc-500 dark:text-zinc-400">System</span>
              <CompetencyScoreForm studentId={student.id} axis="system_control" current={student.systemControl} />
            </div>
          </div>
        </div>

        <div>
          <p className="mb-2 text-xs font-semibold uppercase tracking-wide text-zinc-500 dark:text-zinc-400">
            ประวัติการประเมินจาก AI (AI Evaluation Logs)
          </p>
          {loadingEvals && <p className="text-xs text-zinc-400">กำลังโหลด...</p>}
          {evalError && <p className="text-xs text-red-600 dark:text-red-400">{evalError}</p>}
          {evaluations && evaluations.length === 0 && (
            <p className="text-xs text-zinc-400">ยังไม่มีประวัติการขอรีวิวจาก AI</p>
          )}
          {evaluations && evaluations.length > 0 && (
            <div className="flex flex-col gap-2">
              {evaluations.map((e) => (
                <EvaluationCard key={e.id} evaluation={e} />
              ))}
            </div>
          )}
        </div>
      </div>
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
  const [drillDownId, setDrillDownId] = useState<string | null>(null);

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

  const totalSubmissions = useMemo(() => students.reduce((sum, s) => sum + s.logs.length, 0), [students]);
  const activeStudents = useMemo(() => students.filter((s) => s.logs.length > 0).length, [students]);
  const competencyPassRate = useMemo(() => {
    if (perStudentCompetency.length === 0) return 0;
    let passed = 0;
    const total = perStudentCompetency.length * ALL_COMPETENCY_AXES.length;
    for (const scores of perStudentCompetency) {
      for (const axis of ALL_COMPETENCY_AXES) {
        if (scores[axis] >= CERTIFICATE_THRESHOLD) passed += 1;
      }
    }
    return total > 0 ? Math.round((passed / total) * 100) : 0;
  }, [perStudentCompetency]);

  const drillDownIndex = students.findIndex((s) => s.id === drillDownId);
  const drillDownStudent = drillDownIndex >= 0 ? students[drillDownIndex] : null;

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

      <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
        <div className="rounded-lg border border-zinc-200 bg-white p-3 text-center dark:border-zinc-800 dark:bg-zinc-950">
          <p className="text-2xl font-semibold text-zinc-900 dark:text-zinc-50">{students.length}</p>
          <p className="text-xs text-zinc-500 dark:text-zinc-400">Total Students</p>
        </div>
        <div className="rounded-lg border border-zinc-200 bg-white p-3 text-center dark:border-zinc-800 dark:bg-zinc-950">
          <p className="text-2xl font-semibold text-zinc-900 dark:text-zinc-50">{activeStudents}</p>
          <p className="text-xs text-zinc-500 dark:text-zinc-400">Active Students</p>
        </div>
        <div className="rounded-lg border border-zinc-200 bg-white p-3 text-center dark:border-zinc-800 dark:bg-zinc-950">
          <p className="text-2xl font-semibold text-zinc-900 dark:text-zinc-50">{totalSubmissions}</p>
          <p className="text-xs text-zinc-500 dark:text-zinc-400">Total Submissions</p>
        </div>
        <div className="rounded-lg border border-zinc-200 bg-white p-3 text-center dark:border-zinc-800 dark:bg-zinc-950">
          <p className="text-2xl font-semibold text-zinc-900 dark:text-zinc-50">{competencyPassRate}%</p>
          <p className="text-xs text-zinc-500 dark:text-zinc-400">Competency Pass Rate (≥{CERTIFICATE_THRESHOLD})</p>
        </div>
      </div>

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
        <table className="w-full text-left text-sm">
          <thead className="bg-zinc-50 text-xs uppercase text-zinc-500 dark:bg-zinc-900 dark:text-zinc-400">
            <tr>
              <th className="whitespace-nowrap px-2 py-2">Name</th>
              <th className="whitespace-nowrap px-2 py-2">Username</th>
              <th className="whitespace-nowrap px-2 py-2">Student ID</th>
              <th className="whitespace-nowrap px-2 py-2">Levels</th>
              <th className="whitespace-nowrap px-2 py-2">Game score</th>
              <th className="whitespace-nowrap px-2 py-2">Practical</th>
              <th className="whitespace-nowrap px-2 py-2">Wiring</th>
              <th className="whitespace-nowrap px-2 py-2">Debugging</th>
              <th className="whitespace-nowrap px-2 py-2">Advanced</th>
              <th className="whitespace-nowrap px-2 py-2">System</th>
              <th className="whitespace-nowrap px-2 py-2">Bonus Coins</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-zinc-200 dark:divide-zinc-800">
            {students.map((s) => (
              <tr key={s.id}>
                <td className="whitespace-nowrap px-2 py-2">
                  <button
                    type="button"
                    onClick={() => setDrillDownId(s.id)}
                    title="ดูรายละเอียดนักเรียน (Click to view details)"
                    className="text-zinc-900 hover:text-blue-600 hover:underline dark:text-zinc-50 dark:hover:text-blue-400"
                  >
                    {s.firstName} {s.lastName}
                  </button>
                </td>
                <td className="whitespace-nowrap px-2 py-2 font-mono text-xs text-zinc-600 dark:text-zinc-400">
                  {s.username}
                </td>
                <td className="whitespace-nowrap px-2 py-2 text-zinc-600 dark:text-zinc-400">{s.studentId ?? "-"}</td>
                <td className="whitespace-nowrap px-2 py-2 text-zinc-600 dark:text-zinc-400">{s.levelsPassed}</td>
                <td className="whitespace-nowrap px-2 py-2 text-zinc-600 dark:text-zinc-400">{s.gameLogicScore}</td>
                <td className="px-2 py-2">
                  <PracticalScoreForm studentId={s.id} current={s.onsitePracticalScore} />
                </td>
                <td className="px-2 py-2">
                  <CompetencyScoreForm studentId={s.id} axis="wiring_skills" current={s.wiringSkills} />
                </td>
                <td className="px-2 py-2">
                  <CompetencyScoreForm studentId={s.id} axis="debugging_testing" current={s.debuggingTesting} />
                </td>
                <td className="px-2 py-2">
                  <CompetencyScoreForm studentId={s.id} axis="advanced_challenge" current={s.advancedChallenge} />
                </td>
                <td className="px-2 py-2">
                  <CompetencyScoreForm studentId={s.id} axis="system_control" current={s.systemControl} />
                </td>
                <td className="px-2 py-2">
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

      {drillDownStudent && (
        <StudentDrillDownModal
          student={drillDownStudent}
          competencyScores={perStudentCompetency[drillDownIndex]}
          onClose={() => setDrillDownId(null)}
        />
      )}
    </div>
  );
}
