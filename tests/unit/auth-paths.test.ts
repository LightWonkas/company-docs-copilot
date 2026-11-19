import { describe, expect, it } from "vitest";
import { isPublicPath } from "@/lib/auth/paths";

describe("isPublicPath", () => {
  it.each([
    "/login",
    "/auth",
    "/auth/confirm",
    "/api/slack/events",
    "/api/mcp",
    "/api/cron/ingest",
    "/.well-known/oauth-protected-resource",
  ])("%s is public (authenticates itself)", (path) => {
    expect(isPublicPath(path)).toBe(true);
  });

  // Prefix lookalikes and app routes must not slip through the optimistic redirect.
  it.each(["/", "/chat", "/loginx", "/login-admin", "/authority", "/admin/login", "/api/chat", "/api/mcpx", "/oauth/consent"])(
    "%s requires a session",
    (path) => {
      expect(isPublicPath(path)).toBe(false);
    },
  );
});
