/**
 * Upserts the 30 new "Efficiency" skill levels (level_number 101-130) into
 * `levels`, keyed on level_number. Unlike seed-levels.ts this is NOT
 * destructive - it never deletes anything, so it can't touch the existing
 * 100 levels (1-100) or, via FK cascade, any student's play_logs for them.
 * Re-running with the same input file is safe and idempotent.
 *
 * Usage:
 *   npx tsx scripts/level-gen/generate-efficiency.ts   (regenerate the JSON first)
 *   npm run seed:efficiency
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

type LevelRow = {
  level_number: number;
  title: string;
  optimal_blocks_count: number;
  map_layout_json: unknown;
};

async function main() {
  const path = process.argv[2] ?? "./scripts/level-gen/efficiency-levels.json";
  const levels: LevelRow[] = JSON.parse(readFileSync(path, "utf-8"));
  console.log(`Loaded ${levels.length} level(s) from ${path}.`);

  const { error: upsertError } = await supabase.from("levels").upsert(levels, { onConflict: "level_number" });
  if (upsertError) {
    console.error("Failed to upsert levels:", upsertError);
    process.exit(1);
  }

  const { count, error: verifyError } = await supabase.from("levels").select("id", { count: "exact", head: true });
  if (verifyError) {
    console.error("Failed to verify level count:", verifyError);
    process.exit(1);
  }

  console.log(`Done. levels table now has ${count} row(s) total.`);
}

main().catch((err) => {
  console.error("seed-efficiency-levels crashed:", err);
  process.exit(1);
});
