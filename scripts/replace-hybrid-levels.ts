/**
 * One-time load of the new 50-level Hybrid track (scripts/level-gen/
 * generate-hybrid-50.ts) into the 'hybrid' game (migration 0014 created
 * the game row with 0 levels - this is an INSERT-only load, not a
 * DELETE+INSERT replacement like replace-maze-levels.ts/replace-factory-
 * levels.ts, since there are no old HYBRID rows to remove).
 *
 * Usage:
 *   npx tsx scripts/level-gen/generate-hybrid-50.ts   (regenerate the JSON first)
 *   npx tsx scripts/replace-hybrid-levels.ts
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
  const path = process.argv[2] ?? "./scripts/level-gen/game-levels-hybrid-50.json";
  const levels: GameLevelRow[] = JSON.parse(readFileSync(path, "utf-8"));
  console.log(`Loaded ${levels.length} level(s) from ${path}.`);

  const { data: hybridGame, error: gameError } = await supabase.from("games").select("id").eq("slug", "hybrid").single();
  if (gameError || !hybridGame) {
    console.error("Failed to look up hybrid game (migration 0014 may not be run yet):", gameError);
    process.exit(1);
  }

  const { count: existingCount } = await supabase
    .from("game_levels")
    .select("id", { count: "exact", head: true })
    .eq("game_type", "HYBRID");
  if (existingCount && existingCount > 0) {
    console.error(`Refusing to proceed: ${existingCount} HYBRID row(s) already exist. This script only inserts into an empty track.`);
    process.exit(1);
  }

  // Probe whether migration 0015 (adds game_levels.reference_grid_program_json)
  // has been run yet - if not, strip the field from the insert payload so
  // this script still succeeds against the pre-migration schema instead of
  // failing the whole insert over one missing column (same degrade-
  // gracefully pattern used elsewhere for this column).
  const { error: probeError } = await supabase.from("game_levels").select("reference_grid_program_json").limit(1);
  const hasReferenceColumn = !probeError;
  if (!hasReferenceColumn) {
    console.warn("Column game_levels.reference_grid_program_json not found (migration 0015 not run yet) - inserting without it.");
  }

  const rows = levels.map(({ reference_grid_program_json, ...row }) => ({
    ...row,
    game_id: hybridGame.id,
    ...(hasReferenceColumn ? { reference_grid_program_json } : {}),
  }));
  const { error: insertError } = await supabase.from("game_levels").insert(rows);
  if (insertError) {
    console.error("Failed to insert new HYBRID rows:", insertError);
    process.exit(1);
  }
  console.log(`Inserted ${rows.length} new HYBRID row(s).`);

  const { count: finalCount } = await supabase.from("game_levels").select("id", { count: "exact", head: true }).eq("game_type", "HYBRID");
  console.log(`Done. game_levels now has ${finalCount} HYBRID row(s).`);
}

main().catch((err) => {
  console.error("replace-hybrid-levels crashed:", err);
  process.exit(1);
});
