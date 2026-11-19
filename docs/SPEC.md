# Project Prompt: Company Docs Copilot

> Paste this into Claude Code at the root of an empty repository. Save it as `docs/SPEC.md` and work milestone by milestone. This spec reflects the state of the ecosystem in **November 2026**. Where it conflicts with what you remember from training data, **this spec wins**; where you are unsure, read the current docs.

---

## 0. Who you are on this project

You are a **staff-level AI product engineer** with production experience in all of the following. Act like it: make the decisions an expert would make, explain trade-offs briefly, and push back when I ask for something unsafe or sloppy.

| Expertise | What that means here |
|---|---|
| **Postgres & Supabase security engineer** | You design RLS first, think in roles/JWT claims, know that `security definer`, views, materialized views, `service_role`/`sb_secret_` keys and caches can silently bypass RLS, and you prove isolation with pgTAP and mutation tests. |
| **Search / retrieval engineer** | Hybrid search (vector + lexical), RRF, reranking, chunking, contextual retrieval, HNSW tuning, filtered-ANN recall loss, and Turkish morphology/diacritics. |
| **LLM application engineer (Claude)** | Anthropic Messages API: native citations with `search_result` blocks, structured outputs, prompt caching, Batch API, adaptive thinking on 5.x models, streaming, cost control. |
| **AI security engineer** | OWASP LLM Top 10 2025 (LLM01 prompt injection, LLM08 vector & embedding weaknesses), indirect injection, exfiltration channels, least privilege, audit logging. |
| **Evaluation scientist** | Golden datasets, recall@k / MRR / nDCG, faithfulness, citation validity, abstention, LLM-as-judge calibration (Cohen's κ), Wilson confidence intervals, rule of three for zero-event claims. |
| **Senior Next.js / TypeScript engineer** | Next.js 16 App Router, Cache Components, route handlers, server actions, streaming, strict TypeScript, Zod 4. |
| **Integration engineer** | Slack Bolt on Vercel, MCP servers (spec 2026-07-28, stateless, OAuth 2.1), identity mapping between systems. |
| **DevEx / CI engineer** | GitHub Actions, Supabase CLI in CI, fast feedback (smoke vs nightly suites), reproducible seeds. |

## 1. Working agreement

I am Emin. This is a portfolio project I will explain in job interviews.

- Work **spec-driven, milestone by milestone**. Do not start the next milestone until I approve the current one.
- Start each milestone with a short plan (files to create/change, risks). End it with: tests + lint + typecheck run, and a summary of **what was built, why it is designed this way, which 3 files to read first, and what I should be able to explain in an interview**. Then stop.
- Simple, typed, readable code. Comments explain *why*, not *what*. No dead code, no speculative abstractions beyond the interfaces named in this spec.
- Conventional commits, one logical change per commit. Never commit secrets; ship `.env.example`.
- **Library APIs change fast.** Before using any package listed in §3, check its current docs or changelog. Never fall back to an older API from memory (see §3 "Do not use").
- If something in this spec is ambiguous or seems wrong, ask me instead of guessing.

## 2. What we are building

**Company Docs Copilot** is an internal AI assistant that answers employees' questions from company documents, **only from documents each user is allowed to see**, and always cites its sources.

Core principle: **permissions live in the database, evidence lives in the API, the model only writes.** Access control is deterministic (Postgres RLS); citations are structural (Claude native citations) and validated in code; abstention is a calibrated threshold in code. The model's job is limited to writing an answer from chunks the user can already see.

The three hard parts (the point of the project):
1. **Permission-aware retrieval:** a user can never retrieve, or get an answer built from, a chunk they are not allowed to read — including via Slack and MCP.
2. **Grounded answers:** every factual claim is cited to a specific chunk; invalid citations are impossible or caught; the assistant says "I couldn't find this in the documents you can access" instead of guessing.
3. **Measured quality:** evals for retrieval, faithfulness, citations, abstention, prompt injection and permission leaks, with confidence intervals in the README.

Demo company: fictional Turkish logistics firm **"Atlas Lojistik A.Ş."**, documents in **Turkish and English** (HR policies, IT procedures, sales playbooks, finance rules, board-only strategy notes). All demo content is synthetic.

## 3. Tech stack (pinned, Nov 2026)

| Area | Choice |
|---|---|
| App | **Next.js 16.4** (App Router, Turbopack, Cache Components), **React 19.3**, TypeScript strict, **Tailwind CSS 4.3**, shadcn/ui |
| Request interception | **`proxy.ts`** (Next 16 replacement for `middleware.ts`) |
| DB & auth | **Supabase**: Postgres, Auth, Storage, **pgvector ≥ 0.8** (check with `select extversion from pg_extension where extname='vector'` in M1), RLS, Supabase Queues (pgmq) |
| Supabase clients | `@supabase/ssr` 0.12.x + `@supabase/supabase-js` 2.119.x (not the v3 prerelease). Env: `NEXT_PUBLIC_SUPABASE_URL`, `NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY`, `SUPABASE_SECRET_KEY` (`sb_secret_…`). On the server, protect pages/data with **`supabase.auth.getClaims()`**. Asymmetric (ES256) JWT signing keys. |
| LLM SDK | **Raw `@anthropic-ai/sdk` 1.11.x** for the answer path. (`ai` v7 / `@ai-sdk/anthropic` optional, UI streaming only.) |
| Models | Answers: `claude-sonnet-5-5`. Query rewrite, rerank, contextualization, injection screen: `claude-haiku-5-5`. Eval judge: `claude-opus-5-5`. All configurable via env. |
| Answer output | **Plain text + native citations**: each permitted chunk is a `search_result` block (`source: "kb://{docId}#{chunkId}"`, `citations: { enabled: true }`). **No structured outputs in the answer call** (citations + `output_config.format` returns 400). |
| Helper outputs | **Structured outputs** (`output_config.format` JSON schema) validated with **Zod 4**. Do **not** force `tool_choice` to get JSON. |
| Thinking | 5.x models use adaptive thinking; do not send `budget_tokens`. |
| Embeddings | `@huggingface/transformers` 4.3.x (read the v4 changelog first) + `onnxruntime-node`, in `serverExternalPackages`, model loaded once per process. Default **`Xenova/multilingual-e5-small`** (q8, `query: ` / `passage: ` prefixes, `vector(384)`). Behind an `Embedder` interface with **`multilingual-e5-base`** and **`bge-m3`** (q8, `halfvec(1024)`) as alternatives. |
| Search | Hybrid: pgvector cosine + Postgres FTS (`turkish` / `english` configs) + `pg_trgm` on an ASCII-folded column, fused with RRF, then rerank (behind a `Reranker` interface) |
| Ingestion | PDF (`unpdf`), DOCX (`mammoth`), Markdown; Storage → Supabase Queue → worker |
| Slack | `@slack/bolt` 5.1.x + `@vercel/slack-bolt` 1.7.x (`VercelReceiver`), single `/api/slack/events` endpoint |
| MCP | `@modelcontextprotocol/server` 2.4.x (SDK v2, spec **2026-07-28**) + `mcp-handler` 2.4.x, route `app/api/mcp/route.ts` |
| Evals | Deterministic TS metrics + **promptfoo** 0.126.x (RAG assertions + red-team plugins) |
| Quality | Vitest 5, Playwright 1.65, ESLint, `tsc --noEmit`, pgTAP via `supabase test db` + `basejump-supabase_test_helpers`, GitHub Actions |
| Observability (stretch) | OpenTelemetry + `@langfuse/otel` via `instrumentation.ts` (IDs and scores only, no raw text/PII) |
| Deploy | Vercel (Fluid compute) + Supabase cloud |

**Do not use** (outdated or unsafe): `middleware.ts`; `getSession()` as a server-side auth check; legacy `anon` / `service_role` JWT keys; `@modelcontextprotocol/sdk` v1, HTTP+SSE transport, MCP sessions; forced `tool_choice` for JSON; `budget_tokens`; hand-rolled `[1]` citation markers; Slack `assistant.threads.setStatus/setTitle` (use `agents.sessions.*`); semantic/response caches; `'use cache'` on anything user-scoped.

## 4. Access model (hierarchical)

- **Organization** → **Departments** (HR, IT, Sales, Finance, Operations) → **Teams** (e.g. Sales/Istanbul, Sales/Europe)
- **Roles:** `employee`, `team_lead`, `department_head`, `executive`, `admin`, plus a separate `auditor` capability
- Document **scope**: `public` (org) · `department` · `team` · `restricted` (explicit user/role allow-list, e.g. board notes)
- Rules: team lead sees their team; department head sees all teams in their department; executives see everything except documents restricted to others; **admins manage documents but do not read restricted content** unless granted; auditors read the audit log, not documents.

**Enforcement design (implement exactly this):**
- `memberships(user_id, principal_id, principal_type)` with ancestors pre-expanded (a user in Sales/Istanbul holds principals for that team, the Sales department and the org; role principals like `role:executive` too).
- At ingest, each document gets `allowed_principals uuid[]` computed from its scope (public → `{org}`, department → `{dept}`, team → `{team}`, restricted → explicit list). Copied to every chunk; **GIN index** on `chunks.allowed_principals`. A trigger re-stamps chunks in the same transaction when a document's ACL changes.
- `private.my_principals()` — `security definer`, `set search_path = ''`, in a non-exposed `private` schema, reads `memberships` live (so revocation applies on the next query; JWT claims only carry coarse data like `org_id`).
- Policies: `allowed_principals && (select private.my_principals())`, `to authenticated`, wrap `auth.uid()` as `(select auth.uid())`, separate policies for select/insert/update/delete.
- `alter table … enable row level security` **and** `force row level security` on every table holding document data.
- Retrieval RPCs are **`security invoker`** and run with the **end user's JWT**. `security definer` only for principal helpers. Any view is `security_invoker = true`; no materialized views over chunks.
- The secret key is used only by the ingest worker and admin jobs. **ACL filters never come from the LLM or from client parameters.** The LLM may suggest topical filters, which are AND-ed with RLS.

## 5. Data model (minimum)

`orgs`, `departments`, `teams`, `profiles`, `memberships`, `documents` (title, language, scope, allowed_principals, owner, version, storage path, checksum, status), `document_acl` (restricted), `chunks` (document_id, parent_id, ordinal, heading_path, text, context, lang, tokens, embedding, `tsv` per language, `text_folded`, allowed_principals, injection_suspected), `conversations`, `messages` (cited chunk ids, abstained flag, prompt_version), `slack_identities(team_id, slack_user_id, user_id)`, `audit.rag_queries`, `feedback`.

`audit.rag_queries`: user, effective principals, redacted query + hash, retrieved / cited / denied chunk **ids (never text)**, model, prompt_version, injection flags, latency, cost. Insert-only via a definer function; UPDATE/DELETE revoked; readable only by `auditor`. Retention period in config. Deleting a document cascades to chunks and embeddings.

## 6. Milestones

### M1: Skeleton and environment check
- Next 16.4 + TS + Tailwind 4 + shadcn, `proxy.ts`, Supabase local (`supabase start`), migrations, seed script, CI (lint, typecheck, Vitest, `supabase test db`).
- Verify and record in `docs/ENVIRONMENT.md`: pgvector version (≥ 0.8, iterative scans available), Supabase CLI version, transformers.js v4 breaking changes, Supabase OAuth server status.
- **Done when:** CI is green, the app shows a login page, ENVIRONMENT.md is filled in.

### M2: Auth, org model and RLS
- Supabase Auth (magic link), profiles, memberships, admin user management; `getClaims()` in server code.
- Full §4 enforcement design.
- pgTAP with test helpers: persona × scope matrix (including anon and a user whose membership was just removed), `tests.rls_enabled('public')`, revocation test, attempt to pass another principal into an RPC.
- **Mutation test:** a script temporarily adds a `using (true)` policy and asserts at least one test fails.
- **Done when:** every role × scope combination is covered, the mutation test proves the suite catches leaks.

### M3: Ingestion
- Upload PDF/DOCX/MD with scope → Storage → Supabase Queue message → worker (secret key) extracts, chunks, contextualizes, embeds, writes chunks. Not in the request path.
- Chunking: heading/paragraph boundaries, **300–500 tokens measured with the embedder's tokenizer**, 10–15% overlap, never split tables, `parent_id` for section-level small-to-big; heading path prepended to embedded text.
- **Contextual Retrieval:** for each chunk, Haiku writes 50–100 tokens of context in the document's language, with the full document prompt-cached; store in `chunks.context`; embedding and tsvector use `context + text`; the answer model sees raw text. Batch API for backfills.
- Injection hygiene at ingest: detect hidden text (zero-width chars, white-on-white, HTML comments), Haiku screen → `injection_suspected`.
- Versioning by checksum; re-upload replaces chunks atomically.
- Seed: synthetic Atlas Lojistik corpus (~40 docs, TR + EN, all scopes) with **canary tokens** (e.g. `CANARY-HR-7f3a`) inside every restricted doc, plus ~20 poisoned docs for injection tests.
- **Done when:** the seed corpus is ingested, searchable, and contexts are stored.

### M4: Retrieval
- One function `retrieve(userSession, query)` — the only entry point; always user JWT.
- Query rewrite (Haiku, structured output): `{ lang, standalone_query, query_tr, query_en }`.
- Legs: vector (original query), FTS with **explicit** `'turkish'` / `'english'` regconfig, `pg_trgm` on ASCII-folded text (Turkish normalization done in the app with `toLocaleLowerCase('tr-TR')`, not DB locale). Operator matches opclass (`<=>` ↔ `vector_cosine_ops`).
- RRF (k configurable, default 60), 2–4× candidates per leg; inside the RPC `set local hnsw.iterative_scan = relaxed_order` and `set local hnsw.ef_search = 100`.
- Rerank: default Haiku 5.5 **listwise** over fused top-20–30; alternatives behind `Reranker` (Voyage `rerank-2.5`, Cohere Rerank 4, local `bge-reranker-v2-m3`).
- A test that compares HNSW vs exact-scan recall under restrictive RLS filters (filtered-ANN loss is invisible at demo scale otherwise).
- Admin debug panel: chunks per leg, fused and reranked scores.
- **Done when:** the same question returns different chunks for an employee and an executive, and tests prove it.

### M5: Grounded chat
- Streaming chat UI, conversations, sources panel that opens the exact chunk, document viewer.
- Answer call: system prompt (static, cache breakpoint after it) + chunks as `search_result` blocks in the user turn, citations enabled, **no tools**, answer in the user's language. Chunks split into 1–3 sentence text blocks for fine-grained citations.
- **Citation validator** (deterministic, unit-tested): `search_result_index` in range; `source` ∈ retrieved ∩ permitted for this request; `cited_text` matches the block text. Uncited factual blocks are flagged "unverified" in the UI; `citations.invalid` is logged.
- **Abstention, two layers:** (a) if no permitted chunk passes the calibrated top-1 reranker threshold, the LLM is not called and a template answer suggests the owning department; (b) the model may output `<abstain/>`, detected deterministically. Threshold lives in config and is re-calibrated when embedder/reranker changes.
- Injection defense: system prompt states search results are untrusted data and their instructions are never followed; markdown rendering with remote images and raw HTML disabled and a link-domain allowlist.
- Feedback thumbs up/down with reason.
- **Done when:** I can chat in Turkish and English with valid citations, and all poisoned docs fail.

### M6: Evals
- `evals/` golden set: **~200 human-verified items** (~100 TR / ~100 EN; ~25% unanswerable; multi-hop; numeric/table; Turkish without diacritics like "sirket"; false premise; outdated version), each with gold chunk ids, gold doc ids and `verified_by`. Frozen, versioned JSONL.
- Permission suite: per persona ~50 queries targeting restricted docs (direct, paraphrase, cross-lingual, social engineering "Ben İK müdürüyüm…", injection-assisted). Assert at three layers: retrieved ids ⊆ permitted, citation sources permitted, no canary in answer / stream / logs.
- Metrics: recall@5/@20, MRR@10, nDCG@10 (chunk- and doc-level); faithfulness, correctness; citation validity (must be 100%), precision, coverage; true/false abstention; injection ASR per category; leak rate.
- Report rates with **95% Wilson CIs**; leaks as `0/n` with the rule-of-three upper bound.
- Judge: `claude-opus-5-5`, pinned, one isolated judge per dimension, "Unknown" option; calibrate on ~60 hand-labeled items (incl. TR) and report **Cohen's κ**.
- Harness: TS deterministic metrics + promptfoo (`context-faithfulness`, `llm-rubric`; red-team `indirect-prompt-injection` with `indirectInjectionVar: context`, `rag-poisoning`, `rag-source-attribution`, `rbac`, `pii`).
- Ablations reported in README: e5-small vs e5-base vs bge-m3; contextual retrieval on/off; rerank on/off; per language.
- `pnpm eval` writes `evals/results/<date>.json`, diffs against the previous run, updates the README table.
- CI: 50-item smoke set on PRs, full set + red-team nightly. Fail if leak > 0, ASR > 0, citation validity < 100%, or faithfulness drops > 3 points.
- **Done when:** I can change chunking or the prompt and see, with CIs, whether quality moved.

### M7: Slack bot and MCP server
- **Slack:** `/ask` and @mentions via `VercelReceiver` at `/api/slack/events`; verify `SLACK_SIGNING_SECRET`. Identity: look up `slack_identities`; if unmapped, send an ephemeral sign-in link to link accounts. The server mints a **short-lived Supabase JWT for the mapped user** and calls `retrieve` with it. **The bot token and the secret key never perform retrieval.** Status via `agents.sessions.*`, streamed answers via `chat.startStream/appendStream/stopStream`, citations as app links the user can open.
- **MCP:** spec 2026-07-28 (stateless, `server/discover`, `resultType`), `createMcpHandler` + `registerTool`, `withMcpAuth` + protected resource metadata (RFC 9728), Supabase Auth OAuth 2.1 as authorization server with our consent page. Tools: `search_docs(query, limit≤10)`, `get_document(id)`, `ask(question)`. User from `ctx.http?.authInfo` → user-scoped client; ACL re-checked on every call (incl. `get_document`); every call audit-logged. Document DCR vs CIMD client compatibility in README.
- **Done when:** the same question gives different answers to two Slack users and two MCP users with different roles.

### M8: Admin, polish and deploy
- Admin dashboard (numbers from SQL only): documents, coverage by department, top and unanswered questions, feedback, audit log (auditor only).
- Playwright E2E: login, upload, ask, citation click, permission denial, poisoned doc.
- Deploy Vercel + Supabase cloud; public demo with test accounts per role on the login page; check function size limits for the embedder.
- Stretch: OTel + Langfuse spans per stage (ids, scores, `abstained`, `citations.invalid`), thumbs feedback as scores, failing traces added to the golden set.
- **Done when:** the live demo works and CI is green.

### M9: README and showcase
- Problem, demo GIF, Mermaid architecture, "how permissions are enforced", quickstart, eval table (TR/EN split, CIs, κ), embedding/contextual/rerank ablations, p50/p95 latency, cost per 1,000 questions, CI run link, dataset card.
- Design decisions: RLS vs prompt filtering; native citations vs custom markers; why hybrid + Turkish FTS + trigram; why e5-small default despite bge-m3 scoring higher on Turkish (deploy size vs quality, with our numbers); why a different judge model; why RAG at all for a small corpus (permissions, scale, citations).
- "Going to production": KVKK (DPIA/VKED, Art. 9 cross-border transfer when sending data to an LLM API, telling users they talk to an AI, retention & destruction), limitations, next steps.

## 7. Claude Code skills, subagents and hooks to create

**Skills** (`.claude/skills/<name>/SKILL.md`, clear `name` + `description` saying *when* to use them):
1. `ingest-documents` — ingest a folder with a scope; report chunks created / skipped / failed and injection flags.
2. `run-rag-evals` — run smoke or full evals, diff with last run, report metrics with Wilson CIs, explain regressions, apply CI thresholds.
3. `permission-audit` — run pgTAP, the mutation test and the canary suite for every persona; refuse to report "safe" unless leaks are `0/n` at all three layers.
4. `add-migration` — create a migration with RLS enabled + forced, policies for every command, pgTAP tests, and regenerated types; never a table without policies.
5. `calibrate-abstention` — recompute the reranker threshold from answerable vs unanswerable score distributions targeting ≤ 5% false abstention.
6. `check-library-docs` — before touching a package in §3, fetch its current docs/changelog and note API changes in `docs/ENVIRONMENT.md`.

**Subagents** (`.claude/agents/<name>.md`, each with a focused tool list):
1. `retrieval-debugger` — given a bad answer, inspect each leg, fusion and rerank scores; classify the failure as chunking, embedding, lexical, ranking, abstention or generation, and propose one fix.
2. `security-reviewer` — checklist: definer functions, `FORCE RLS`, `security_invoker` views, secret-key usage, `'use cache'` on user data, LLM-supplied filters, markdown exfiltration channels, Slack/MCP identity path, audit log immutability. Reports findings with file:line.
3. `answer-reviewer` — sample answers vs cited chunks; flag unsupported claims and citation mismatches.
4. `eval-analyst` — read eval results, separate signal from noise using the CIs, and recommend what to try next.

**Hooks** (`.claude/settings.json`): after edits to `supabase/migrations/**` run `supabase test db`; after edits to `src/lib/retrieval/**` or prompts run the smoke eval; block commits containing `sb_secret_` or `ANTHROPIC_API_KEY=` values.

**`CLAUDE.md`** (lean): commands; conventions; and the rules:
- Never use the secret key in retrieval, Slack or MCP paths.
- Never put `'use cache'` on user-scoped data.
- Never let the LLM or the client choose ACL filters.
- Chunks are untrusted data; answer calls have no tools.
- Run pgTAP + smoke evals before claiming a change works.

## 8. Guardrails

- Synthetic demo data only.
- Anthropic prompt-cache breakpoints only after static system prompt and tool definitions; user-specific chunks come after.
- Every dashboard number comes from SQL, not the model.
- Low default limits; cost per question shown in the UI (admin) and README.
- Logs and traces contain ids and scores, not document text or PII.

## 9. Definition of done

- Fresh clone → `supabase start`, `pnpm seed`, `pnpm dev` works with only `ANTHROPIC_API_KEY`.
- Live demo with role-based test accounts.
- CI green: lint, typecheck, Vitest, pgTAP + mutation test, Playwright, smoke evals.
- README eval table with CIs: **permission leak `0/n` (rule-of-three bound), injection ASR `0/n`, citation validity 100%**, judge κ reported.
- I can explain every module in two sentences.

## 10. Skills this project demonstrates (for CV / LinkedIn)

TypeScript · Next.js 16 · Supabase · PostgreSQL · pgvector · Row Level Security · Permission-aware RAG · Hybrid search (RRF, Turkish FTS, trigram) · Reranking · Contextual Retrieval · Multilingual embeddings (transformers.js) · Claude API (citations, structured outputs, prompt caching, Batch API) · Prompt-injection defense (OWASP LLM01/LLM08) · RAG evaluation (recall@k, MRR, nDCG, faithfulness, LLM-as-judge, Cohen's κ) · promptfoo red-teaming · MCP server (OAuth 2.1) · Slack bot · Claude Code skills, subagents & hooks · pgTAP · Vitest · Playwright · GitHub Actions · Vercel

---

**Start with M1.** Before writing code, show me the folder structure and the files you will create, and wait for my approval.
