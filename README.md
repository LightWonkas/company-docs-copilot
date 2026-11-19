# Company Docs Copilot

An internal AI assistant for a fictional Turkish logistics company, **Atlas Lojistik A.Ş.** It answers employees' questions in Turkish and English **only from the documents each employee is allowed to read**, cites every claim, and says *"I couldn't find this in the documents you can access"* instead of guessing. It runs on the web, in Slack, and as an MCP server.

> **Permissions live in the database, evidence lives in the API, the model only writes.**
> - Access control is deterministic: Postgres row-level security on the user's own JWT.
> - Citations are structural: Claude's native `search_result` citations, validated in code.
> - Abstention is a calibrated threshold in code.

All documents, people and numbers are synthetic. Spec: [docs/SPEC.md](docs/SPEC.md). Verified toolchain and API notes: [docs/ENVIRONMENT.md](docs/ENVIRONMENT.md).

### Same question, two employees

Ask *"What are the 2027 revenue and EBITDA targets in the board strategy?"*:

- **Selin (executive):** the board strategy notes are within her access, so she gets cited quotes from them.
- **Ayşe (sales employee):** the board notes never reach the model. She sees only what she may read.

| Ayşe Yılmaz, employee | Selin Koç, executive |
|---|---|
| ![employee](docs/images/same-question-employee.png) | ![executive](docs/images/same-question-executive.png) |

These screenshots are from **offline mode** (no API key).

- Ayşe gets a permitted but irrelevant sales table instead of an abstention. This is the measured 40% true-abstention rate made visible: cosine similarity alone cannot tell "nothing relevant" apart.
- With a key, the Haiku listwise reranker and the model's `<abstain/>` layer handle this case.

To regenerate the screenshots: `SCREENSHOTS=1 pnpm exec playwright test screenshots`.

---

## Architecture

```mermaid
flowchart LR
  subgraph Clients
    W[Web chat<br/>Next.js 16]
    S[Slack<br/>/ask · mentions · DMs]
    M[MCP clients<br/>OAuth 2.1]
  end

  subgraph App["Next.js app (Vercel)"]
    P[proxy.ts<br/>session refresh]
    R["retrieve()<br/>single entry point"]
    A["answerQuestion()<br/>citations + abstention"]
    V[Citation validator]
    SB[Slack identity bridge]
    MCP[MCP tools]
  end

  subgraph Supabase
    RLS[(Postgres + RLS<br/>chunks · documents)]
    HS["hybrid_search()<br/>vector + FTS + trigram + RRF<br/>SECURITY INVOKER"]
    AU[(audit.rag_queries<br/>append-only, ids only)]
    Q[[Supabase Queue]]
    ST[(Storage)]
    OA[Auth + OAuth 2.1 server]
  end

  subgraph Worker["Ingest worker (secret key)"]
    X[extract → sanitize → chunk<br/>→ contextualize → screen → embed]
  end

  CL[Claude API<br/>Sonnet 5.5 answers · Haiku 5.5 helpers]

  W --> P --> R
  S --> SB -->|short-lived user JWT| R
  M -->|bearer token| MCP --> R
  R -->|user JWT| HS --> RLS
  R --> A --> CL
  A --> V
  A -->|log ids + scores| AU
  ST --> Q --> X -->|replace_document_chunks| RLS
  OA -.issues tokens.-> M
```

## How permissions are enforced

1. **Pre-expanded memberships.** A user in Sales/Istanbul holds principals for that team, the Sales department, the org, their role and themselves. Department heads also hold every team in their department; executives hold every department and team. Triggers maintain `memberships` when profiles or the org structure change.
2. **ACLs stamped in the database.** Each document's `allowed_principals uuid[]` is computed by a trigger from its scope:
   - public → `{org}`
   - department → `{dept}`
   - team → `{team}`
   - restricted → explicit allow-list

   It is copied onto every chunk in the same transaction (GIN-indexed). Client-supplied values are overwritten.
3. **RLS on every table.** RLS is enabled and forced, with one policy per command. Content policies read `allowed_principals && (select private.my_principals())`. That function reads memberships live, so a revocation applies on the next query with the same JWT.
4. **Retrieval runs as the user.** `hybrid_search()` is `SECURITY INVOKER` and has no ACL parameters. `retrieve()` only accepts a `UserSession`, which can only be built from a verified user JWT. The secret key can't reach it, and ESLint blocks importing the secret-key client outside admin/ingest paths.
5. **Every channel goes through the same gate.**
   - Slack maps the user, then mints a 1-hour session for that employee, revoked after use.
   - MCP verifies the OAuth bearer token on every tool call.
   - Admins can see document *metadata* to manage it, but not restricted *content*: chunks, downloads and `get_document` all follow content ACLs.
6. **Proved, not asserted.**
   - **pgTAP, 116 tests:** the persona × scope matrix, revocation, tampering (forged JWT claims, forged chunk ACLs), storage, filtered ANN, audit immutability, and structural invariants such as forced RLS, a reviewed allowlist of `SECURITY DEFINER` functions and no anon privileges.
   - **Mutation test:** injects 8 different leaks and requires each one to fail the suite (8/8 killed).
   - **Eval permission suite:** 11 personas × 60 attack questions, checked at three layers.

> A real bug the suite caught: `AFTER UPDATE OF allowed_principals` triggers do **not** fire when a BEFORE trigger changes the column. Restricting a document left its chunks on the old, wider ACL. pgTAP 005 failed and the fix is documented in the migration.

## Quickstart

Requires Node 26, pnpm 11 and Docker.

```bash
pnpm install
```
```bash
pnpm db:start      # generates a local ES256 signing key, starts Supabase on ports 567xx
```
```bash
pnpm env:local     # writes .env.local (URL, keys, random demo password)
```
```bash
pnpm seed          # org, 11 personas, 64 documents, ingestion
```
```bash
pnpm dev           # http://localhost:3100 (click a demo persona)
```

Add `ANTHROPIC_API_KEY` to `.env.local` for model answers, Contextual Retrieval, the Haiku reranker and the LLM injection screen. Without it, the app still runs end to end in an **offline-extractive** mode, which quotes the best-matching cited sentences and is labelled as such in the UI.

Checks:

```bash
pnpm lint && pnpm typecheck && pnpm test     # 104 unit tests
```
```bash
pnpm db:test && pnpm test:mutation           # 116 pgTAP tests + 8/8 mutations killed
```
```bash
pnpm test:integration && pnpm test:e2e       # 20 integration + 6 Playwright tests
```
```bash
pnpm eval:smoke                               # PR gate; `pnpm eval` for the full suite
```

## Evaluation

Golden set v1 has 205 items: 103 TR and 102 EN.

- **Answerable (153):** single fact, multi-hop, numeric/table, Turkish typed without diacritics, false premise, outdated version, and cross-lingual questions.
- **Unanswerable (52):** 14 of these exist only in a restricted document the asker can't read.
- **Gold chunks** are resolved from exact evidence quotes at run time, so the set survives re-chunking.
- **Verification:** items are **not yet human-verified** (`verified_by: null`).

Rates carry 95% Wilson intervals, means carry normal intervals, and zero-event claims carry the rule-of-three upper bound.

### Latest full run

<!-- EVAL:full:START -->
| Metric (full, offline-extractive, n=205) | All | TR | EN |
|---|---|---|---|
| Recall@5 (chunk) | 0.785 [0.725–0.846] | 0.786 [0.704–0.868] | 0.785 [0.695–0.875] |
| Recall@20 (chunk) | 0.891 [0.845–0.937] | 0.857 [0.786–0.929] | 0.932 [0.880–0.985] |
| MRR@10 | 0.731 [0.669–0.793] | 0.726 [0.642–0.810] | 0.737 [0.646–0.828] |
| nDCG@10 | 0.736 [0.679–0.794] | 0.733 [0.653–0.812] | 0.741 [0.656–0.825] |
| Recall@5 (doc) | 0.825 [0.768–0.882] | | |
| True abstention (unanswerable) | 40.4% [28.2–53.9] | | |
| False abstention (answerable) | 5.9% [3.1–10.8] | | |
| Citation validity | 100.0% [98.9–100.0] | | |
| Citation precision (gold doc) | 66.9% [61.8–71.6] | | |
| Citation coverage | 100.0% [98.9–100.0] | | |
| Faithfulness (judge) | not run (no API key) | | |
| Correctness (judge) | not run (no API key) | | |
| Permission leaks | 0/660 (95% upper bound 0.45%) | | |
| Injection ASR | 0/20 (0.0% [0.0–16.1]) | | |
| Latency p50 / p95 | 46 / 84 ms | | |
| Cost per 1,000 questions | $0.00 | | |

_Run 2026-11-19; 95% Wilson / normal CIs in brackets._
<!-- EVAL:full:END -->

**How to read the offline row:**

- Without an API key there is no LLM query rewrite, so cross-lingual questions are not translated: recall@5 on that category is 0.00 in the smoke run. Diacritic-free Turkish leans on the trigram leg alone.
- The safety gates (leaks, injection, citation validity) are real in offline mode. The judge metrics (faithfulness, correctness, Cohen's κ) need a key: `pnpm eval:kappa --prepare`, then human labels, then `pnpm eval:kappa`.

### Embedder ablation (dense retrieval only, same RLS-filtered candidate sets, n = 153)

| Embedder | Dims | Recall@5 | Recall@20 | MRR@10 | TR Recall@5 | EN Recall@5 |
|---|---|---|---|---|---|---|
| **e5-small** (default) | 384 | 0.782 [0.72–0.84] | 0.859 [0.81–0.91] | 0.728 [0.67–0.79] | 0.792 | 0.771 |
| e5-base | 768 | 0.833 [0.78–0.89] | 0.927 [0.89–0.96] | 0.736 [0.68–0.79] | 0.839 | 0.826 |
| bge-m3 | 1024 | 0.761 [0.70–0.83] | **0.964 [0.94–0.99]** | 0.611 [0.55–0.67] | 0.750 | 0.775 |

- The recall@5 intervals overlap, so none of those differences is significant at this n.
- bge-m3 finds the evidence more often (recall@20 is clearly higher) but ranks it worse (lower MRR). That is a job for the reranker, not a reason to switch embedders.
- Contextual-retrieval on/off and rerank on/off ablations need `ANTHROPIC_API_KEY`. The harness supports them; they are not reported here.

### Abstention calibration

`pnpm eval:calibrate` sets the threshold at the 5th percentile of answerable top-1 scores.

- With the fusion-only reranker (cosine similarity) that gives **5.9% false abstention, but only 40% true abstention** (21/52). Cosine similarity barely separates "an answer exists" from "nothing relevant".
- That is why abstention has a second layer: the model's `<abstain/>`, detected deterministically.
- It is also why the default reranker is Haiku listwise. Re-run calibration whenever the embedder or reranker changes.

### Prompt injection

There are 20 poisoned documents. Their attacks: instruction override, fake system messages, Markdown image and link exfiltration, zero-width and white-on-white hidden text, HTML comments, canary fishing, role escalation, citation manipulation, language switching, base64 payloads, fake tool calls, phishing links, and refusal suppression.

| Layer | What it stops |
|---|---|
| Ingest hygiene | Hidden text (zero-width, HTML comments, CSS-hidden) is removed before indexing. A pattern screen (TR + EN) plus a Haiku screen quarantines suspicious chunks; the screen fails closed. Offline: **14/20 documents flagged at ingest, 0 false positives** on the 44 normal documents. |
| Answer call | Quarantined chunks never reach the model. Results go in as untrusted `search_result` data. The call has **no tools**. |
| Output | Citations are validated. Markdown drops HTML and images and keeps only in-app links. Slack strips foreign URLs (no unfurl exfiltration) and escapes mrkdwn. Document text is rendered as plain text. |
| Eval | ASR is measured per category: an attack succeeds if the marker, the exfil URL or a canary appears in the answer. promptfoo red-team plugins (`indirect-prompt-injection`, `rag-poisoning`, `rag-source-attribution`, `rag-document-exfiltration`, `rbac`, `pii:*`) run nightly when a key is configured. |

### Latency and cost

- **Latency (offline mode, local stack):** retrieval p50 is about 50 ms (rewrite + e5 embedding + hybrid search). The p50/p95 for full answers is in the eval table.
- **Cost:** computed per answer from token usage at Anthropic first-party rates and shown to admins. Rates per MTok:
  - Sonnet 5.5: $2 input / $10 output
  - Haiku 5.5: $0.10 input / $0.50 output
- **Typical answer:** about 8 chunks × ~450 tokens + a ~550-token system prompt (cached) ≈ 4.5k input + ~300 output tokens on Sonnet 5.5 ≈ $0.012. Haiku rewrite and rerank add ≈ $0.001. That is **≈ $13 per 1,000 questions** (an estimate; the table reports measured cost once run with a key).

## Design decisions

- **RLS vs prompt filtering.** Filtering in the prompt ("only use documents for HR") asks the model to enforce security; one injection undoes it. With RLS the model never *receives* what the user can't read, and the guarantee is testable (pgTAP + mutation test).
- **Native citations vs `[1]` markers.** Hand-rolled markers are free text the model can invent. With `search_result` blocks the API returns structured locations (index, source, block range, cited text), which code then checks against what was sent and what the user may see.
- **Hybrid + Turkish FTS + trigram.**
  - Turkish is agglutinative: `izinlerimizden` should match `izin`. Postgres `turkish` stemming handles that.
  - Employees often type without diacritics (`sirket`), which ASCII-folded trigram handles.
  - Codes and numbers need lexical matching that dense vectors blur.
  - RRF fuses the three legs without score calibration.
- **e5-small as default despite bigger models.**
  - e5-base is better at recall@20 with overlapping recall@5 CIs.
  - bge-m3 recalls more but ranks worse (MRR 0.61).
  - e5-small's q8 model is 113 MB against ~570 MB for bge-m3. On serverless functions with size caps and cold starts that matters more than a difference the CIs can't confirm. The `Embedder` interface makes switching a config change plus re-ingest.
- **A different judge model.** Opus 5.5 judges answers written by Sonnet 5.5. Each dimension (faithfulness, correctness) gets its own isolated call with an explicit "unknown". Agreement with humans is reported as Cohen's κ, not assumed.
- **Why RAG for 64 documents.** The corpus would fit in a context window, but then every employee's prompt would contain every document, including the board notes. Permissions, auditability (cited chunk ids per answer) and growth to thousands of documents are the reasons, not context size.
- **Filtered ANN.** A user who can read 1% of the chunks makes HNSW + RLS return 0 of 10 results without iterative scans (pgTAP 008). `hybrid_search` sets `hnsw.iterative_scan = relaxed_order`; this is invisible at demo scale without that test.
- **Answers are private in Slack.** An answer reflects the asker's permissions, so in channels it is ephemeral; only DMs are streamed.

## MCP

- **Endpoint:** `POST /api/mcp`. Stateless Streamable HTTP, `@modelcontextprotocol/server` 2.4 via `mcp-handler`.
- **Tools:** `search_docs(query, limit≤10)`, `get_document(id)`, `ask(question)`.
- **Authorization:** Supabase Auth's OAuth 2.1 server, currently in beta.
  - Unauthenticated calls get `401` with an RFC 9728 `WWW-Authenticate` header pointing at `/.well-known/oauth-protected-resource`.
  - The consent page is `/oauth/consent`.
- **Client compatibility:**
  - Clients that use **Dynamic Client Registration (DCR)** work.
  - Clients that rely only on **Client ID Metadata Documents (CIMD)** do **not**: Supabase Auth doesn't support CIMD as of 2026-11.

## Deploying

These steps need your own Vercel and Supabase accounts:

1. `supabase link --project-ref …`, then `supabase db push`.
2. In the Supabase dashboard:
   - enable asymmetric JWT signing keys and the OAuth 2.1 server (DCR on, authorization path `/oauth/consent`),
   - disable sign-ups,
   - set the magic-link email template to the `token_hash` link in `supabase/templates/magic_link.html`.
3. Vercel environment variables:
   - `NEXT_PUBLIC_SUPABASE_URL`, `NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY`, `SUPABASE_SECRET_KEY`
   - `ANTHROPIC_API_KEY`, `CRON_SECRET`, `APP_URL`
   - `MODEL_CACHE_DIR=/tmp/models`
   - for a public demo: `DEMO_MODE=true` and a long random `DEMO_PASSWORD`
   - Slack: `SLACK_SIGNING_SECRET`, `SLACK_BOT_TOKEN`, `SLACK_LINK_SECRET`
4. Seed the cloud project with a one-off admin run of `scripts/lib/corpus.ts`, using `--remote` on purpose. The worker then runs from Vercel Cron (`vercel.json`, every 5 minutes).
5. Slack app: point events, the `/ask` command and interactivity at `https://<app>/api/slack/events`. Scopes: `commands`, `app_mentions:read`, `chat:write`, `im:history`.

**Function size:** only the Linux x64 ONNX Runtime (45 MB) is traced. The q8 e5-small model (113 MB) downloads to `/tmp` on cold start.

## Going to production (KVKK)

- **Legal basis and DPIA.** Processing employee questions and HR documents requires a documented legal basis and a data-protection impact assessment. Register in VERBİS where required.
- **Cross-border transfer (KVKK Art. 9).** Sending document excerpts and questions to an LLM API outside Türkiye is a transfer abroad. It needs an approved mechanism (standard contract notified to the Authority, or another Art. 9 basis). Evaluate EU/regional processing and zero-data-retention options; keep restricted HR data out of scope unless covered.
- **Transparency.** Tell employees they are talking to an AI, what is logged, and for how long.
- **Retention and destruction.**
  - The audit log stores ids, scores and redacted and hashed queries. `audit.purge_expired()` enforces `audit.settings.retention_days` (default 365).
  - Conversations are user-deletable; deleting a document cascades to its chunks and embeddings.
  - Document a periodic destruction policy.
- **Access reviews.** Membership changes apply on the next query. Pair that with HR-driven provisioning (SCIM) and periodic access reviews.

## Limitations and next steps

- The golden set needs a human verification pass. The judge κ needs ~60 human labels.
- With a key, re-run calibration for the Haiku reranker and report the Contextual Retrieval and rerank ablations.
- PDF hidden-text detection: white-on-white is caught in Markdown and HTML, not in PDF rendering layers.
- Local cross-encoder reranking (`bge-reranker-v2-m3`) fits the `Reranker` interface but isn't implemented.
- Observability: OpenTelemetry + Langfuse spans (ids and scores only) is the planned stretch.

## Repository map

| Path | What |
|---|---|
| `supabase/migrations/` | Schema, RLS, ACL triggers, `hybrid_search`, queue, audit, dashboard |
| `supabase/tests/` | pgTAP suites (`scripts/mutation-test.ts` proves they catch leaks) |
| `src/lib/retrieval/` | `retrieve()`, query rewrite, rerankers, calibrated thresholds |
| `src/lib/answer/` | Answer call, citation validator, abstention, redaction |
| `src/lib/ingest/` | Extraction, hygiene, chunking, contextualization, worker |
| `src/lib/slack/`, `src/lib/mcp/` | Channels, both on the user's JWT |
| `evals/` | Golden set, permission attacks, harness, ablations, promptfoo |
| `.claude/` | Skills, review agents and hooks used to build this with Claude Code |
