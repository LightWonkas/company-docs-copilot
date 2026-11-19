import { createClient as createSupabaseClient, type SupabaseClient } from "@supabase/supabase-js";
import { getPublicEnv } from "@/lib/env";
import type { Database } from "@/lib/supabase/database.types";

export type Channel = "web" | "slack" | "mcp" | "eval";

/**
 * Proof that a request runs as a specific end user. retrieve() only accepts
 * this type, and the only ways to build one verify a user JWT first, so the
 * secret-key client (which has no user) can never reach retrieval.
 */
export type UserSession = {
  readonly userId: string;
  readonly client: SupabaseClient<Database>;
  readonly channel: Channel;
  readonly __brand: "UserSession";
};

export class NotAuthenticatedError extends Error {
  constructor() {
    super("A verified end-user JWT is required for retrieval");
  }
}

/** From the cookie-based server client (web requests). */
export async function userSessionFromClient(
  client: SupabaseClient<Database>,
  channel: Channel = "web",
): Promise<UserSession> {
  const { data, error } = await client.auth.getClaims();
  const sub = data?.claims?.sub;
  if (error || !sub || data?.claims?.role !== "authenticated") throw new NotAuthenticatedError();
  return { userId: sub, client, channel, __brand: "UserSession" };
}

/**
 * From a bare access token (Slack bridge, MCP OAuth, evals). The token is
 * verified (signature via JWKS, expiry) before it is used, and every query
 * then carries it, so RLS evaluates this user's principals.
 */
export async function userSessionFromAccessToken(token: string, channel: Channel): Promise<UserSession> {
  const { supabaseUrl, supabasePublishableKey } = getPublicEnv();
  const client = createSupabaseClient<Database>(supabaseUrl, supabasePublishableKey, {
    global: { headers: { Authorization: `Bearer ${token}` } },
    auth: { persistSession: false, autoRefreshToken: false },
  });
  const { data, error } = await client.auth.getClaims(token);
  const sub = data?.claims?.sub;
  if (error || !sub || data?.claims?.role !== "authenticated") throw new NotAuthenticatedError();
  return { userId: sub, client, channel, __brand: "UserSession" };
}
