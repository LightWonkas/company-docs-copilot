import { metadataCorsOptionsRequestHandler, protectedResourceHandler } from "mcp-handler";

// RFC 9728 Protected Resource Metadata: tells MCP clients that Supabase Auth
// (OAuth 2.1, dynamic client registration) is the authorization server.
const handler = (request: Request) =>
  protectedResourceHandler({ authServerUrls: [`${process.env.NEXT_PUBLIC_SUPABASE_URL}/auth/v1`] })(request);

const options = metadataCorsOptionsRequestHandler();

export { handler as GET, options as OPTIONS };
