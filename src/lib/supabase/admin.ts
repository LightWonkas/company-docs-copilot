import "server-only";
import { createClient } from "@supabase/supabase-js";
import { getPublicEnv, getServerEnv } from "@/lib/env";
import type { Database } from "@/lib/supabase/database.types";

/**
 * Secret-key client: bypasses RLS. Allowed ONLY for the ingest worker and
 * admin jobs (user provisioning) after the caller has been verified as an
 * admin with their own JWT. ESLint blocks importing this module from the
 * retrieval, chat, Slack and MCP paths.
 */
export function createAdminClient() {
  const { supabaseUrl } = getPublicEnv();
  const { SUPABASE_SECRET_KEY } = getServerEnv();
  if (!SUPABASE_SECRET_KEY) throw new Error("SUPABASE_SECRET_KEY is not configured");
  return createClient<Database>(supabaseUrl, SUPABASE_SECRET_KEY, {
    auth: { persistSession: false, autoRefreshToken: false },
  });
}
