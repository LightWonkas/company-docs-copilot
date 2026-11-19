---
name: ingest-documents
description: Use when asked to add, upload or (re)ingest documents from a folder with a given scope (public, department, team or restricted). Uploads them as the admin job does, runs the ingest worker, and reports chunks created/skipped/failed and injection flags.
---

# Ingest documents

Documents normally arrive through the admin UI (`/admin/documents`), which runs on the admin's own JWT. For bulk loads from a folder:

1. Confirm the target: local stack only. `scripts/lib/local.ts` refuses other hosts unless `--remote` is passed explicitly.
2. Confirm the scope with the user:
   - `public`
   - `department` + department slug
   - `team` + team slug
   - `restricted` + an explicit list of `role:<key>` / `user:<persona>` principals
   Never guess a scope. A wrong scope is a permission leak.
3. Add entries to a manifest in the shape of `seed/corpus/manifest.json` and upload with `uploadCorpus` (see `scripts/lib/corpus.ts`), or upload through the UI. Supported formats: `.md`, `.pdf`, `.docx`.
4. Run `pnpm ingest:worker` (drains the Supabase Queue). Without `ANTHROPIC_API_KEY` there is no Contextual Retrieval and only the pattern injection screen runs. Say so.
5. Report per document: chunks created, status (`ready` / `failed` with error), and `injection_flags`.
   - Documents with `hidden:*` flags tried to hide text, which was removed before indexing.
   - Chunks with `pattern:*` / `llm:*` flags are quarantined from answers.
6. Re-uploading the same file is a no-op (same checksum). A changed file bumps the version and replaces chunks atomically.
