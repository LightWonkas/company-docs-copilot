export const LOGIN_PATH = "/login";

/**
 * Routes reachable without a session. Kept as exact prefixes (not regexes) so
 * the list is easy to audit. Integrations added later (Slack, MCP) authenticate
 * their own requests and will be listed here explicitly.
 */
const PUBLIC_PREFIXES = [LOGIN_PATH, "/auth"] as const;

export function isPublicPath(pathname: string): boolean {
  return PUBLIC_PREFIXES.some(
    (prefix) => pathname === prefix || pathname.startsWith(`${prefix}/`),
  );
}
