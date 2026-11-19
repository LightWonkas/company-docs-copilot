import "server-only";
import { redirect } from "next/navigation";
import { LOGIN_PATH } from "@/lib/auth/paths";
import { createClient } from "@/lib/supabase/server";

export type SessionUser = { id: string; email: string | null };

/**
 * The server-side auth check (Data Access Layer). Verifies the JWT with
 * getClaims() and returns a deliberately narrow user. Reads cookies, so callers
 * must sit behind <Suspense> under Cache Components, and must never be wrapped
 * in 'use cache' (user-scoped data is never cached).
 */
export async function requireUser(): Promise<SessionUser> {
  const supabase = await createClient();
  const { data, error } = await supabase.auth.getClaims();
  const claims = data?.claims;
  if (error || !claims?.sub) redirect(LOGIN_PATH);
  return { id: claims.sub, email: typeof claims.email === "string" ? claims.email : null };
}
