import { createMcpHandler, withMcpAuth } from "mcp-handler";
import { registerTools } from "@/lib/mcp/tools";
import { userSessionFromAccessToken } from "@/lib/retrieval/session";

export const maxDuration = 60;

// Stateless Streamable HTTP MCP endpoint (SDK v2). Bearer tokens are issued by
// Supabase Auth's OAuth 2.1 server; withMcpAuth answers 401 with an RFC 9728
// WWW-Authenticate challenge pointing at our protected-resource metadata.
const handler = createMcpHandler(registerTools, {
  serverInfo: { name: "company-docs-copilot", version: "1.0.0" },
});

async function verifyToken(_req: Request, bearerToken?: string) {
  if (!bearerToken) return undefined;
  try {
    // Verifies signature (JWKS) and expiry; the token must belong to a user.
    const session = await userSessionFromAccessToken(bearerToken, "mcp");
    const { data } = await session.client.auth.getClaims(bearerToken);
    return {
      token: bearerToken,
      clientId: typeof data?.claims?.client_id === "string" ? data.claims.client_id : "unknown",
      scopes: [],
      extra: { userId: session.userId },
    };
  } catch {
    return undefined;
  }
}

const authed = withMcpAuth(handler, verifyToken, {
  required: true,
  resourceMetadataPath: "/.well-known/oauth-protected-resource",
});

export { authed as GET, authed as POST, authed as DELETE };
