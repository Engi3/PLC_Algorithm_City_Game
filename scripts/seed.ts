/**
 * Seeds guest00-guest99 and the default Admin101 teacher account.
 * Idempotent: re-running skips accounts that already exist.
 *
 * Usage:
 *   npm run seed
 *
 * Requires NEXT_PUBLIC_SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY in .env.local
 * (service role key: Supabase Dashboard -> Project Settings -> API).
 */
import "dotenv/config";
import { createClient } from "@supabase/supabase-js";

const SUPABASE_URL = process.env.NEXT_PUBLIC_SUPABASE_URL;
const SERVICE_ROLE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY;

if (!SUPABASE_URL || !SERVICE_ROLE_KEY) {
  console.error(
    "Missing NEXT_PUBLIC_SUPABASE_URL or SUPABASE_SERVICE_ROLE_KEY in .env.local"
  );
  process.exit(1);
}

const supabase = createClient(SUPABASE_URL, SERVICE_ROLE_KEY, {
  auth: { autoRefreshToken: false, persistSession: false },
});

const EMAIL_DOMAIN = "plc-city.internal";
const toEmail = (username: string) =>
  `${username.toLowerCase()}@${EMAIL_DOMAIN}`;

type SeedAccount = {
  username: string;
  password: string;
  role: "student" | "teacher" | "guest";
  is_guest: boolean;
  first_name?: string;
  last_name?: string;
};

function buildGuestAccounts(): SeedAccount[] {
  const guests: SeedAccount[] = [];
  for (let i = 0; i < 100; i++) {
    const id = String(i).padStart(2, "0");
    const username = `guest${id}`;
    guests.push({
      username,
      password: username,
      role: "guest",
      is_guest: true,
      first_name: "Guest",
      last_name: id,
    });
  }
  return guests;
}

const ADMIN_ACCOUNT: SeedAccount = {
  username: "Admin101",
  password: "root101",
  role: "teacher",
  is_guest: false,
  first_name: "Admin",
  last_name: "101",
};

async function seedAccount(account: SeedAccount) {
  const { error } = await supabase.auth.admin.createUser({
    email: toEmail(account.username),
    password: account.password,
    email_confirm: true,
    user_metadata: {
      username: account.username,
      role: account.role,
      is_guest: account.is_guest,
      first_name: account.first_name,
      last_name: account.last_name,
    },
  });

  if (error) {
    // already exists -> not a failure, just skip
    if (
      error.code === "email_exists" ||
      error.message.toLowerCase().includes("already been registered")
    ) {
      return { username: account.username, status: "skipped" as const };
    }
    return {
      username: account.username,
      status: "failed" as const,
      reason: error.message,
    };
  }

  return { username: account.username, status: "created" as const };
}

async function seedInBatches(accounts: SeedAccount[], batchSize = 10) {
  const results: Awaited<ReturnType<typeof seedAccount>>[] = [];
  for (let i = 0; i < accounts.length; i += batchSize) {
    const batch = accounts.slice(i, i + batchSize);
    const batchResults = await Promise.all(batch.map(seedAccount));
    results.push(...batchResults);
  }
  return results;
}

async function main() {
  console.log("Seeding accounts...");

  const adminResult = await seedAccount(ADMIN_ACCOUNT);
  const guestResults = await seedInBatches(buildGuestAccounts());

  const all = [adminResult, ...guestResults];
  const created = all.filter((r) => r.status === "created").length;
  const skipped = all.filter((r) => r.status === "skipped").length;
  const failed = all.filter((r) => r.status === "failed");

  console.log(`Created: ${created}, skipped (already existed): ${skipped}`);
  if (failed.length > 0) {
    console.error(`Failed: ${failed.length}`);
    failed.forEach((f) =>
      console.error(`  - ${f.username}: ${(f as { reason: string }).reason}`)
    );
    process.exit(1);
  }

  console.log("Done.");
}

main().catch((err) => {
  console.error("Seed script crashed:", err);
  process.exit(1);
});
