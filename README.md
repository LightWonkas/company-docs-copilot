# Company Docs Copilot

An internal AI assistant for the fictional logistics firm **Atlas Lojistik A.Ş.**
that answers employees' questions (Turkish and English) **only from documents
each user is allowed to see**, and always cites its sources.

> **Permissions live in the database, evidence lives in the API, the model only writes.**

Status: **M1 — skeleton and environment check.** Full spec: [docs/SPEC.md](docs/SPEC.md).
Verified toolchain: [docs/ENVIRONMENT.md](docs/ENVIRONMENT.md).

## Quickstart (local)

Requires Node 26, pnpm 11 and Docker.

```bash
pnpm install
pnpm db:start      # local Supabase on ports 567xx
pnpm env:local     # writes .env.local from `supabase status`
pnpm seed          # resets the local database
pnpm dev
```

Checks:

```bash
pnpm lint && pnpm typecheck && pnpm test   # ESLint, tsc, Vitest
pnpm db:test                               # pgTAP
```

All demo content is synthetic.
