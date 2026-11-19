import "server-only";
import { createClient } from "@supabase/supabase-js";
import { getPublicEnv } from "@/lib/env";
import { userSessionFromAccessToken, type UserSession } from "@/lib/retrieval/session";
import { createAdminClient } from "@/lib/supabase/admin";

/**
 * Slack identity bridge: the ONLY Slack code allowed to use the secret key,
 * and only to (1) read the Slack->user mapping and (2) mint a short-lived
 * session for that mapped user. Retrieval then runs on that user's JWT, so
 * RLS sees the employee, never the bot. The session is revoked after use.
 */
export async function sessionForSlackUser(
  teamId: string,
  slackUserId: string,
): Promise<{ session: UserSession; release: () => Promise<void> } | null> {
  const admin = createAdminClient();
  const { data: link } = await admin
    .from("slack_identities")
    .select("user_id, profiles(email)")
    .eq("team_id", teamId)
    .eq("slack_user_id", slackUserId)
    .maybeSingle();
  const email = (link?.profiles as { email: string } | null)?.email;
  if (!link || !email) return null;

  // generateLink sends no email; it returns a one-time token we redeem
  // immediately for a normal (1 h) user session.
  const { data: generated, error } = await admin.auth.admin.generateLink({ type: "magiclink", email });
  if (error || !generated.properties?.hashed_token) throw new Error("could not mint a user session");

  const { supabaseUrl, supabasePublishableKey } = getPublicEnv();
  const userAuth = createClient(supabaseUrl, supabasePublishableKey, {
    auth: { persistSession: false, autoRefreshToken: false },
  });
  const { data: verified, error: verifyError } = await userAuth.auth.verifyOtp({
    type: "magiclink",
    token_hash: generated.properties.hashed_token,
  });
  if (verifyError || !verified.session) throw new Error("could not mint a user session");

  const session = await userSessionFromAccessToken(verified.session.access_token, "slack");
  return {
    session,
    release: async () => {
      await userAuth.auth.signOut({ scope: "local" });
    },
  };
}
