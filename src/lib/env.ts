import { z } from "zod";

/**
 * Public env is inlined into the client bundle at build time, so each variable
 * must be read as a literal `process.env.NEXT_PUBLIC_*` expression.
 *
 * The key format is validated on purpose: the legacy `anon` JWT key
 * (`eyJ...`) is rejected so the project can't drift back to it.
 */
const publicEnvSchema = z.object({
  NEXT_PUBLIC_SUPABASE_URL: z.url(),
  NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY: z
    .string()
    .startsWith("sb_publishable_", "Use the sb_publishable_ key, not the legacy anon JWT"),
});

export type PublicEnv = { supabaseUrl: string; supabasePublishableKey: string };

export function parsePublicEnv(source: Record<string, string | undefined>): PublicEnv {
  const env = publicEnvSchema.parse(source);
  return {
    supabaseUrl: env.NEXT_PUBLIC_SUPABASE_URL,
    supabasePublishableKey: env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY,
  };
}

let cachedPublic: PublicEnv | undefined;

/** Parsed lazily so `next build` and unit tests don't need a running Supabase. */
export function getPublicEnv(): PublicEnv {
  cachedPublic ??= parsePublicEnv({
    NEXT_PUBLIC_SUPABASE_URL: process.env.NEXT_PUBLIC_SUPABASE_URL,
    NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY: process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY,
  });
  return cachedPublic;
}

const flag = z
  .enum(["true", "false", "1", "0"])
  .optional()
  .transform((v) => v === "true" || v === "1");

const serverEnvSchema = z.object({
  SUPABASE_SECRET_KEY: z.string().startsWith("sb_secret_").optional(),
  ANTHROPIC_API_KEY: z.string().min(1).optional(),
  ANSWER_MODEL: z.string().default("claude-sonnet-5-5"),
  HELPER_MODEL: z.string().default("claude-haiku-5-5"),
  JUDGE_MODEL: z.string().default("claude-opus-5-5"),
  // Demo login (password for seeded personas). Off unless explicitly enabled.
  DEMO_MODE: flag,
  DEMO_PASSWORD: z.string().min(12).optional(),
  APP_URL: z.url().default("http://localhost:3100"),
});

export type ServerEnv = z.infer<typeof serverEnvSchema>;

export function parseServerEnv(source: Record<string, string | undefined>): ServerEnv {
  return serverEnvSchema.parse(source);
}

/** Server-only values. Never import this into a Client Component. */
export function getServerEnv(): ServerEnv {
  return parseServerEnv(process.env);
}
