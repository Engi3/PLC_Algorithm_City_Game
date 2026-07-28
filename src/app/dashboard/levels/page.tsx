import Link from "next/link";
import { redirect } from "next/navigation";
import { getCurrentProfile } from "@/lib/auth/get-profile";
import { createClient } from "@/lib/supabase/server";
import { isLevelSpec, SKILL_LABELS } from "@/lib/ladder/level-spec";

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
      <div>
        <h1 className="text-2xl font-semibold text-zinc-900 dark:text-zinc-50">Levels</h1>
        <p className="mt-2 text-zinc-600 dark:text-zinc-400">
          Read-only for now - full authoring (creating/editing levels from
          the dashboard) is a later addition. Levels are currently seeded via
          SQL. Try the builder itself in the{" "}
          <Link href="/dashboard/play/sandbox" className="text-blue-600 hover:underline dark:text-blue-400">
            ladder sandbox
          </Link>
          .
        </p>
      </div>

      <div className="overflow-x-auto rounded-lg border border-zinc-200 dark:border-zinc-800">
        <table className="w-full min-w-[600px] text-left text-sm">
          <thead className="bg-zinc-50 text-xs uppercase text-zinc-500 dark:bg-zinc-900 dark:text-zinc-400">
            <tr>
              <th className="px-3 py-2">#</th>
              <th className="px-3 py-2">Title</th>
              <th className="px-3 py-2">Skill</th>
              <th className="px-3 py-2">Optimal blocks</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-zinc-200 dark:divide-zinc-800">
            {levels.map((l) => {
              const spec = isLevelSpec(l.map_layout_json) ? l.map_layout_json : null;
              return (
                <tr key={l.id}>
                  <td className="px-3 py-2 text-zinc-600 dark:text-zinc-400">{l.level_number}</td>
                  <td className="px-3 py-2 text-zinc-900 dark:text-zinc-50">
                    {l.title ?? `Level ${l.level_number}`}
                  </td>
                  <td className="px-3 py-2 text-zinc-600 dark:text-zinc-400">
                    {spec ? SKILL_LABELS[spec.skill] : "-"}
                  </td>
                  <td className="px-3 py-2 text-zinc-600 dark:text-zinc-400">
                    {l.optimal_blocks_count ?? "-"}
                  </td>
                </tr>
              );
            })}
            {levels.length === 0 && (
              <tr>
                <td colSpan={4} className="px-3 py-6 text-center text-zinc-400">
                  No levels seeded yet.
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </div>
    </div>
  );
}
