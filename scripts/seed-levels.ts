/**
 * Replaces all rows in `levels` with the generated 100-level dataset
 * (scripts/level-gen/levels-100.json). This is destructive: existing
 * levels and, via the FK cascade, every student's play_logs for them are
 * deleted first. Confirmed explicitly with the user before this script
 * was added - not run automatically by anything else.
 *
 * Usage:
 *   npx tsx scripts/level-gen/generate.ts   (regenerate the JSON first)
 *   npm run seed:levels
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
  const levels: LevelRow[] = JSON.parse(readFileSync("./scripts/level-gen/levels-100.json", "utf-8"));
  console.log(`Loaded ${levels.length} generated levels.`);

  const { data: existing, error: countError } = await supabase.from("levels").select("id");
  if (countError) {
    console.error("Failed to read existing levels:", countError);
    process.exit(1);
  }
  console.log(`Deleting ${existing?.length ?? 0} existing level(s) (cascades to their play_logs)...`);

  const { error: deleteError } = await supabase.from("levels").delete().gte("level_number", 0);
  if (deleteError) {
    console.error("Failed to delete existing levels:", deleteError);
    process.exit(1);
  }

  const { error: insertError } = await supabase.from("levels").insert(levels);
  if (insertError) {
    console.error("Failed to insert generated levels:", insertError);
    process.exit(1);
  }

  const { count, error: verifyError } = await supabase
    .from("levels")
    .select("id", { count: "exact", head: true });
  if (verifyError) {
    console.error("Failed to verify level count:", verifyError);
    process.exit(1);
  }

  console.log(`Done. levels table now has ${count} rows.`);
}

main().catch((err) => {
  console.error("seed-levels crashed:", err);
  process.exit(1);
});
