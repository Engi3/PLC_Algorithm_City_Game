/**
 * Text-only refresh for game_levels rows: updates title/description/hints
 * by (game_type, level_number), matched against the current generator
 * JSON output. Deliberately narrower than replace-maze-levels.ts /
 * replace-factory-levels.ts (which DELETE+INSERT everything, including
 * map_layout_json/factory_initial_json/success_conditions_json/solution) -
 * this script never touches structural fields, so it's safe to run even
 * if students have already played these levels (their play_logs still
 * point at the same row IDs, same win conditions, only the copy changed).
 *
 * Usage:
 *   npx tsx scripts/level-gen/generate-maze-50.ts      (regenerate JSON first)
 *   npx tsx scripts/level-gen/generate-factory-50.ts
 *   npx tsx scripts/level-gen/generate-hybrid-50.ts
 *   npx tsx scripts/update-game-level-text.ts
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

type TextRow = { level_number: number; game_type: string; title: string; description: string; hints: string[] };

const SOURCES: { gameType: string; path: string }[] = [
  { gameType: "MAZE", path: "./scripts/level-gen/game-levels-maze-50.json" },
  { gameType: "FACTORY", path: "./scripts/level-gen/game-levels-factory-50.json" },
  { gameType: "HYBRID", path: "./scripts/level-gen/game-levels-hybrid-50.json" },
];

async function main() {
  for (const source of SOURCES) {
    const rows: TextRow[] = JSON.parse(readFileSync(source.path, "utf-8"));
    console.log(`\n${source.gameType}: loaded ${rows.length} row(s) from ${source.path}.`);

    let updated = 0;
    for (const row of rows) {
      const { error, count } = await supabase
        .from("game_levels")
        .update({ title: row.title, description: row.description, hints: row.hints }, { count: "exact" })
        .eq("game_type", source.gameType)
        .eq("level_number", row.level_number);
      if (error) {
        console.error(`  Failed to update ${source.gameType} level ${row.level_number}:`, error);
        process.exit(1);
      }
      if (!count) {
        console.warn(`  No row matched ${source.gameType} level ${row.level_number} (skipped).`);
        continue;
      }
      updated += 1;
    }
    console.log(`${source.gameType}: updated ${updated} row(s).`);
  }

  console.log("\nText refresh done.");
}

main().catch((err) => {
  console.error("update-game-level-text crashed:", err);
  process.exit(1);
});
