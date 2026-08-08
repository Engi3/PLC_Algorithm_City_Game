/**
 * One-time cleanup for Task 4's DB push: deletes the exact rows blocking
 * replace-maze-levels.ts (a game_play_logs row referencing an existing
 * MAZE level) and replace-hybrid-levels-inplace.ts (a ladder_drafts row
 * referencing an existing HYBRID level) - the same queries those scripts
 * themselves use to detect the blockage, printed here BEFORE deleting so
 * there's a record of exactly what was removed.
 *
 * Usage:
 *   npx tsx scripts/clear-blocking-test-data.ts
 */
import { config } from "dotenv";
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

async function main() {
  // --- MAZE-blocking game_play_logs rows ---
  const { data: mazeLevels, error: mazeLevelsError } = await supabase
    .from("game_levels")
    .select("id, level_number")
    .eq("game_type", "MAZE");
  if (mazeLevelsError) {
    console.error("Failed to look up MAZE levels:", mazeLevelsError);
    process.exit(1);
  }
  const mazeLevelIds = (mazeLevels ?? []).map((l) => l.id);

  const { data: blockingPlayLogs, error: playLogsError } = await supabase
    .from("game_play_logs")
    .select("id, user_id, game_level_id, is_success, created_at")
    .in("game_level_id", mazeLevelIds);
  if (playLogsError) {
    console.error("Failed to look up blocking game_play_logs rows:", playLogsError);
    process.exit(1);
  }
  console.log(`Found ${blockingPlayLogs?.length ?? 0} MAZE-referencing game_play_logs row(s):`);
  for (const row of blockingPlayLogs ?? []) {
    const levelNumber = mazeLevels?.find((l) => l.id === row.game_level_id)?.level_number;
    console.log(`  id=${row.id} user_id=${row.user_id} level_number=${levelNumber} is_success=${row.is_success} created_at=${row.created_at}`);
  }

  // --- HYBRID-blocking ladder_drafts rows ---
  const { data: hybridLevels, error: hybridLevelsError } = await supabase
    .from("game_levels")
    .select("id, level_number")
    .eq("game_type", "HYBRID");
  if (hybridLevelsError) {
    console.error("Failed to look up HYBRID levels:", hybridLevelsError);
    process.exit(1);
  }
  const hybridLevelIds = (hybridLevels ?? []).map((l) => l.id);

  const { data: blockingDrafts, error: draftsError } = await supabase
    .from("ladder_drafts")
    .select("id, user_id, context_id, updated_at")
    .eq("context_kind", "game")
    .in("context_id", hybridLevelIds);
  if (draftsError) {
    console.error("Failed to look up blocking ladder_drafts rows:", draftsError);
    process.exit(1);
  }
  console.log(`Found ${blockingDrafts?.length ?? 0} HYBRID-referencing ladder_drafts row(s):`);
  for (const row of blockingDrafts ?? []) {
    const levelNumber = hybridLevels?.find((l) => l.id === row.context_id)?.level_number;
    console.log(`  id=${row.id} user_id=${row.user_id} level_number=${levelNumber} updated_at=${row.updated_at}`);
  }

  if ((blockingPlayLogs?.length ?? 0) === 0 && (blockingDrafts?.length ?? 0) === 0) {
    console.log("Nothing to delete.");
    return;
  }

  if (blockingPlayLogs && blockingPlayLogs.length > 0) {
    const { error: deletePlayLogsError, count } = await supabase
      .from("game_play_logs")
      .delete({ count: "exact" })
      .in(
        "id",
        blockingPlayLogs.map((r) => r.id)
      );
    if (deletePlayLogsError) {
      console.error("Failed to delete blocking game_play_logs rows:", deletePlayLogsError);
      process.exit(1);
    }
    console.log(`Deleted ${count} game_play_logs row(s).`);
  }

  if (blockingDrafts && blockingDrafts.length > 0) {
    const { error: deleteDraftsError, count } = await supabase
      .from("ladder_drafts")
      .delete({ count: "exact" })
      .in(
        "id",
        blockingDrafts.map((r) => r.id)
      );
    if (deleteDraftsError) {
      console.error("Failed to delete blocking ladder_drafts rows:", deleteDraftsError);
      process.exit(1);
    }
    console.log(`Deleted ${count} ladder_drafts row(s).`);
  }

  console.log("Done. Now safe to run replace-maze-levels.ts and replace-hybrid-levels-inplace.ts.");
}

main().catch((err) => {
  console.error("clear-blocking-test-data crashed:", err);
  process.exit(1);
});
