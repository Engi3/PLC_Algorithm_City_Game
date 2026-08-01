/**
 * Upserts Challenge Mode rows into `challenge_levels`, keyed on
 * challenge_id. Unlike seed-levels.ts this is NOT destructive - Challenge
 * Mode is being seeded in batches across several tasks (Task 4: 1-10, more
 * later), so a blanket delete would wipe out challenges seeded by a later
 * batch if this script were re-run. Re-running with the same input file is
 * safe and idempotent (upsert on challenge_id).
 *
 * Usage:
 *   npm run seed:challenges -- scripts/challenge-gen/challenges-1-10.json
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

type ChallengeRow = {
  challenge_id: number;
  title: string;
  description: string;
  required_competencies: string[];
  hints: string[];
  stages_json: unknown;
  max_optimal_blocks: number;
};

async function main() {
  const path = process.argv[2] ?? "./scripts/challenge-gen/challenges-1-10.json";
  const challenges: ChallengeRow[] = JSON.parse(readFileSync(path, "utf-8"));
  console.log(`Loaded ${challenges.length} challenge(s) from ${path}.`);

  const { error: upsertError } = await supabase
    .from("challenge_levels")
    .upsert(challenges, { onConflict: "challenge_id" });
  if (upsertError) {
    console.error("Failed to upsert challenges:", upsertError);
    process.exit(1);
  }

  const { count, error: verifyError } = await supabase
    .from("challenge_levels")
    .select("id", { count: "exact", head: true });
  if (verifyError) {
    console.error("Failed to verify challenge count:", verifyError);
    process.exit(1);
  }

  console.log(`Done. challenge_levels table now has ${count} row(s) total.`);
}

main().catch((err) => {
  console.error("seed-challenges crashed:", err);
  process.exit(1);
});
