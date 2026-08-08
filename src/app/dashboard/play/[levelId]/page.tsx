import { notFound, redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { isLevelSpec, type SkillCategory } from "@/lib/ladder/level-spec";
import GridLadderPlayground from "@/components/ladder/GridLadderPlayground";
import PrevNextNav, { type NavTarget } from "@/components/ladder/PrevNextNav";
import { getCurrentProfile } from "@/lib/auth/get-profile";
import { bypassesLevelLock, computeUnlockedLevelNumber } from "@/lib/ladder/level-unlock";

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
  let totalLevels: number | null = null;
  let levelNumber = 0;
  let shouldRedirectToLevelList = false;

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
    levelNumber = level.level_number;
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

    const { count: totalCount, error: totalCountError } = await supabase
      .from("levels")
      .select("id", { count: "exact", head: true });
    if (totalCountError) console.error("LevelPlayPage: failed to count levels", totalCountError);
    else totalLevels = totalCount;

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

      if (!bypassesLevelLock(profile.role)) {
        const unlockedLevelNumber = await computeUnlockedLevelNumber(profile.id);
        if (levelNumber > unlockedLevelNumber) shouldRedirectToLevelList = true;
      }
    }
  } catch (err) {
    console.error("LevelPlayPage crashed:", err);
    notFound();
  }

  // redirect() throws internally (by design) - it must happen outside the
  // try/catch above, otherwise the generic catch there would swallow it
  // and turn it into a 404 instead of an actual redirect.
  if (shouldRedirectToLevelList) redirect("/dashboard/play");

  const prevNav: NavTarget = prevLevelId ? { kind: "link", href: `/dashboard/play/${prevLevelId}` } : { kind: "none" };
  const nextNav: NavTarget = nextLevelId ? { kind: "link", href: `/dashboard/play/${nextLevelId}` } : { kind: "none" };

  return (
    <div className="flex flex-col gap-4">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <div className="flex flex-wrap items-center gap-2">
          <h1 className="text-2xl font-semibold text-zinc-900 dark:text-zinc-50">{title}</h1>
          {totalLevels !== null && (
            <span className="rounded-full bg-blue-100 px-2 py-0.5 text-xs font-medium text-blue-800 dark:bg-blue-950 dark:text-blue-400">
              Level {levelNumber} / {totalLevels}
            </span>
          )}
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
        <PrevNextNav prev={prevNav} next={nextNav} prevLabel="← ด่านก่อนหน้า" nextLabel="ด่านถัดไป →" />
      </div>
      <GridLadderPlayground level={{ id: levelId, description, skill, hints }} />
      <div className="flex justify-end border-t border-zinc-200 pt-4 dark:border-zinc-800">
        <PrevNextNav prev={prevNav} next={nextNav} prevLabel="← ด่านก่อนหน้า" nextLabel="ด่านถัดไป →" />
      </div>
    </div>
  );
}
