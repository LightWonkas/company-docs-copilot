import { createBrowserClient } from "@supabase/ssr";
import { getPublicEnv } from "@/lib/env";
import type { Database } from "@/lib/supabase/database.types";

/** Browser client for Client Components; holds only the user's own session. */
export function createClient() {
  const { supabaseUrl, supabasePublishableKey } = getPublicEnv();
  return createBrowserClient<Database>(supabaseUrl, supabasePublishableKey);
}
