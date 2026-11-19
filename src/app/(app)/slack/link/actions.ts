"use server";

import { redirect } from "next/navigation";
import { verifyLinkToken } from "@/lib/slack/link-token";
import { createClient } from "@/lib/supabase/server";

export async function linkSlackAccount(formData: FormData) {
  const secret = process.env.SLACK_LINK_SECRET;
  const claims = secret ? verifyLinkToken(String(formData.get("t") ?? ""), secret) : null;
  if (!claims) redirect("/slack/link");
  const supabase = await createClient();
  // RLS: user_id defaults to and must equal auth.uid().
  const { error } = await supabase
    .from("slack_identities")
    .insert({ team_id: claims.teamId, slack_user_id: claims.slackUserId });
  if (error && error.code !== "23505") throw new Error("Linking failed");
  redirect("/slack/link?done=1");
}
