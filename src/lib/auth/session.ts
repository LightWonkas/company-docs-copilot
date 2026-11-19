import "server-only";
import { redirect } from "next/navigation";
import { LOGIN_PATH } from "@/lib/auth/paths";
import { createClient } from "@/lib/supabase/server";
import type { Database } from "@/lib/supabase/database.types";

export type AppRole = Database["public"]["Enums"]["app_role"];

export type SessionUser = {
  id: string;
  email: string;
  fullName: string;
  role: AppRole;
  isAuditor: boolean;
  orgId: string;
};

/**
 * The server-side auth check (Data Access Layer). Verifies the JWT with
 * getClaims(), then loads the caller's own profile through RLS. Reads cookies,
 * so callers sit behind <Suspense> under Cache Components, and it is never
 * wrapped in 'use cache' (user-scoped data is never cached).
 */
export async function requireUser(): Promise<SessionUser> {
  const supabase = await createClient();
  const { data, error } = await supabase.auth.getClaims();
  const userId = data?.claims?.sub;
  if (error || !userId) redirect(LOGIN_PATH);

  const { data: profile } = await supabase
    .from("profiles")
    .select("id, email, full_name, role, is_auditor, org_id")
    .eq("id", userId)
    .single();
  // Authenticated but not provisioned in any org: treat as signed out.
  if (!profile) redirect(`${LOGIN_PATH}?error=no_profile`);

  return {
    id: profile.id,
    email: profile.email,
    fullName: profile.full_name,
    role: profile.role,
    isAuditor: profile.is_auditor,
    orgId: profile.org_id,
  };
}

/**
 * UI gating only. The database still enforces every rule (RLS), so a wrong
 * check here can hide a page but never leak data.
 */
export async function requireAdmin(): Promise<SessionUser> {
  const user = await requireUser();
  if (user.role !== "admin") redirect("/?error=forbidden");
  return user;
}

export async function requireAuditor(): Promise<SessionUser> {
  const user = await requireUser();
  if (!user.isAuditor) redirect("/?error=forbidden");
  return user;
}
