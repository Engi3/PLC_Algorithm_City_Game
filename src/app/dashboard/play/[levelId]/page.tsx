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
  } catch (err) {
    console.error("LevelPlayPage crashed:", err);
    notFound();
  }

  return (
    <div className="flex flex-col gap-4">
      <div className="flex flex-wrap items-center gap-2">
        <h1 className="text-2xl font-semibold text-zinc-900 dark:text-zinc-50">{title}</h1>
        {isTeacher && (
          <span className="rounded-full bg-amber-100 px-2 py-0.5 text-xs font-medium text-amber-800 dark:bg-amber-950 dark:text-amber-400">
            โหมดทดสอบอาจารย์ - คะแนนจะไม่ถูกบันทึกในระบบจัดอันดับนักเรียน
          </span>
        )}
      </div>
      <LadderPlayground level={{ id: levelId, description, skill, hints }} />
    </div>
  );
}
