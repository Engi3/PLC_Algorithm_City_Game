/**
 * Upserts the generated Game Levels batch into `game_levels`, keyed on
 * level_number. Non-destructive - never deletes anything - so re-running
 * with the same or a later batch file is safe and idempotent, same
 * convention as seed-efficiency-levels.ts.
 *
 * Usage:
 *   npx tsx scripts/level-gen/generate-game-levels.ts   (regenerate the JSON first)
 *   npm run seed:game-levels
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
};

async function main() {
  const path = process.argv[2] ?? "./scripts/level-gen/game-levels-1-20.json";
  const levels: GameLevelRow[] = JSON.parse(readFileSync(path, "utf-8"));
  console.log(`Loaded ${levels.length} level(s) from ${path}.`);

  const { error: upsertError } = await supabase.from("game_levels").upsert(levels, { onConflict: "level_number" });
  if (upsertError) {
    console.error("Failed to upsert game levels:", upsertError);
    process.exit(1);
  }

  const { count, error: verifyError } = await supabase.from("game_levels").select("id", { count: "exact", head: true });
  if (verifyError) {
    console.error("Failed to verify game_levels count:", verifyError);
    process.exit(1);
  }

  console.log(`Done. game_levels table now has ${count} row(s) total.`);
}

main().catch((err) => {
  console.error("seed-game-levels crashed:", err);
  process.exit(1);
});
