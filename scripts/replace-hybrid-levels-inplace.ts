/**
 * Replaces the existing 50-level Hybrid track in place with a freshly
 * regenerated one (scripts/level-gen/generate-hybrid-50.ts) after the
 * Maze/AGV half's addresses moved from X0-X2/Y0-Y2/AI0 (overlapping the
 * Factory half's X0-X1/Y0-Y7/AI1-AI3) to X10-X12/Y10-Y12/AI10 (fully
 * distinct - see maze-plc-binding.ts's hybridMazeBinding). Old reference
 * solutions written for the overlapping scheme would silently mis-drive
 * outputs under the new binding, so this is a genuine DELETE+INSERT
 * replacement, not an insert-only load - same DELETE+INSERT pattern as
 * replace-maze-levels.ts/replace-factory-levels.ts, guarded the same way
 * on game_play_logs to avoid discarding real student data.
 *
 * Usage:
 *   npx tsx scripts/level-gen/generate-hybrid-50.ts   (regenerate the JSON first)
 *   npx tsx scripts/replace-hybrid-levels-inplace.ts
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
    console.error("Failed to look up hybrid game:", gameError);
    process.exit(1);
  }

  const { data: existingHybridLevels, error: existingLevelsError } = await supabase
    .from("game_levels")
    .select("id")
    .eq("game_type", "HYBRID");
  if (existingLevelsError) {
    console.error("Failed to look up existing HYBRID level ids:", existingLevelsError);
    process.exit(1);
  }
  const existingHybridIds = (existingHybridLevels ?? []).map((l) => l.id);

  if (existingHybridIds.length > 0) {
    const { count: playLogCount } = await supabase
      .from("game_play_logs")
      .select("id", { count: "exact", head: true })
      .in("game_level_id", existingHybridIds);
    if (playLogCount && playLogCount > 0) {
      console.error(`Refusing to proceed: ${playLogCount} game_play_logs row(s) reference an existing HYBRID level. Aborting to avoid data loss.`);
      process.exit(1);
    }

    const { count: draftCount } = await supabase
      .from("ladder_drafts")
      .select("id", { count: "exact", head: true })
      .eq("context_kind", "game")
      .in("context_id", existingHybridIds);
    if (draftCount && draftCount > 0) {
      console.error(`Refusing to proceed: ${draftCount} ladder_drafts row(s) reference an existing HYBRID level. Aborting to avoid data loss.`);
      process.exit(1);
    }
  }

  const { error: deleteError, count: deletedCount } = await supabase
    .from("game_levels")
    .delete({ count: "exact" })
    .eq("game_type", "HYBRID");
  if (deleteError) {
    console.error("Failed to delete old HYBRID rows:", deleteError);
    process.exit(1);
  }
  console.log(`Deleted ${deletedCount} old HYBRID row(s).`);

  const rows = levels.map((row) => ({ ...row, game_id: hybridGame.id }));
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
  console.error("replace-hybrid-levels-inplace crashed:", err);
  process.exit(1);
});
