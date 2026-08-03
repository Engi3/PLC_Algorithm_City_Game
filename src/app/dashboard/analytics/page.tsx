import { redirect } from "next/navigation";
import { getCurrentProfile } from "@/lib/auth/get-profile";
import { loadClassData } from "@/lib/analytics/load-class-data";
import type { LevelSkillMap } from "@/lib/analytics/skill-radar";
import AnalyticsClient, { type StudentRow } from "./AnalyticsClient";

export default async function AnalyticsPage() {
  const profile = await getCurrentProfile();
  if (profile?.role !== "teacher") redirect("/dashboard");

  let students: StudentRow[] = [];
  let levelSkills: LevelSkillMap = {};
  let levelCount = 0;
  let challengeIdByLevelId: Record<string, number> = {};
  let challengeCount = 0;
  let gameLevelNumberById: Record<string, number> = {};
  let gameLevelCount = 0;

  try {
    const data = await loadClassData();
    students = data.students;
    levelSkills = data.levelSkills;
    levelCount = data.levelCount;
    challengeIdByLevelId = data.challengeIdByLevelId;
    challengeCount = data.challengeCount;
    gameLevelNumberById = data.gameLevelNumberById;
    gameLevelCount = data.gameLevelCount;
  } catch (err) {
    console.error("AnalyticsPage crashed:", err);
  }

  return (
    <div className="flex flex-col gap-6">
      <div>
        <h1 className="text-2xl font-semibold text-zinc-900 dark:text-zinc-50">
          Analytics & Export
        </h1>
        <p className="mt-1 text-zinc-600 dark:text-zinc-400">
          {students.length} student{students.length === 1 ? "" : "s"} · {levelCount} level
          {levelCount === 1 ? "" : "s"}
        </p>
      </div>
      <AnalyticsClient
        students={students}
        levelSkills={levelSkills}
        levelCount={levelCount}
        challengeIdByLevelId={challengeIdByLevelId}
        challengeCount={challengeCount}
        gameLevelNumberById={gameLevelNumberById}
        gameLevelCount={gameLevelCount}
      />
    </div>
  );
}
