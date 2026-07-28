import { notFound } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { isLevelSpec, SKILL_LABELS } from "@/lib/ladder/level-spec";
import LadderPlayground from "@/components/ladder/LadderPlayground";

export default async function LevelPlayPage({
  params,
}: {
  params: Promise<{ levelId: string }>;
}) {
  const { levelId } = await params;

  let title = "Level";
  let description = "";
  let skillLabel = "";
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
      skillLabel = SKILL_LABELS[level.map_layout_json.skill];
      hints = level.map_layout_json.hints ?? [];
    }
  } catch (err) {
    console.error("LevelPlayPage crashed:", err);
    notFound();
  }

  return (
    <div className="flex flex-col gap-4">
      <h1 className="text-2xl font-semibold text-zinc-900 dark:text-zinc-50">{title}</h1>
      <LadderPlayground level={{ id: levelId, description, skillLabel, hints }} />
    </div>
  );
}
