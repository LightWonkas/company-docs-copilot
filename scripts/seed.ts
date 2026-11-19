// Resets the LOCAL database to migrations + seed data.
// M1: schema only. M2 adds personas (via the Auth admin API), M3 the corpus.
import { execSync } from "node:child_process";

const LOCAL_HOSTS = new Set(["127.0.0.1", "localhost", "[::1]"]);

process.loadEnvFile(".env.local");
const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
if (!url) throw new Error("NEXT_PUBLIC_SUPABASE_URL missing; run `pnpm env:local` first.");

// Seeding wipes data and (from M2) uses the secret key. Refuse anything that
// isn't the local stack, whatever .env.local says.
const { hostname } = new URL(url);
if (!LOCAL_HOSTS.has(hostname)) {
  throw new Error(`Refusing to seed non-local Supabase host "${hostname}".`);
}

// CLI v3 targets the local stack by default; --local is deprecated.
execSync("pnpm exec supabase db reset", { stdio: "inherit" });
console.log("Seed complete: schema only (personas arrive in M2, corpus in M3).");
