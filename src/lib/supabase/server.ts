import "server-only";
import { createServerClient } from "@supabase/ssr";
import { cookies } from "next/headers";
import { connection } from "next/server";
import { getPublicEnv } from "@/lib/env";
import type { Database } from "@/lib/supabase/database.types";

/**
 * User-scoped Supabase client for Server Components, Server Actions and Route
 * Handlers. It only ever carries the signed-in user's JWT, so every query is
 * subject to RLS. Create one per request; never share it across requests.
 */
export async function createClient() {
  // Session handling compares token expiry with Date.now(), so anything using
  // this client is request-time work: opt out of (runtime) prerendering.
  await connection();
  const cookieStore = await cookies();
  const { supabaseUrl, supabasePublishableKey } = getPublicEnv();

  return createServerClient<Database>(supabaseUrl, supabasePublishableKey, {
    cookies: {
      getAll() {
        return cookieStore.getAll();
      },
      setAll(cookiesToSet) {
        try {
          for (const { name, value, options } of cookiesToSet) {
            cookieStore.set(name, value, options);
          }
        } catch {
          // Server Components cannot write cookies. That's fine: proxy.ts
          // refreshes the session (and sets no-store headers) on every request.
        }
      },
    },
  });
}
