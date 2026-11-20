import { describe, expect, it } from "vitest";
import { parsePublicEnv, parseServerEnv } from "@/lib/env";

const valid = {
  NEXT_PUBLIC_SUPABASE_URL: "http://127.0.0.1:56721",
  NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY: "sb_publishable_abc123",
};

describe("parsePublicEnv", () => {
  it("accepts a URL and a publishable key", () => {
    expect(parsePublicEnv(valid)).toEqual({
      supabaseUrl: valid.NEXT_PUBLIC_SUPABASE_URL,
      supabasePublishableKey: valid.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY,
    });
  });

  it("rejects the legacy anon JWT key", () => {
    expect(() =>
      parsePublicEnv({ ...valid, NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY: "eyJhbGciOiJIUzI1NiJ9.x.y" }),
    ).toThrow(/sb_publishable_/);
  });

  it("rejects a secret key in a public variable", () => {
    expect(() =>
      parsePublicEnv({ ...valid, NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY: "sb_secret_abc" }),
    ).toThrow();
  });

  it("rejects a missing URL", () => {
    expect(() => parsePublicEnv({ ...valid, NEXT_PUBLIC_SUPABASE_URL: undefined })).toThrow();
  });
});

describe("parseServerEnv", () => {
  it("treats an empty secret (unset GitHub Actions secret) as not configured", () => {
    const env = parseServerEnv({ ANTHROPIC_API_KEY: "", SUPABASE_SECRET_KEY: "", DEMO_MODE: "" });
    expect(env.ANTHROPIC_API_KEY).toBeUndefined();
    expect(env.SUPABASE_SECRET_KEY).toBeUndefined();
    expect(env.DEMO_MODE).toBe(false);
  });

  it("still rejects a malformed secret key", () => {
    expect(() => parseServerEnv({ SUPABASE_SECRET_KEY: "eyJ.x.y" })).toThrow();
  });
});
