/**
 * Backfills game_levels.reference_grid_program_json for rows that were
 * inserted (by replace-maze-levels.ts / replace-factory-levels.ts /
 * replace-hybrid-levels.ts) before migration 0015 added that column - all
 * three scripts detected the missing column at the time and stripped the
 * field from their insert payload rather than failing outright, so every
 * row currently has reference_grid_program_json = null. This re-reads the
 * same generated JSON files and UPDATEs each row by (game_type,
 * level_number) instead of re-inserting, so it's safe to run any number of
 * times and never touches game_play_logs.
 *
 * Usage:
 *   npx tsx scripts/backfill-reference-solutions.ts
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

type SourceRow = {
  level_number: number;
  game_type: string;
  reference_grid_program_json?: unknown;
};

const SOURCES: { gameType: string; path: string }[] = [
  { gameType: "MAZE", path: "./scripts/level-gen/game-levels-maze-50.json" },
  { gameType: "FACTORY", path: "./scripts/level-gen/game-levels-factory-50.json" },
  { gameType: "HYBRID", path: "./scripts/level-gen/game-levels-hybrid-50.json" },
];

async function main() {
  for (const source of SOURCES) {
    const rows: SourceRow[] = JSON.parse(readFileSync(source.path, "utf-8"));
    console.log(`\n${source.gameType}: loaded ${rows.length} row(s) from ${source.path}.`);

    let updated = 0;
    let skipped = 0;
    for (const row of rows) {
      if (row.reference_grid_program_json === undefined) {
        skipped++;
        continue;
      }
      const { error, count } = await supabase
        .from("game_levels")
        .update({ reference_grid_program_json: row.reference_grid_program_json }, { count: "exact" })
        .eq("game_type", source.gameType)
        .eq("level_number", row.level_number);
      if (error) {
        console.error(`  Failed to update ${source.gameType} level ${row.level_number}:`, error);
        process.exit(1);
      }
      if (!count) {
        console.warn(`  No row matched ${source.gameType} level ${row.level_number} (skipped).`);
        skipped++;
        continue;
      }
      updated++;
    }
    console.log(`${source.gameType}: updated ${updated}, skipped ${skipped}.`);
  }

  console.log("\nBackfill done.");
}

main().catch((err) => {
  console.error("backfill-reference-solutions crashed:", err);
  process.exit(1);
});
