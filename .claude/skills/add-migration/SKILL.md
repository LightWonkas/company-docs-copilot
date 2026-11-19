---
name: add-migration
description: Use whenever a database change is needed (new table, column, function, policy, index, view, extension). Creates a Supabase migration with RLS enabled AND forced, one policy per command, matching pgTAP tests, and regenerated TypeScript types. Never creates a table without policies.
---

# Add a migration

Read docs/SPEC.md §4 (access model) and §5 (data model) first.

## 1. Create the file

```bash
pnpm exec supabase migration new <snake_case_description>
```

## 2. Write the SQL — non-negotiables

For **every new table** in an exposed schema:

```sql
alter table public.<t> enable row level security;
alter table public.<t> force row level security;  -- owner can't bypass either
```

- **One policy per command** (`for select`, `for insert`, `for update`,
  `for delete`), each `to authenticated` (or a narrower role). No `for all`.
  No `using (true)` unless the row is genuinely public and the test says why.
- Wrap per-row function calls so they're evaluated once per statement:
  `(select auth.uid())`, `(select private.my_principals())`.
- Document data: `allowed_principals && (select private.my_principals())`.
  ACL filters never come from function parameters a client or LLM controls.
- Index every column a policy filters on (GIN for `uuid[]`, btree otherwise).
- **Functions**: `security invoker` by default. `security definer` only for
  principal helpers, always with `set search_path = ''`, fully qualified
  names, in the non-exposed `private` schema, and
  `revoke execute ... from public, anon` unless needed.
- **Views**: `with (security_invoker = true)`. **No materialized views** over
  chunks or documents (they bypass RLS).
- Never grant to `anon` on document tables. Never reference the secret key.

## 3. Write pgTAP tests

Add `supabase/tests/<NNN>-<topic>.test.sql` (use the basejump helpers from
`000-setup-tests-hooks.sql`):

- `tests.rls_enabled('public', '<t>')` and a check that `relforcerowsecurity`
  is true for the table.
- For each persona that should **and** should not see rows: `tests.authenticate_as(...)`,
  then assert row counts / `throws_ok` for writes. Include `anon`
  (`tests.clear_authentication()`).
- Policy existence per command: `policies_are(...)` or `policy_cmd_is(...)`.

## 4. Apply, test, regenerate types

```bash
pnpm db:reset && pnpm db:test
pnpm exec supabase gen types typescript > src/lib/supabase/database.types.ts
```

(The PostToolUse hook already runs reset + tests after migration edits; still
run them yourself before claiming the change works.)

## 5. Report

Tables/functions added, policies per command, test counts, and any
`security definer` you introduced with the reason.
