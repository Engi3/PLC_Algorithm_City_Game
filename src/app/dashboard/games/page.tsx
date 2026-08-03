import Link from "next/link";
import { createClient } from "@/lib/supabase/server";
import { getCurrentProfile } from "@/lib/auth/get-profile";
import { checkLevelGate, resolveModeUnlock, type LevelGateStatus } from "@/lib/ladder/challenge-unlock";
import { SKILL_LABELS } from "@/lib/ladder/level-spec";

type GameRow = { id: string; slug: string; title_th: string; title_en: string; icon: string; sort_order: number };
type GameLevelRow = { id: string; game_id: string };

/**
 * Game Mode hub: one card per game (Maze Explorer, Factory Simulator, and
 * room for more later - see the `games` table, migration 0013) instead of
 * one flat 100-level list. Gated the same way as Challenge Mode
 * (resolveModeUnlock: teachers/guests always in, a teacher's per-student
 * override beats the normal gate either way, otherwise the standard
 * 50%-per-category Levels gate).
 */
export default async function GamesHubPage() {
  const profile = await getCurrentProfile();

  let games: GameRow[] = [];
  let levels: GameLevelRow[] = [];
  const passedIds = new Set<string>();
  let gate: LevelGateStatus = { unlocked: false, categories: [] };
  let unlocked = false;

  try {
    const supabase = await createClient();
    const { data: gameRows, error: gamesError } = await supabase
      .from("games")
      .select("id, slug, title_th, title_en, icon, sort_order")
      .order("sort_order", { ascending: true });
    if (gamesError) console.error("GamesHubPage: failed to load games", gamesError);
    else games = gameRows ?? [];

    const { data: levelRows, error: levelsError } = await supabase.from("game_levels").select("id, game_id");
    if (levelsError) console.error("GamesHubPage: failed to load game_levels", levelsError);
    else levels = levelRows ?? [];

    if (profile) {
      const { data: logs, error: logsError } = await supabase
        .from("game_play_logs")
        .select("game_level_id")
        .eq("user_id", profile.id)
        .eq("is_success", true);
      if (logsError) console.error("GamesHubPage: failed to load game_play_logs", logsError);
      else for (const log of logs ?? []) passedIds.add(log.game_level_id);

      if (profile.role === "student") gate = await checkLevelGate(supabase, profile.id);
      unlocked = resolveModeUnlock(profile.role, profile.game_mode_override, gate);
    }
  } catch (err) {
    console.error("GamesHubPage crashed:", err);
  }

  if (!unlocked) {
    return (
      <div className="flex flex-col gap-4">
        <div className="rounded-lg border border-zinc-800 bg-zinc-900 px-5 py-4 text-white">
          <p className="font-mono text-[11px] uppercase tracking-widest text-emerald-400">Game Mode — Maze &amp; Factory Simulation</p>
          <h1 className="mt-1 text-2xl font-semibold">🔒 ยังไม่ปลดล็อค</h1>
        </div>
        <div className="rounded-lg border border-amber-300 bg-amber-50 p-6 dark:border-amber-800 dark:bg-amber-950">
          <p className="text-center text-sm font-medium text-amber-800 dark:text-amber-300">
            ต้องผ่านด่านทดสอบ (Levels) อย่างน้อย 50% ในทุกหมวดหมู่ จึงจะปลดล็อค Game Mode ได้
          </p>
          <div className="mx-auto mt-4 flex max-w-sm flex-col gap-2.5">
            {gate.categories.map((c) => {
              const ratio = c.total > 0 ? c.passed / c.total : 1;
              const met = ratio >= 0.5;
              return (
                <div key={c.skill}>
                  <div className="flex items-center justify-between text-xs text-amber-800 dark:text-amber-300">
                    <span className="font-medium">
                      {met ? "✓" : "○"} {SKILL_LABELS[c.skill]}
                    </span>
                    <span className="font-mono">
                      {c.passed}/{c.total} ({Math.round(ratio * 100)}%)
                    </span>
                  </div>
                  <div className="mt-1 h-2 w-full overflow-hidden rounded-full bg-amber-200 dark:bg-amber-900">
                    <div className={`h-full ${met ? "bg-emerald-500" : "bg-amber-500"}`} style={{ width: `${Math.min(100, ratio * 100)}%` }} />
                  </div>
                </div>
              );
            })}
          </div>
          <div className="text-center">
            <Link href="/dashboard/play" className="mt-5 inline-block rounded-md bg-amber-600 px-5 py-2 text-sm font-medium text-white hover:bg-amber-700">
              ไปเล่นด่านทดสอบ →
            </Link>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="flex flex-col gap-6">
      <div className="rounded-lg border border-zinc-800 bg-zinc-900 px-5 py-4 text-white">
        <p className="font-mono text-[11px] uppercase tracking-widest text-emerald-400">Game Mode — Maze &amp; Factory Simulation</p>
        <h1 className="mt-1 text-2xl font-semibold">เลือกเกมที่ต้องการเล่น</h1>
        <p className="mt-1 text-sm text-zinc-400">เขียนวงจรแลดเดอร์ควบคุมโลกจำลองแบบเรียลไทม์ - เลือกเกมด้านล่างเพื่อดูรายการด่าน</p>
      </div>

      {games.length === 0 && <p className="text-zinc-400">ยังไม่มีเกมในระบบ</p>}

      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3">
        {games.map((game) => {
          const gameLevels = levels.filter((l) => l.game_id === game.id);
          const gamePassed = gameLevels.filter((l) => passedIds.has(l.id)).length;
          return (
            <Link
              key={game.id}
              href={`/dashboard/games/${game.slug}`}
              className="flex flex-col gap-3 rounded-lg border border-zinc-200 bg-white p-5 transition-colors hover:border-emerald-500 dark:border-zinc-800 dark:bg-zinc-950"
            >
              <span className="text-4xl">{game.icon}</span>
              <div>
                <h2 className="text-lg font-semibold text-zinc-900 dark:text-zinc-50">{game.title_th}</h2>
                <p className="text-xs text-zinc-500 dark:text-zinc-400">{game.title_en}</p>
              </div>
              <div className="mt-auto flex items-center justify-between pt-2">
                <span className="font-mono text-sm font-semibold text-emerald-600 dark:text-emerald-400">
                  {gamePassed}/{gameLevels.length}
                </span>
                <span className="text-xs text-zinc-500 dark:text-zinc-400">ผ่านแล้ว</span>
              </div>
            </Link>
          );
        })}
      </div>
    </div>
  );
}
