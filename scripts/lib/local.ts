// Shared bootstrap for local admin scripts (seed, worker, evals).
import { createClient } from "@supabase/supabase-js";
import type { Database } from "../../src/lib/supabase/database.types";

const LOCAL_HOSTS = new Set(["127.0.0.1", "localhost", "[::1]"]);

export function loadEnv() {
  try {
    process.loadEnvFile(".env.local");
  } catch {
    // CI provides env vars directly.
  }
}

export function requireEnv(name: string): string {
  const value = process.env[name];
  if (!value) throw new Error(`${name} is not set; run \`pnpm env:local\`.`);
  return value;
}

/** Secret-key client for admin scripts. Refuses anything but the local stack unless allowRemote. */
export function serviceClient(opts: { allowRemote?: boolean } = {}) {
  const url = requireEnv("NEXT_PUBLIC_SUPABASE_URL");
  if (!opts.allowRemote && !LOCAL_HOSTS.has(new URL(url).hostname)) {
    throw new Error(`Refusing to run against non-local Supabase host "${new URL(url).hostname}".`);
  }
  return createClient<Database>(url, requireEnv("SUPABASE_SECRET_KEY"), {
    auth: { persistSession: false, autoRefreshToken: false },
  });
}
