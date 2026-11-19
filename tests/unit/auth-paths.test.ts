import { describe, expect, it } from "vitest";
import { isPublicPath } from "@/lib/auth/paths";

describe("isPublicPath", () => {
  it.each(["/login", "/auth", "/auth/confirm"])("%s is public", (path) => {
    expect(isPublicPath(path)).toBe(true);
  });

  // Prefix lookalikes must not slip through the optimistic redirect.
  it.each(["/", "/chat", "/loginx", "/login-admin", "/authority", "/admin/login"])(
    "%s requires a session",
    (path) => {
      expect(isPublicPath(path)).toBe(false);
    },
  );
});
