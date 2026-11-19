"use server";

import { headers } from "next/headers";
import { redirect } from "next/navigation";
import { z } from "zod";
import { demoEmail } from "@/lib/auth/demo";
import { LOGIN_PATH } from "@/lib/auth/paths";
import { getServerEnv } from "@/lib/env";
import { createClient } from "@/lib/supabase/server";

export type LoginState = { message?: string; error?: string };

const emailSchema = z.email();

export async function sendMagicLink(_prev: LoginState, formData: FormData): Promise<LoginState> {
  const email = emailSchema.safeParse(formData.get("email"));
  if (!email.success) return { error: "Enter a valid work email." };

  const supabase = await createClient();
  const origin = (await headers()).get("origin") ?? getServerEnv().APP_URL;
  // shouldCreateUser: false — accounts are provisioned by admins; a magic link
  // must never create one. The response is identical whether or not the
  // account exists, so the form can't be used to enumerate employees.
  await supabase.auth.signInWithOtp({
    email: email.data,
    options: { shouldCreateUser: false, emailRedirectTo: `${origin}/auth/confirm` },
  });
  return { message: "If this email has an account, a sign-in link is on its way." };
}

export async function demoSignIn(formData: FormData) {
  const env = getServerEnv();
  const email = demoEmail(String(formData.get("persona") ?? ""));
  if (!env.DEMO_MODE || !env.DEMO_PASSWORD || !email) redirect(`${LOGIN_PATH}?error=demo_unavailable`);

  const supabase = await createClient();
  // The demo password stays on the server; the browser only sends a persona key.
  const { error } = await supabase.auth.signInWithPassword({ email, password: env.DEMO_PASSWORD });
  if (error) redirect(`${LOGIN_PATH}?error=demo_failed`);
  redirect("/");
}

export async function signOut() {
  const supabase = await createClient();
  await supabase.auth.signOut();
  redirect(LOGIN_PATH);
}
