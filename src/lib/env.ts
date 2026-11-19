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

let cached: PublicEnv | undefined;

/** Parsed lazily so `next build` and unit tests don't need a running Supabase. */
export function getPublicEnv(): PublicEnv {
  cached ??= parsePublicEnv({
    NEXT_PUBLIC_SUPABASE_URL: process.env.NEXT_PUBLIC_SUPABASE_URL,
    NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY: process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY,
  });
  return cached;
}
