import { createHmac, timingSafeEqual } from "node:crypto";

// Signed, expiring token in the "link your account" URL the bot DMs to an
// unmapped Slack user. It proves the Slack identity (team + user) came from a
// Slack-signed request; the app identity comes from the user's own login.

export type LinkClaims = { teamId: string; slackUserId: string; exp: number };

const TTL_SECONDS = 15 * 60;

function sign(payload: string, secret: string) {
  return createHmac("sha256", secret).update(payload).digest("base64url");
}

export function createLinkToken(teamId: string, slackUserId: string, secret: string, now = Date.now()): string {
  const payload = Buffer.from(JSON.stringify({ t: teamId, u: slackUserId, exp: Math.floor(now / 1000) + TTL_SECONDS })).toString("base64url");
  return `${payload}.${sign(payload, secret)}`;
}

export function verifyLinkToken(token: string, secret: string, now = Date.now()): LinkClaims | null {
  const [payload, signature] = token.split(".");
  if (!payload || !signature) return null;
  const expected = Buffer.from(sign(payload, secret));
  const actual = Buffer.from(signature);
  if (expected.length !== actual.length || !timingSafeEqual(expected, actual)) return null;
  try {
    const { t, u, exp } = JSON.parse(Buffer.from(payload, "base64url").toString()) as { t: string; u: string; exp: number };
    if (typeof t !== "string" || typeof u !== "string" || exp * 1000 < now) return null;
    return { teamId: t, slackUserId: u, exp };
  } catch {
    return null;
  }
}
