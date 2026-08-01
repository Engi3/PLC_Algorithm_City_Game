/**
 * One-off migration: replaces every I0-I7 / Q0-Q3 address with X0-X7 / Y0-Y3
 * across the live `levels` and `challenge_levels` tables. Structural fields
 * (allowedInputs/allowedOutputs arrays, frame.inputs / testCase.expect map
 * keys, StageExpectation.address, legacy referenceProgram/Contact/Output
 * addresses) are migrated by exact-match; free-text description/hints
 * mentions like "(I0)" are migrated by the same regex under word boundaries,
 * so both get covered by one string transform. AI0-AI15/T#/C# addresses are
 * untouched (pattern requires an exact I/Q digit-0-7/0-3 token).
 *
 * Usage: npx tsx scripts/migrate-iq-to-xy.ts
 */
import { config } from "dotenv";
import { createClient } from "@supabase/supabase-js";

config({ path: ".env.local", quiet: true });

const supabase = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL!, process.env.SUPABASE_SERVICE_ROLE_KEY!, {
  auth: { autoRefreshToken: false, persistSession: false },
});

function migrateStr(s: string): string {
  return s.replace(/\bI([0-7])\b/g, (_, n) => `X${n}`).replace(/\bQ([0-3])\b/g, (_, n) => `Y${n}`);
}

function walk(node: unknown, keyHint?: string): unknown {
  if (Array.isArray(node)) return node.map((v) => walk(v));
  if (node && typeof node === "object") {
    const isAddressKeyedMap = keyHint === "inputs" || keyHint === "expect";
    const out: Record<string, unknown> = {};
    for (const [k, v] of Object.entries(node as Record<string, unknown>)) {
      const newKey = isAddressKeyedMap ? migrateStr(k) : k;
      out[newKey] = walk(v, k);
    }
    return out;
  }
  if (typeof node === "string") return migrateStr(node);
  return node;
}

async function migrateLevels() {
  const { data: levels, error } = await supabase.from("levels").select("id, map_layout_json");
  if (error) throw new Error("failed to load levels: " + JSON.stringify(error));
  console.log(`Migrating ${levels?.length ?? 0} levels...`);
  for (const row of levels ?? []) {
    const migrated = walk(row.map_layout_json);
    const { error: updateError } = await supabase.from("levels").update({ map_layout_json: migrated }).eq("id", row.id);
    if (updateError) throw new Error(`failed to update level ${row.id}: ${JSON.stringify(updateError)}`);
  }
  console.log("Levels migrated.");
}

async function migrateChallenges() {
  const { data: challenges, error } = await supabase
    .from("challenge_levels")
    .select("id, description, hints, stages_json, reference_grid_program_json");
  if (error) throw new Error("failed to load challenges: " + JSON.stringify(error));
  console.log(`Migrating ${challenges?.length ?? 0} challenges...`);
  for (const row of challenges ?? []) {
    const migratedDescription = migrateStr(row.description as string);
    const migratedHints = ((row.hints as string[]) ?? []).map(migrateStr);
    const migratedStages = walk(row.stages_json);
    const migratedReference = row.reference_grid_program_json ? walk(row.reference_grid_program_json) : null;
    const { error: updateError } = await supabase
      .from("challenge_levels")
      .update({
        description: migratedDescription,
        hints: migratedHints,
        stages_json: migratedStages,
        reference_grid_program_json: migratedReference,
      })
      .eq("id", row.id);
    if (updateError) throw new Error(`failed to update challenge ${row.id}: ${JSON.stringify(updateError)}`);
  }
  console.log("Challenges migrated.");
}

async function main() {
  await migrateLevels();
  await migrateChallenges();
  console.log("Done.");
}

main().catch((err) => {
  console.error("migrate-iq-to-xy crashed:", err);
  process.exit(1);
});
