"use client";

import { useMemo, useState } from "react";
import { computeLeaderboard, type LeaderboardStudent } from "@/lib/analytics/leaderboard";
import { ALL_COMPETENCY_AXES, COMPETENCY_LABELS_TH, type CompetencyAxis } from "@/lib/analytics/competency";

export type LeaderboardStudentRow = LeaderboardStudent;

const MEDALS: Record<number, string> = { 1: "🥇", 2: "🥈", 3: "🥉" };

function RankBadge({ rank }: { rank: number }) {
  const medal = MEDALS[rank];
  if (medal) {
    return <span className="text-lg">{medal}</span>;
  }
  return <span className="font-mono text-sm font-semibold text-zinc-500 dark:text-zinc-400">#{rank}</span>;
}

export default function LeaderboardClient({
  students,
  levelCount,
  challengeCount,
  gameLevelCount,
  currentUserId,
}: {
  students: LeaderboardStudentRow[];
  levelCount: number;
  challengeCount: number;
  gameLevelCount: number;
  currentUserId: string | null;
}) {
  const [classFilter, setClassFilter] = useState<string>("all");
  const [sortKey, setSortKey] = useState<"total" | CompetencyAxis>("total");
  const [search, setSearch] = useState("");

  const classOptions = useMemo(() => {
    const set = new Set<string>();
    for (const s of students) if (s.className) set.add(s.className);
    return [...set].sort();
  }, [students]);

  const filteredStudents = useMemo(() => {
    let list = students;
    if (classFilter !== "all") list = list.filter((s) => s.className === classFilter);
    return list;
  }, [students, classFilter]);

  const ranked = useMemo(
    () => computeLeaderboard(filteredStudents, levelCount, challengeCount, gameLevelCount, sortKey),
    [filteredStudents, levelCount, challengeCount, gameLevelCount, sortKey]
  );

  const visible = useMemo(() => {
    const q = search.trim().toLowerCase();
    if (!q) return ranked;
    return ranked.filter((e) => {
      const name = `${e.firstName ?? ""} ${e.lastName ?? ""}`.toLowerCase();
      return name.includes(q) || e.username.toLowerCase().includes(q) || (e.studentId ?? "").toLowerCase().includes(q);
    });
  }, [ranked, search]);

  return (
    <div className="flex flex-col gap-4">
      <div className="flex flex-wrap items-center gap-3">
        <input
          type="search"
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          placeholder="ค้นหาชื่อหรือรหัสนักเรียน..."
          className="w-full max-w-xs rounded-md border border-zinc-300 px-3 py-2 text-sm dark:border-zinc-700 dark:bg-zinc-900"
        />
        <label className="flex items-center gap-2 text-sm text-zinc-600 dark:text-zinc-400">
          ชั้นเรียน:
          <select
            value={classFilter}
            onChange={(e) => setClassFilter(e.target.value)}
            className="rounded-md border border-zinc-300 px-2 py-1.5 text-sm dark:border-zinc-700 dark:bg-zinc-900"
          >
            <option value="all">ทั้งหมด</option>
            {classOptions.map((c) => (
              <option key={c} value={c}>
                {c}
              </option>
            ))}
          </select>
        </label>
        <label className="flex items-center gap-2 text-sm text-zinc-600 dark:text-zinc-400">
          เรียงตาม:
          <select
            value={sortKey}
            onChange={(e) => setSortKey(e.target.value as "total" | CompetencyAxis)}
            className="rounded-md border border-zinc-300 px-2 py-1.5 text-sm dark:border-zinc-700 dark:bg-zinc-900"
          >
            <option value="total">คะแนนรวมเฉลี่ย (Total Score)</option>
            {ALL_COMPETENCY_AXES.map((axis) => (
              <option key={axis} value={axis}>
                {COMPETENCY_LABELS_TH[axis]}
              </option>
            ))}
          </select>
        </label>
      </div>

      <div className="overflow-x-auto rounded-lg border border-zinc-200 dark:border-zinc-800">
        <table className="w-full min-w-[640px] text-left text-sm">
          <thead className="bg-zinc-50 text-xs uppercase text-zinc-500 dark:bg-zinc-900 dark:text-zinc-400">
            <tr>
              <th className="whitespace-nowrap px-3 py-2">อันดับ</th>
              <th className="whitespace-nowrap px-3 py-2">ชื่อ</th>
              <th className="whitespace-nowrap px-3 py-2">ชั้นเรียน</th>
              <th className="whitespace-nowrap px-3 py-2">
                {sortKey === "total" ? "คะแนนรวมเฉลี่ย" : COMPETENCY_LABELS_TH[sortKey]}
              </th>
              <th className="whitespace-nowrap px-3 py-2">คะแนนรวมเฉลี่ย</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-zinc-200 dark:divide-zinc-800">
            {visible.map((entry) => (
              <tr
                key={entry.id}
                className={entry.id === currentUserId ? "bg-blue-50 dark:bg-blue-950/40" : undefined}
              >
                <td className="whitespace-nowrap px-3 py-2">
                  <RankBadge rank={entry.rank} />
                </td>
                <td className="whitespace-nowrap px-3 py-2 text-zinc-900 dark:text-zinc-50">
                  {entry.firstName} {entry.lastName}{" "}
                  {entry.id === currentUserId && (
                    <span className="ml-1 rounded-full bg-blue-600 px-1.5 py-0.5 text-[10px] font-medium text-white">คุณ</span>
                  )}
                  <span className="ml-1 font-mono text-xs text-zinc-500 dark:text-zinc-400">({entry.username})</span>
                </td>
                <td className="whitespace-nowrap px-3 py-2 text-zinc-600 dark:text-zinc-400">{entry.className ?? "-"}</td>
                <td className="whitespace-nowrap px-3 py-2 font-semibold text-zinc-900 dark:text-zinc-50">
                  {sortKey === "total" ? entry.totalScore : entry.competencyScores[sortKey]}
                </td>
                <td className="whitespace-nowrap px-3 py-2 text-zinc-600 dark:text-zinc-400">{entry.totalScore}</td>
              </tr>
            ))}
            {visible.length === 0 && (
              <tr>
                <td colSpan={5} className="px-3 py-6 text-center text-zinc-400">
                  ยังไม่มีข้อมูลนักเรียนที่ตรงเงื่อนไข
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </div>
    </div>
  );
}
