"use server";

import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";

export async function decideAuthorization(formData: FormData) {
  const id = String(formData.get("authorization_id") ?? "");
  const approve = formData.get("decision") === "approve";
  const supabase = await createClient();
  const { data, error } = approve
    ? await supabase.auth.oauth.approveAuthorization(id)
    : await supabase.auth.oauth.denyAuthorization(id);
  if (error || !data) redirect("/?error=oauth_failed");
  redirect(data.redirect_url);
}
