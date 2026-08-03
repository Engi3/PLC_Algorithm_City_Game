/**
 * One-time replacement of the old 49-level Maze track with the new
 * independently-numbered 50-level track (scripts/level-gen/generate-
 * maze-50.ts). Unlike update-maze9x9-levels.ts (which UPDATEd rows that
 * kept their old level_number), this DELETEs every old MAZE row and
 * INSERTs the new 50 fresh, since the numbering itself changed - old
 * levels 1-99 (odd chapters) don't correspond to new levels 1-50 at all.
 * Safe to run: confirmed 0 game_play_logs reference any MAZE row before
 * this script was written.
 *
 * Usage:
 *   npx tsx scripts/level-gen/generate-maze-50.ts   (regenerate the JSON first)
 *   npx tsx scripts/replace-maze-levels.ts
 */
import { config } from "dotenv";
import { readFileSync } from "fs";
import { createClient } from "@supabase/supabase-js";

config({ path: ".env.local", quiet: true });

const SUPABASE_URL = process.env.NEXT_PUBLIC_SUPABASE_URL;
const SERVICE_ROLE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY;

if (!SUPABASE_URL || !SERVICE_ROLE_KEY) {
  console.error("Missing NEXT_PUBLIC_SUPABASE_URL or SUPABASE_SERVICE_ROLE_KEY in .env.local");
  process.exit(1);
}

const supabase = createClient(SUPABASE_URL, SERVICE_ROLE_KEY, {
  auth: { autoRefreshToken: false, persistSession: false },
});

type GameLevelRow = {
  level_number: number;
  game_type: string;
  title: string;
  description: string;
  hints: string[];
  map_layout_json: unknown;
  robot_start_json: unknown;
  factory_initial_json: unknown;
  success_conditions_json: unknown;
  safety_constraints_json: unknown;
  time_limit_ticks: number | null;
  ticks_per_second: number | null;
  reference_grid_program_json?: unknown;
};

async function main() {
  const path = process.argv[2] ?? "./scripts/level-gen/game-levels-maze-50.json";
  const levels: GameLevelRow[] = JSON.parse(readFileSync(path, "utf-8"));
  console.log(`Loaded ${levels.length} level(s) from ${path}.`);

  const { data: mazeGame, error: gameError } = await supabase.from("games").select("id").eq("slug", "maze").single();
  if (gameError || !mazeGame) {
    console.error("Failed to look up maze game:", gameError);
    process.exit(1);
  }

  const { count: existingCount } = await supabase
    .from("game_play_logs")
    .select("id, game_level_id, game_levels!inner(game_type)", { count: "exact", head: true })
    .eq("game_levels.game_type", "MAZE");
  if (existingCount && existingCount > 0) {
    console.error(`Refusing to proceed: ${existingCount} game_play_logs row(s) reference an existing MAZE level. Aborting to avoid data loss.`);
    process.exit(1);
  }

  const { error: deleteError, count: deletedCount } = await supabase
    .from("game_levels")
    .delete({ count: "exact" })
    .eq("game_type", "MAZE");
  if (deleteError) {
    console.error("Failed to delete old MAZE rows:", deleteError);
    process.exit(1);
  }
  console.log(`Deleted ${deletedCount} old MAZE row(s).`);

  const rows = levels.map((row) => ({ ...row, game_id: mazeGame.id }));
  const { error: insertError } = await supabase.from("game_levels").insert(rows);
  if (insertError) {
    console.error("Failed to insert new MAZE rows:", insertError);
    process.exit(1);
  }
  console.log(`Inserted ${rows.length} new MAZE row(s).`);

  const { count: finalCount } = await supabase.from("game_levels").select("id", { count: "exact", head: true }).eq("game_type", "MAZE");
  console.log(`Done. game_levels now has ${finalCount} MAZE row(s).`);
}

main().catch((err) => {
  console.error("replace-maze-levels crashed:", err);
  process.exit(1);
});
