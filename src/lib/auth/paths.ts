export const LOGIN_PATH = "/login";

/**
 * Routes reachable without a session cookie. Kept as exact prefixes (not
 * regexes) so the list is easy to audit. Each non-page entry authenticates its
 * own requests: Slack by request signature, MCP by OAuth bearer token, cron by
 * CRON_SECRET, the chat API by the cookie session inside the handler.
 */
const PUBLIC_PREFIXES = [
  LOGIN_PATH,
  "/auth",
  "/api/slack",
  "/api/mcp",
  "/api/cron",
  "/.well-known",
] as const;

export function isPublicPath(pathname: string): boolean {
  return PUBLIC_PREFIXES.some((prefix) => pathname === prefix || pathname.startsWith(`${prefix}/`));
}
