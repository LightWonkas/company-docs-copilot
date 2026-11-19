# Environment record

Verified facts about the toolchain this repo runs on. One line per fact, with
the date and source. Update via the `check-library-docs` skill whenever a
pinned package changes. Last full check: **2026-11-20** (M1).

## Local toolchain (Emin's machine, Windows 11)

| Tool | Version | Notes |
|---|---|---|
| Node.js | 26.13.1 | `.nvmrc` = 26; `engines.node` = `26.x` |
| pnpm | 11.1.3 | pinned via `packageManager` |
| Docker | 29.9.3 | required by `supabase start` |
| Supabase CLI | **3.2.0** (devDependency) | always run as `pnpm exec supabase …`; a global 2.121.0 is also installed but not used |
| git | 2.52.0 | `.gitattributes` forces LF so SQL/shell files match CI |

## Database (local stack, measured)

Measured with `psql` against the local stack on 2026-11-20.

- PostgreSQL **17.12** (`[db] major_version = 17`). The CLI pins image `supabase/postgres:17.12.0.002`.
- **pgvector 0.8.2** ≥ 0.8 ✅. Upstream latest is 0.8.7 (2026-10-01); Supabase ships 0.8.2. Source: https://github.com/supabase/postgres/blob/develop/nix/ext/versions.json
- Iterative index scans available ✅:
  - `hnsw.iterative_scan` = `off | relaxed_order | strict_order` (default `off`)
  - `hnsw.max_scan_tuples` = 20000, `hnsw.ef_search` = 40 by default
  - `ivfflat.iterative_scan` = `off | relaxed_order`
  - M4 sets `hnsw.iterative_scan = relaxed_order` and `hnsw.ef_search = 100` per query, with `set local`.
- Available extensions: pg_trgm 1.6, pgmq 1.5.1 (Supabase Queues, enabled in M3), pgtap 1.3.3 (installed automatically by `supabase test db`).
- **Guarded in CI:** `supabase/tests/001-environment.test.sql` asserts pgvector ≥ 0.8 and that `relaxed_order` is supported.
- **Hosted projects:** still to verify. Run `select extversion from pg_extension where extname='vector'` on the cloud project in M8.

### Local ports

This stack uses ports **567xx** so it can run next to other local Supabase projects, which already hold 54321–54324.

| Service | URL |
|---|---|
| API | http://127.0.0.1:56721 |
| DB | postgresql://postgres:postgres@127.0.0.1:56722/postgres |
| Studio | http://127.0.0.1:56723 |
| Mailpit (magic-link emails) | http://127.0.0.1:56724 |

Disabled in `config.toml` because this app doesn't use them: realtime, edge runtime and analytics (Logflare).

## Supabase CLI v3

v3.0.0 shipped on 2026-11-02. Sources: https://supabase.com/docs/guides/local-development/cli/migrating-to-v3, https://supabase.com/changelog/supabase-cli-v3

- **Commands target the local stack by default.** `--local` is deprecated; use `--remote` for hosted projects.
  - `--linked`, `--project-ref` and `--db-url` are deprecated and will be removed in v4.
- **Hosted changes ask for confirmation, defaulting to No.** Pass `--yes` in CI. `SUPABASE_YES` in a project `.env` file is not accepted as consent.
- **Config precedence:** flag > shell env > project env files > `config.toml` > default.
- **`[inbucket]` is renamed `[local_smtp]`.** Mail goes to Mailpit, and `status -o env` reports `MAILPIT_URL`.
- **`db diff` and `db pull` use the pg-delta engine.** To get migra back, set `[experimental.pgdelta] enabled = false`.
- **Removed commands:** `gen keys`, `db branch *`, `db remote changes/commit`, and some `inspect db` subcommands.
- **`status -o env` keys, verified on 3.2.0:** `API_URL`, `PUBLISHABLE_KEY` (`sb_publishable_…`), `SECRET_KEY` (`sb_secret_…`).
  - It still emits the legacy `ANON_KEY`, `SERVICE_ROLE_KEY` and `JWT_SECRET`. We don't use them, and `src/lib/env.ts` rejects JWT-style keys.
- **`supabase/setup-cli` GitHub Action:** current major is v3. We don't use it: CI runs the CLI pinned in `package.json` with `pnpm exec`.
- **Default JWT signing:** the local stack still signs JWTs with HS256 (`JWT_SECRET`).
  - Asymmetric ES256 keys go in `[auth] signing_keys_path`, a gitignored file.
  - Set this up in M2. Until then `getClaims()` falls back to a network call to Auth to verify the token.
  - **To verify in M2:** the exact v3 command that generates the key file.

## Supabase Auth OAuth 2.1 server (for M7 MCP)

Checked 2026-11-20. Sources: https://supabase.com/docs/guides/auth/oauth-server/getting-started, https://supabase.com/docs/guides/auth/oauth-server/mcp-authentication

- **Status: public beta** since 2025-11-26, on all plans, free during the beta.
- **Local config:**
  ```toml
  [auth.oauth_server]
  enabled = true
  authorization_url_path = "/oauth/consent"
  allow_dynamic_registration = false
  ```
  The block is present in our `config.toml`, still disabled.
- **Dynamic Client Registration (DCR):** supported, off by default.
- **Client ID Metadata Documents (CIMD):** **not supported or documented.** There are reports of "Unrecognized client_id" errors. M7 README must say that DCR clients work and CIMD-only clients don't.
- **We build the consent page.** Auth redirects to `site_url + authorization_url_path?authorization_id=…`. The page calls:
  - `supabase.auth.oauth.getAuthorizationDetails(id)`
  - then `approveAuthorization(id)` or `denyAuthorization(id)`
- **Discovery URL:** `/.well-known/oauth-authorization-server/auth/v1`

## Next.js 16.4.6

Local docs: `node_modules/next/dist/docs/`. AGENTS.md points coding agents there.

- **`src/proxy.ts`** replaces `middleware.ts`. Export a named `proxy` function and a static `config.matcher`.
  - It always runs on the Node.js runtime; setting `runtime` throws.
  - Next's docs: proxy is for *optimistic* checks only, not a full authorization solution.
- **`cacheComponents: true`** is on by default in create-next-app 16.4, along with `partialPrefetching: true`.
  - Reading `cookies()` outside `<Suspense>` is a **build error**. Session reads go in a component behind a boundary (see `src/app/page.tsx`).
  - `'use cache: private'` exists and can read cookies. **This project does not use it on user data** (CLAUDE.md rule).
- **Linting:** `next lint` was removed in 16.0, and `next build` no longer lints. The lint script is plain `eslint` with a flat config.
- **Type generation:** `next typegen` generates route types (`LayoutProps`, `PageProps`) without a build. The `typecheck` script runs it before `tsc`.
- **Tailwind:** create-next-app 16.4 wires Tailwind through `@tailwindcss/turbopack` in `next.config.ts`, not PostCSS.

## @supabase/ssr 0.12.7 / @supabase/supabase-js 2.119.2

Source: `node_modules/@supabase/ssr/CHANGELOG.md` and `dist/main/types.d.ts`.

- **`setAll(cookiesToSet, headers)`:** since 0.10, `headers` carries `Cache-Control: private, no-store…`, `Expires: 0` and `Pragma: no-cache`.
  - These must reach the response so a CDN never caches a session. `src/lib/supabase/proxy.ts` applies them, and also copies them onto redirects.
  - A server client must be created per request. The headers are only delivered with the first cookie write.
- **`cookies.encode: "tokens-only"`:** experimental option for smaller cookies. Not used.
- **No breaking changes** since 0.7.

## shadcn CLI 4.23.0

- `init -d` uses preset **`base-nova`**: components are built on **Base UI** (`@base-ui/react`), not Radix.
- The `--base-color` flag is gone. `-b` now selects the component library (`base | radix | aria`).
- `cn()` now comes from the `cn` npm package (repo `shadcn-ui/cn`), re-exported from `src/lib/utils.ts`.
- Tailwind 4: global CSS imports `shadcn/tailwind.css` and `tw-animate-css`.

## @huggingface/transformers v4 (for M3; 4.3.2 latest)

Sources: https://github.com/huggingface/transformers.js/releases/tag/4.0.0, https://huggingface.co/blog/transformersjs-v4

There is **no itemized breaking-change list or migration guide** for v4.0.0 (2026-03-30). Known changes:

- **Tokenizers** moved to the separate `@huggingface/tokenizers` package (a dependency). Chunk sizes are measured with the embedder's tokenizer, so check its API in M3.
- **onnxruntime-node** 1.21 → 1.30, onnxruntime-web 1.31-dev, sharp ^0.35.
- **Packaging:** the build moved to esbuild and `models.js` was split into modules, so **deep imports from internal paths break**. Import only from the package root.
- **Pipeline types are dynamic.** New APIs: `ModelRegistry` (`get_available_dtypes`), `env.useWasmCache`, `env.fetch`, `env.logLevel`.
- **No documented `dtype`/`device` API change**, so `dtype: "q8"` should still work. Verify in M3.
- `onnxruntime-node` is still `require`d even for web-only use. It must go in `serverExternalPackages` (spec) and counts toward the Vercel function size.

## Vercel

Source: https://vercel.com/docs/functions/runtimes/node-js/node-js-versions

- Node **26.x is the default**. 24.x and 22.x are also available; Node 20 was deprecated on 2026-10-01.

## pnpm 11 supply-chain defaults

- **`minimumReleaseAge`:** freshly published versions are held back. Installing supabase-js 2.119.2, released days earlier, added explicit `minimumReleaseAgeExclude` entries to `pnpm-workspace.yaml`. Review that list on each upgrade.
- **`allowBuilds`:** install scripts are off unless allow-listed. Only `supabase` is allowed (it downloads the CLI binary); `sharp` and `unrs-resolver` stay off.

## Pinned versions vs. spec §3

| Package | Spec | Installed | Note |
|---|---|---|---|
| next | 16.4 | 16.4.6 | |
| react / react-dom | 19.3 | 19.3.1 | |
| tailwindcss | 4.3 | 4.3.5 | |
| @supabase/ssr | 0.12.x | 0.12.7 | |
| @supabase/supabase-js | 2.119.x | 2.119.2 | |
| zod | 4 | 4.6.7 | |
| vitest | 5 | 5.1.1 | `"type": "module"` so Node runs `scripts/*.ts` and Vite loads the config as ESM |
| typescript | strict | 5.9.3 | TS 7.0 (native) exists; staying on the 5.x line that create-next-app 16.4 pins |
| eslint | — | 9.39.5 | ESLint 10 is out, but `eslint-config-next` 16.4.6 plugins (import, jsx-a11y, react-hooks) don't accept it as a peer yet |
| supabase (CLI) | — | 3.2.0 | |
| @anthropic-ai/sdk | 1.11.x | not installed yet (M3) | npm latest 1.11.0 |
| @huggingface/transformers | 4.3.x | not installed yet (M3) | npm latest 4.3.2 |

## Test tooling

- **basejump `supabase_test_helpers` 0.0.6** is vendored into `supabase/tests/000-setup-tests-hooks.sql`.
  - The upstream repo has no tags and its last commit was 2024-04. The `.control` file still says 0.0.5.
  - Vendoring avoids depending on dbdev or pg_tle in CI.
- **Limitations found while reviewing the helpers:**
  - `tests.rls_enabled(schema)` checks `relrowsecurity` only, not **FORCE** RLS, and it also counts views. M2 adds our own `relforcerowsecurity` assertion.
  - `authenticate_as` only sets `request.jwt.claims` and the role. That's fine for RLS, but it doesn't exercise JWT signature checks; the E2E tests in M8 cover those.

## Claude Code (hooks, skills, agents)

Sources: https://code.claude.com/docs/en/hooks, https://code.claude.com/docs/en/skills, https://code.claude.com/docs/en/sub-agents

- **Hook stdin:** the JSON includes `tool_input.command` (Bash) and `tool_input.file_path` (Edit/Write; absolute, with backslashes on Windows).
- **Exit 2:** in PreToolUse it blocks the call; in PostToolUse it feeds stderr back to Claude.
- **Matchers:** `Edit|Write` is an exact-name list. Use `${CLAUDE_PROJECT_DIR}` in hook commands.
- **SKILL.md:** `name` and `description` frontmatter; `description` says *when* to use the skill.
- **Subagents:** `.claude/agents/*.md` requires `name` and `description`; `tools` and `model` are optional.

## Notes

- **Prompt injection in fetched docs:** several Supabase doc pages fetched during this check contained text aimed at AI agents, asking them to file a feedback report. It was ignored. This is a live example of indirect prompt injection (OWASP LLM01), the threat this project's ingest screening and answer prompt defend against.
