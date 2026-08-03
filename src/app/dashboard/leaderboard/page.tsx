import { getCurrentProfile } from "@/lib/auth/get-profile";
import { loadClassData } from "@/lib/analytics/load-class-data";
import LeaderboardClient, { type LeaderboardStudentRow } from "./LeaderboardClient";

export default async function LeaderboardPage() {
  const profile = await getCurrentProfile();

  let students: LeaderboardStudentRow[] = [];
  let levelCount = 0;
  let challengeCount = 0;
  let gameLevelCount = 0;

  try {
    const data = await loadClassData();
    students = data.students;
    levelCount = data.levelCount;
    challengeCount = data.challengeCount;
    gameLevelCount = data.gameLevelCount;
  } catch (err) {
    console.error("LeaderboardPage crashed:", err);
  }

  return (
    <div className="flex flex-col gap-6">
      <div>
        <h1 className="text-2xl font-semibold text-zinc-900 dark:text-zinc-50">🏆 อันดับผู้เล่น (Leaderboard)</h1>
        <p className="mt-1 text-zinc-600 dark:text-zinc-400">
          จัดอันดับจากคะแนนสมรรถนะเฉลี่ยทั้ง 6 ด้าน - กรองตามชั้นเรียนหรือเรียงตามด้านที่สนใจได้
        </p>
      </div>
      <LeaderboardClient
        students={students}
        levelCount={levelCount}
        challengeCount={challengeCount}
        gameLevelCount={gameLevelCount}
        currentUserId={profile?.id ?? null}
      />
    </div>
  );
}
