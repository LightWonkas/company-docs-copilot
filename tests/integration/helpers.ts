import { createClient } from "@supabase/supabase-js";
import org from "../../seed/org.json";
import { userSessionFromAccessToken, type UserSession } from "@/lib/retrieval/session";

/** Signs a seeded persona in (demo password) and returns a verified session. */
export async function personaSession(key: string): Promise<UserSession> {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL!;
  const anon = createClient(url, process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY!, {
    auth: { persistSession: false, autoRefreshToken: false },
  });
  const { data, error } = await anon.auth.signInWithPassword({
    email: `${key}@${org.emailDomain}`,
    password: process.env.DEMO_PASSWORD!,
  });
  if (error || !data.session) throw new Error(`sign-in failed for ${key}: ${error?.message}`);
  return userSessionFromAccessToken(data.session.access_token, "eval");
}

/** Document ids a persona may read, straight from RLS (ground truth for leak checks). */
export async function visibleDocumentIds(session: UserSession): Promise<Set<string>> {
  const { data } = await session.client.from("chunks").select("document_id").eq("kind", "chunk");
  return new Set((data ?? []).map((r) => r.document_id));
}
