import { createClient } from "@supabase/supabase-js";
import org from "../../seed/org.json";
import { userSessionFromAccessToken, type UserSession } from "@/lib/retrieval/session";

export const PERSONAS = org.personas;

/** Signs a seeded persona in with the demo password; returns a verified session. */
export async function personaSession(key: string): Promise<UserSession> {
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
