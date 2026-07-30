import Link from "next/link";
import { createClient } from "@/lib/supabase/server";
import { getCurrentProfile } from "@/lib/auth/get-profile";
import { SKILL_BADGE_CLASSES, SKILL_LABELS, isLevelSpec } from "@/lib/ladder/level-spec";

type LevelRow = {
  id: string;
  level_number: number;
  title: string | null;
  optimal_blocks_count: number | null;
  map_layout_json: unknown;
};

export default async function LevelListPage() {
  const profile = await getCurrentProfile();

  let levels: LevelRow[] = [];
  let bestScoreByLevel = new Map<string, number>();

  try {
    const supabase = await createClient();
    const { data: levelRows, error: levelsError } = await supabase
      .from("levels")
      .select("id, level_number, title, optimal_blocks_count, map_layout_json")
      .order("level_number", { ascending: true });

    if (levelsError) {
      console.error("LevelListPage: failed to load levels", levelsError);
    } else {
      levels = levelRows ?? [];
    }

    if (profile) {
      const { data: logs, error: logsError } = await supabase
        .from("play_logs")
        .select("level_id, score, is_success")
        .eq("user_id", profile.id)
        .eq("is_success", true);

      if (logsError) {
        console.error("LevelListPage: failed to load play logs", logsError);
      } else {
        for (const log of logs ?? []) {
          const prev = bestScoreByLevel.get(log.level_id) ?? 0;
          bestScoreByLevel.set(log.level_id, Math.max(prev, log.score ?? 0));
        }
      }
    }
  } catch (err) {
    console.error("LevelListPage crashed:", err);
  }

  return (
    <div className="flex flex-col gap-4">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <div>
          <h1 className="text-2xl font-semibold text-zinc-900 dark:text-zinc-50">ด่านทดสอบ (Levels)</h1>
          <p className="mt-1 text-zinc-600 dark:text-zinc-400">
            ทำภารกิจแต่ละด่านให้สำเร็จด้วยการต่อวงจรแลดเดอร์ ยิ่งใช้บล็อกคำสั่งน้อย ยิ่งได้คะแนนสูง
          </p>
        </div>
        <Link
          href="/dashboard/play/sandbox"
          className="rounded-md border border-zinc-300 px-3 py-1.5 text-sm font-medium text-zinc-700 hover:bg-zinc-100 dark:border-zinc-700 dark:text-zinc-300 dark:hover:bg-zinc-900"
        >
          Free sandbox
        </Link>
      </div>

      <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-3">
        {levels.map((level) => {
          const spec = isLevelSpec(level.map_layout_json) ? level.map_layout_json : null;
          const best = bestScoreByLevel.get(level.id);
          return (
            <Link
              key={level.id}
              href={`/dashboard/play/${level.id}`}
              className="flex flex-col gap-2 rounded-lg border border-zinc-200 bg-white p-4 transition-colors hover:border-blue-400 dark:border-zinc-800 dark:bg-zinc-950"
            >
              <div className="flex items-center justify-between">
                <span className="text-xs font-semibold text-zinc-400">
                  Level {level.level_number}
                </span>
                {best !== undefined ? (
                  <span className="rounded-full bg-green-100 px-2 py-0.5 text-xs font-medium text-green-800 dark:bg-green-950 dark:text-green-400">
                    Best: {best}
                  </span>
                ) : (
                  <span className="rounded-full bg-zinc-100 px-2 py-0.5 text-xs font-medium text-zinc-500 dark:bg-zinc-900 dark:text-zinc-400">
                    Not passed
                  </span>
                )}
              </div>
              <h2 className="font-medium text-zinc-900 dark:text-zinc-50">
                {level.title ?? `Level ${level.level_number}`}
              </h2>
              {spec && (
                <>
                  <p className="text-sm text-zinc-600 dark:text-zinc-400">{spec.description}</p>
                  <span
                    className={`w-fit rounded px-2 py-0.5 text-[11px] font-medium ${SKILL_BADGE_CLASSES[spec.skill]}`}
                  >
                    {SKILL_LABELS[spec.skill]}
                  </span>
                </>
              )}
            </Link>
          );
        })}
        {levels.length === 0 && (
          <p className="text-zinc-400">No levels available yet.</p>
        )}
      </div>
    </div>
  );
}
