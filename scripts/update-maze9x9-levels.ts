/**
 * Replaces the 49 existing MAZE level rows in place, by level_number, with
 * the freshly generated 9x9 content. Uses a plain UPDATE (not upsert) -
 * these rows already exist from the original 100-level seed, and an
 * UPDATE leaves untouched columns (like games.0013's NOT NULL `game_id`)
 * exactly as they were, unlike an upsert's ON CONFLICT DO UPDATE, which
 * Postgres validates as a candidate INSERT row first and rejects if any
 * NOT NULL column absent from the payload has no default.
 *
 * Usage:
 *   npx tsx scripts/level-gen/generate-maze-9x9.ts   (regenerate the JSON first)
 *   npx tsx scripts/update-maze9x9-levels.ts
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
  const path = process.argv[2] ?? "./scripts/level-gen/game-levels-maze9x9.json";
  const levels: GameLevelRow[] = JSON.parse(readFileSync(path, "utf-8"));
  console.log(`Loaded ${levels.length} level(s) from ${path}.`);

  let updated = 0;
  for (const row of levels) {
    const { level_number, ...rest } = row;
    const { error, count } = await supabase.from("game_levels").update(rest, { count: "exact" }).eq("level_number", level_number);
    if (error) {
      console.error(`Failed to update level ${level_number}:`, error);
      process.exit(1);
    }
    if (!count) {
      console.error(`level_number ${level_number} matched 0 rows - it doesn't exist yet, use seed-game-levels.ts instead for new rows.`);
      process.exit(1);
    }
    updated += count;
  }

  console.log(`Done. Updated ${updated} row(s).`);
}

main().catch((err) => {
  console.error("update-maze9x9-levels crashed:", err);
  process.exit(1);
});
