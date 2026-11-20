import { createClient } from "@supabase/supabase-js";
import org from "../../seed/org.json";
import { userSessionFromAccessToken, type UserSession } from "@/lib/retrieval/session";

export const PERSONAS = org.personas;

// Full evals run longer than the 1 h JWT lifetime, so cached sessions are
// re-minted well before expiry instead of failing mid-run with "JWT expired".
const SESSION_TTL_MS = 30 * 60 * 1000;
const cache = new Map<string, { session: UserSession; at: number }>();

/** Signs a seeded persona in (cached for 30 min); returns a verified session. */
export async function personaSession(key: string): Promise<UserSession> {
  const hit = cache.get(key);
  if (hit && Date.now() - hit.at < SESSION_TTL_MS) return hit.session;
  const session = await signIn(key);
  cache.set(key, { session, at: Date.now() });
  return session;
}

async function signIn(key: string): Promise<UserSession> {
  const anon = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL!, process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY!, {
    auth: { persistSession: false, autoRefreshToken: false },
  });
  const { data, error } = await anon.auth.signInWithPassword({
    email: `${key}@${org.emailDomain}`,
    password: process.env.DEMO_PASSWORD!,
  });
  if (error || !data.session) throw new Error(`sign-in failed for ${key}: ${error?.message}`);
  return userSessionFromAccessToken(data.session.access_token, "eval");
}

/** Chunk ids the persona may read, straight from RLS: ground truth for leak checks. */
export async function permittedChunks(session: UserSession): Promise<{ chunkIds: Set<string>; documentIds: Set<string> }> {
  const { data } = await session.client.from("chunks").select("id, document_id").eq("kind", "chunk");
  return {
    chunkIds: new Set((data ?? []).map((r) => r.id)),
    documentIds: new Set((data ?? []).map((r) => r.document_id)),
  };
}
