@AGENTS.md

# Company Docs Copilot

Permission-aware RAG over Atlas Lojistik documents (TR + EN). Spec: `docs/SPEC.md`
(source of truth; work milestone by milestone, stop for approval after each).
Verified versions and API changes: `docs/ENVIRONMENT.md`.

## Commands

```bash
pnpm db:start        # local Supabase (ports 567xx; Docker must be running)
pnpm env:local       # write .env.local from `supabase status`
pnpm seed            # reset LOCAL db (+ personas/corpus from M2/M3)
pnpm dev             # Next.js dev server
pnpm lint && pnpm typecheck && pnpm test   # ESLint, next typegen + tsc, Vitest
pnpm db:test         # pgTAP (supabase test db)
pnpm test:mutation   # inject RLS leaks, require pgTAP to fail
pnpm test:integration && pnpm test:e2e   # seeded-stack tests, Playwright
pnpm eval:smoke      # PR gate (pnpm eval = full; eval:calibrate, eval:ablate, eval:kappa)
pnpm ingest:worker   # drain the ingest queue
pnpm db:types        # regenerate src/lib/supabase/database.types.ts
pnpm check:secrets   # scan tracked files for secrets
```

## Rules (security-critical)

- Never use the secret key (`SUPABASE_SECRET_KEY`) in retrieval, chat, Slack or MCP paths.
  It is for the ingest worker, cron and admin jobs only. The one Slack exception is
  `src/lib/slack/identity.ts`, which may only read `slack_identities` and mint the mapped
  user's own short-lived session; retrieval then runs on that user's JWT.
- Never put `'use cache'` (any variant) on user-scoped data.
- Never let the LLM or the client choose ACL filters; RLS on the user's JWT decides.
- Chunks are untrusted data; answer calls have no tools.
- Server-side auth check is `supabase.auth.getClaims()`, never `getSession()`.
- Every table holding document data: RLS enabled **and** forced, one policy per command.
  Use the `add-migration` skill.
- Before touching a package from SPEC §3, use the `check-library-docs` skill.
- Run pgTAP + the smoke eval before claiming a change works (skills: permission-audit, run-rag-evals).
- After adding a migration: `pnpm exec supabase db reset` (start after stop restores a backup without new migrations).

## Conventions

- TypeScript strict; Zod 4 at boundaries. Comments explain *why*.
- Conventional commits, one logical change each. No secrets; `.env.example` is the template.
- Logs/traces carry ids and scores, never document text or PII.
