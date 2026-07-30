import Link from "next/link";
import { redirect } from "next/navigation";
import { getCurrentProfile } from "@/lib/auth/get-profile";
import { createClient } from "@/lib/supabase/server";
import { isLevelSpec, SKILL_BADGE_CLASSES, SKILL_LABELS } from "@/lib/ladder/level-spec";
import DeleteLevelButton from "./DeleteLevelButton";

export default async function LevelsPage() {
  const profile = await getCurrentProfile();
  if (profile?.role !== "teacher") redirect("/dashboard");

  type LevelRow = {
    id: string;
    level_number: number;
    title: string | null;
    optimal_blocks_count: number | null;
    map_layout_json: unknown;
  };
  let levels: LevelRow[] = [];

  try {
    const supabase = await createClient();
    const { data, error } = await supabase
      .from("levels")
      .select("id, level_number, title, optimal_blocks_count, map_layout_json")
      .order("level_number", { ascending: true });
    if (error) {
      console.error("LevelsPage: failed to load levels", error);
    } else {
      levels = data ?? [];
    }
  } catch (err) {
    console.error("LevelsPage crashed:", err);
  }

  return (
    <div className="flex flex-col gap-4">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <div>
          <h1 className="text-2xl font-semibold text-zinc-900 dark:text-zinc-50">Levels</h1>
          <p className="mt-1 text-zinc-600 dark:text-zinc-400">
            Create and edit levels here, or try the builder in the{" "}
            <Link href="/dashboard/play/sandbox" className="text-blue-600 hover:underline dark:text-blue-400">
              ladder sandbox
            </Link>
            .
          </p>
        </div>
        <Link
          href="/dashboard/levels/new"
          className="rounded-md bg-blue-600 px-3 py-1.5 text-sm font-medium text-white hover:bg-blue-700"
        >
          + Create Level
        </Link>
      </div>

      <div className="overflow-x-auto rounded-lg border border-zinc-200 dark:border-zinc-800">
        <table className="w-full min-w-[680px] text-left text-sm">
          <thead className="bg-zinc-50 text-xs uppercase text-zinc-500 dark:bg-zinc-900 dark:text-zinc-400">
            <tr>
              <th className="px-3 py-2">#</th>
              <th className="px-3 py-2">Title</th>
              <th className="px-3 py-2">Skill</th>
              <th className="px-3 py-2">Optimal blocks</th>
              <th className="px-3 py-2">Actions</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-zinc-200 dark:divide-zinc-800">
            {levels.map((l) => {
              const spec = isLevelSpec(l.map_layout_json) ? l.map_layout_json : null;
              const title = l.title ?? `Level ${l.level_number}`;
              return (
                <tr key={l.id}>
                  <td className="px-3 py-2 text-zinc-600 dark:text-zinc-400">{l.level_number}</td>
                  <td className="px-3 py-2 text-zinc-900 dark:text-zinc-50">{title}</td>
                  <td className="px-3 py-2">
                    {spec ? (
                      <span
                        className={`w-fit rounded px-2 py-0.5 text-[11px] font-medium ${SKILL_BADGE_CLASSES[spec.skill]}`}
                      >
                        {SKILL_LABELS[spec.skill]}
                      </span>
                    ) : (
                      <span className="text-zinc-400">-</span>
                    )}
                  </td>
                  <td className="px-3 py-2 text-zinc-600 dark:text-zinc-400">
                    {l.optimal_blocks_count ?? "-"}
                  </td>
                  <td className="px-3 py-2">
                    <div className="flex items-center gap-3">
                      <Link
                        href={`/dashboard/levels/${l.id}/edit`}
                        className="text-xs font-medium text-blue-600 hover:underline dark:text-blue-400"
                      >
                        Edit
                      </Link>
                      <DeleteLevelButton levelId={l.id} title={title} />
                    </div>
                  </td>
                </tr>
              );
            })}
            {levels.length === 0 && (
              <tr>
                <td colSpan={5} className="px-3 py-6 text-center text-zinc-400">
                  No levels yet.
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </div>
    </div>
  );
}
