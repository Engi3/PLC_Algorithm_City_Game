import Link from "next/link";
import { notFound } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { isLevelSpec, type SkillCategory } from "@/lib/ladder/level-spec";
import LadderPlayground from "@/components/ladder/LadderPlayground";
import { getCurrentProfile } from "@/lib/auth/get-profile";

export default async function LevelPlayPage({
  params,
}: {
  params: Promise<{ levelId: string }>;
}) {
  const { levelId } = await params;
  const profile = await getCurrentProfile();
  const isTeacher = profile?.role === "teacher";

  let title = "Level";
  let description = "";
  let skill: SkillCategory | null = null;
  let hints: string[] = [];
  let prevLevelId: string | null = null;
  let nextLevelId: string | null = null;
  let bestScore: number | null = null;

  try {
    const supabase = await createClient();
    const { data: level, error } = await supabase
      .from("levels")
      .select("id, level_number, title, map_layout_json")
      .eq("id", levelId)
      .single();

    if (error || !level) {
      console.error("LevelPlayPage: level not found", error);
      notFound();
    }

    title = level.title ?? `Level ${level.level_number}`;
    if (isLevelSpec(level.map_layout_json)) {
      description = level.map_layout_json.description;
      skill = level.map_layout_json.skill;
      hints = level.map_layout_json.hints ?? [];
    }

    // Adjacent levels by level_number, for the Prev/Next nav - queried
    // directly rather than loading the full 100-level list.
    const { data: neighbors, error: neighborsError } = await supabase
      .from("levels")
      .select("id, level_number")
      .in("level_number", [level.level_number - 1, level.level_number + 1]);
    if (neighborsError) {
      console.error("LevelPlayPage: failed to load neighboring levels", neighborsError);
    } else {
      prevLevelId = neighbors?.find((n) => n.level_number === level.level_number - 1)?.id ?? null;
      nextLevelId = neighbors?.find((n) => n.level_number === level.level_number + 1)?.id ?? null;
    }

    if (profile) {
      const { data: passedLogs, error: logsError } = await supabase
        .from("play_logs")
        .select("score")
        .eq("user_id", profile.id)
        .eq("level_id", levelId)
        .eq("is_success", true);
      if (logsError) {
        console.error("LevelPlayPage: failed to load play logs", logsError);
      } else if (passedLogs && passedLogs.length > 0) {
        bestScore = Math.max(0, ...passedLogs.map((l) => l.score ?? 0));
      }
    }
  } catch (err) {
    console.error("LevelPlayPage crashed:", err);
    notFound();
  }

  return (
    <div className="flex flex-col gap-4">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <div className="flex flex-wrap items-center gap-2">
          <h1 className="text-2xl font-semibold text-zinc-900 dark:text-zinc-50">{title}</h1>
          {isTeacher && (
            <span className="rounded-full bg-amber-100 px-2 py-0.5 text-xs font-medium text-amber-800 dark:bg-amber-950 dark:text-amber-400">
              โหมดทดสอบอาจารย์ - คะแนนจะไม่ถูกบันทึกในระบบจัดอันดับนักเรียน
            </span>
          )}
          {bestScore !== null && (
            <span className="rounded-full bg-green-100 px-2 py-0.5 text-xs font-medium text-green-800 dark:bg-green-950 dark:text-green-400">
              ผ่านแล้ว - คะแนนสูงสุด: {bestScore} (เล่นซ้ำเพื่อเพิ่มคะแนนได้)
            </span>
          )}
        </div>
        <div className="flex items-center gap-2">
          {prevLevelId ? (
            <Link
              href={`/dashboard/play/${prevLevelId}`}
              className="rounded-md border border-zinc-300 px-3 py-1.5 text-sm font-medium text-zinc-700 hover:bg-zinc-100 dark:border-zinc-700 dark:text-zinc-300 dark:hover:bg-zinc-900"
            >
              ← ด่านก่อนหน้า
            </Link>
          ) : (
            <span className="cursor-not-allowed rounded-md border border-zinc-200 px-3 py-1.5 text-sm font-medium text-zinc-300 dark:border-zinc-800 dark:text-zinc-700">
              ← ด่านก่อนหน้า
            </span>
          )}
          {nextLevelId ? (
            <Link
              href={`/dashboard/play/${nextLevelId}`}
              className="rounded-md border border-zinc-300 px-3 py-1.5 text-sm font-medium text-zinc-700 hover:bg-zinc-100 dark:border-zinc-700 dark:text-zinc-300 dark:hover:bg-zinc-900"
            >
              ด่านถัดไป →
            </Link>
          ) : (
            <span className="cursor-not-allowed rounded-md border border-zinc-200 px-3 py-1.5 text-sm font-medium text-zinc-300 dark:border-zinc-800 dark:text-zinc-700">
              ด่านถัดไป →
            </span>
          )}
        </div>
      </div>
      <LadderPlayground level={{ id: levelId, description, skill, hints }} />
    </div>
  );
}
