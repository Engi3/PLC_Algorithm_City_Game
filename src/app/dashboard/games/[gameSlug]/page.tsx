import Link from "next/link";
import { notFound } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { getCurrentProfile } from "@/lib/auth/get-profile";
import { chaptersForGameSlug, type GameType } from "@/lib/games/game-level-types";

type GameRow = { id: string; slug: string; title_th: string; title_en: string; icon: string };
type GameLevelRow = { id: string; level_number: number; game_type: GameType; title: string };

const GAME_TYPE_BADGE: Record<GameType, string> = {
  MAZE: "bg-blue-100 text-blue-700 dark:bg-blue-950 dark:text-blue-300",
  FACTORY: "bg-orange-100 text-orange-700 dark:bg-orange-950 dark:text-orange-300",
  HYBRID: "bg-purple-100 text-purple-700 dark:bg-purple-950 dark:text-purple-300",
};
const GAME_TYPE_LABEL: Record<GameType, string> = { MAZE: "🤖 Maze", FACTORY: "🏭 Factory", HYBRID: "⚡ Hybrid" };

export default async function GameLevelListPage({ params }: { params: Promise<{ gameSlug: string }> }) {
  const { gameSlug } = await params;
  const profile = await getCurrentProfile();

  let game: GameRow | null = null;
  let levels: GameLevelRow[] = [];
  const passedIds = new Set<string>();

  try {
    const supabase = await createClient();
    const { data: gameRow, error: gameError } = await supabase
      .from("games")
      .select("id, slug, title_th, title_en, icon")
      .eq("slug", gameSlug)
      .maybeSingle();
    if (gameError) console.error("GameLevelListPage: failed to load game", gameError);
    if (!gameRow) notFound();
    game = gameRow;

    const { data, error } = await supabase
      .from("game_levels")
      .select("id, level_number, game_type, title")
      .eq("game_id", game.id)
      .order("level_number", { ascending: true });
    if (error) console.error("GameLevelListPage: failed to load game_levels", error);
    else levels = data ?? [];

    if (profile) {
      const { data: logs, error: logsError } = await supabase
        .from("game_play_logs")
        .select("game_level_id")
        .eq("user_id", profile.id)
        .eq("is_success", true);
      if (logsError) console.error("GameLevelListPage: failed to load game_play_logs", logsError);
      else for (const log of logs ?? []) passedIds.add(log.game_level_id);
    }
  } catch (err) {
    console.error("GameLevelListPage crashed:", err);
    notFound();
  }

  if (!game) notFound();

  const totalPassed = levels.filter((l) => passedIds.has(l.id)).length;

  return (
    <div className="flex flex-col gap-6">
      <div>
        <Link href="/dashboard/games" className="text-xs font-medium text-zinc-500 hover:text-blue-600 hover:underline dark:text-zinc-400 dark:hover:text-blue-400">
          ← กลับไปที่ Game Mode
        </Link>
      </div>

      <div className="flex flex-wrap items-center justify-between gap-3 rounded-lg border border-zinc-800 bg-zinc-900 px-5 py-4 text-white">
        <div>
          <p className="font-mono text-[11px] uppercase tracking-widest text-emerald-400">
            {game.icon} {game.title_en}
          </p>
          <h1 className="mt-1 text-2xl font-semibold">{levels.length} ด่าน{game.title_th}</h1>
        </div>
        <div className="rounded-md border border-zinc-700 bg-zinc-950 px-4 py-2 text-center">
          <p className="font-mono text-2xl font-semibold text-emerald-400">
            {totalPassed}/{levels.length}
          </p>
          <p className="text-[11px] uppercase tracking-wide text-zinc-400">ผ่านแล้ว</p>
        </div>
      </div>

      {levels.length === 0 && <p className="text-zinc-400">ยังไม่มีด่านในเกมนี้</p>}

      {chaptersForGameSlug(gameSlug).map((chapter) => {
        const chapterLevels = levels.filter((l) => l.level_number >= chapter.levelRange[0] && l.level_number <= chapter.levelRange[1]);
        if (chapterLevels.length === 0) return null;
        const chapterPassed = chapterLevels.filter((l) => passedIds.has(l.id)).length;

        return (
          <div key={chapter.chapterNumber} className="flex flex-col gap-3">
            <div className="flex flex-wrap items-center justify-between gap-2 rounded-md bg-zinc-800 px-4 py-2.5 text-white">
              <div className="flex items-center gap-3">
                <span className="rounded border border-emerald-500/50 bg-emerald-500/10 px-2 py-0.5 font-mono text-xs font-semibold text-emerald-400">
                  GM-{String(chapter.chapterNumber).padStart(2, "0")}
                </span>
                <div>
                  <h2 className="text-sm font-semibold">{chapter.titleTh}</h2>
                  <p className="text-[11px] text-zinc-400">{chapter.titleEn}</p>
                </div>
              </div>
              <span className="font-mono text-xs text-zinc-400">
                {chapterPassed}/{chapterLevels.length} ผ่านแล้ว
              </span>
            </div>

            <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4">
              {chapterLevels.map((level) => {
                const passed = passedIds.has(level.id);
                const isBoss = level.level_number === levels[levels.length - 1]?.level_number;
                return (
                  <Link
                    key={level.id}
                    href={`/dashboard/games/${gameSlug}/${level.id}`}
                    className={`flex flex-col gap-2 rounded-lg border bg-white p-4 transition-colors hover:border-emerald-500 dark:bg-zinc-950 ${
                      isBoss
                        ? "border-amber-400 bg-gradient-to-br from-amber-50 to-white dark:border-amber-600 dark:from-amber-950 dark:to-zinc-950"
                        : passed
                          ? "border-emerald-300 dark:border-emerald-800"
                          : "border-zinc-200 dark:border-zinc-800"
                    }`}
                  >
                    <div className="flex items-center justify-between">
                      <span className="rounded bg-zinc-100 px-1.5 py-0.5 font-mono text-[11px] font-semibold text-zinc-600 dark:bg-zinc-900 dark:text-zinc-400">
                        Lv.{level.level_number}
                      </span>
                      {passed ? (
                        <span className="rounded-full bg-emerald-100 px-2 py-0.5 text-[11px] font-medium text-emerald-800 dark:bg-emerald-950 dark:text-emerald-400">
                          ✓ ผ่านแล้ว
                        </span>
                      ) : (
                        <span className="rounded-full bg-zinc-100 px-2 py-0.5 text-[11px] font-medium text-zinc-500 dark:bg-zinc-900 dark:text-zinc-400">
                          ยังไม่ผ่าน
                        </span>
                      )}
                    </div>
                    <h3 className="text-sm font-medium text-zinc-900 dark:text-zinc-50">
                      {isBoss && "👑 "}
                      {level.title}
                    </h3>
                    <span className={`mt-auto inline-block w-fit rounded px-1.5 py-0.5 text-[10px] font-medium ${GAME_TYPE_BADGE[level.game_type]}`}>
                      {GAME_TYPE_LABEL[level.game_type]}
                    </span>
                  </Link>
                );
              })}
            </div>
          </div>
        );
      })}
    </div>
  );
}
