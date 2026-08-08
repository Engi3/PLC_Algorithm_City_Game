/**
 * Task 4: non-destructive loader for level_numbers that are genuinely NEW
 * (never shipped before) - the massive Maze tiers (51-68) and the Factory
 * Count & Dispatch chapter (51-58). Unlike replace-maze-levels.ts/replace-
 * hybrid-levels-inplace.ts (which DELETE+INSERT an entire game's rows),
 * this only INSERTs, and refuses if ANY row in the batch would collide
 * with an existing (game_type, level_number) - so it's safe to re-run
 * against a partially-loaded DB, but never silently overwrites anything.
 *
 * Usage:
 *   npx tsx scripts/insert-new-game-levels.ts <game-slug> <json-path>
 *   npx tsx scripts/insert-new-game-levels.ts maze ./scripts/level-gen/game-levels-maze-massive.json
 *   npx tsx scripts/insert-new-game-levels.ts factory ./scripts/level-gen/game-levels-factory-count-dispatch.json
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
  const gameSlug = process.argv[2];
  const path = process.argv[3];
  if (!gameSlug || !path) {
    console.error("Usage: npx tsx scripts/insert-new-game-levels.ts <game-slug> <json-path>");
    process.exit(1);
  }

  const levels: GameLevelRow[] = JSON.parse(readFileSync(path, "utf-8"));
  console.log(`Loaded ${levels.length} level(s) from ${path}.`);
  if (levels.length === 0) {
    console.log("Nothing to insert.");
    return;
  }
  const gameType = levels[0].game_type;

  const { data: game, error: gameError } = await supabase.from("games").select("id").eq("slug", gameSlug).single();
  if (gameError || !game) {
    console.error(`Failed to look up game slug '${gameSlug}':`, gameError);
    process.exit(1);
  }

  const levelNumbers = levels.map((l) => l.level_number);
  const { data: existing, error: existingError } = await supabase
    .from("game_levels")
    .select("level_number")
    .eq("game_type", gameType)
    .in("level_number", levelNumbers);
  if (existingError) {
    console.error("Failed to check for existing level_number collisions:", existingError);
    process.exit(1);
  }
  if (existing && existing.length > 0) {
    console.error(
      `Refusing to proceed: ${existing.length} of these level_number(s) already exist for game_type=${gameType}: ${existing.map((e) => e.level_number).join(",")}. This script only inserts genuinely new levels.`
    );
    process.exit(1);
  }

  const rows = levels.map((row) => ({ ...row, game_id: game.id }));
  const { error: insertError } = await supabase.from("game_levels").insert(rows);
  if (insertError) {
    console.error(`Failed to insert new ${gameType} rows:`, insertError);
    process.exit(1);
  }
  console.log(`Inserted ${rows.length} new ${gameType} row(s) (levels ${Math.min(...levelNumbers)}-${Math.max(...levelNumbers)}).`);

  const { count: finalCount } = await supabase.from("game_levels").select("id", { count: "exact", head: true }).eq("game_type", gameType);
  console.log(`Done. game_levels now has ${finalCount} ${gameType} row(s) total.`);
}

main().catch((err) => {
  console.error("insert-new-game-levels crashed:", err);
  process.exit(1);
});
