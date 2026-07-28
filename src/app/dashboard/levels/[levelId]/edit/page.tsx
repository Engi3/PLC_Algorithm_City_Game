import { notFound, redirect } from "next/navigation";
import { getCurrentProfile } from "@/lib/auth/get-profile";
import { createClient } from "@/lib/supabase/server";
import { isLevelSpec } from "@/lib/ladder/level-spec";
import LevelAuthoringEditor, { type InitialLevel } from "@/components/ladder/LevelAuthoringEditor";

export default async function EditLevelPage({
  params,
}: {
  params: Promise<{ levelId: string }>;
}) {
  const profile = await getCurrentProfile();
  if (profile?.role !== "teacher") redirect("/dashboard");

  const { levelId } = await params;

  let initialLevel: InitialLevel;
  try {
    const supabase = await createClient();
    const { data: level, error } = await supabase
      .from("levels")
      .select("id, level_number, title, optimal_blocks_count, map_layout_json")
      .eq("id", levelId)
      .single();

    if (error || !level || !isLevelSpec(level.map_layout_json)) {
      console.error("EditLevelPage: level not found or malformed", error);
      notFound();
    }

    initialLevel = {
      id: level.id,
      levelNumber: level.level_number,
      title: level.title ?? "",
      optimalBlocksCount: level.optimal_blocks_count,
      spec: level.map_layout_json,
    };
  } catch (err) {
    console.error("EditLevelPage crashed:", err);
    notFound();
  }

  return (
    <div className="flex flex-col gap-4">
      <h1 className="text-2xl font-semibold text-zinc-900 dark:text-zinc-50">
        Edit Level {initialLevel.levelNumber}
      </h1>
      <LevelAuthoringEditor initialLevel={initialLevel} />
    </div>
  );
}
