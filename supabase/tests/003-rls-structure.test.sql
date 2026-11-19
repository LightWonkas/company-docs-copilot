-- Structural guarantees: catch a new table, policy or function that would
-- weaken isolation before any data-level test even runs.
begin;
select no_plan();

select tests.rls_enabled('public');
select tests.rls_enabled('audit');

select is_empty($$
  select n.nspname || '.' || c.relname
  from pg_class c join pg_namespace n on n.oid = c.relnamespace
  where n.nspname in ('public', 'audit') and c.relkind in ('r', 'p')
    and not (c.relrowsecurity and c.relforcerowsecurity)
$$, 'every table in public/audit has RLS enabled AND forced');

select is_empty($$
  select schemaname || '.' || tablename || ':' || policyname from pg_policies
  where schemaname in ('public', 'audit') and cmd = 'ALL'
$$, 'no FOR ALL policies: one policy per command');

select is_empty($$
  select schemaname || '.' || tablename || ':' || policyname from pg_policies
  where schemaname in ('public', 'audit') and (qual = 'true' or with_check = 'true')
$$, 'no using (true) / with check (true) policies');

select is_empty($$
  select schemaname || '.' || tablename || ':' || policyname from pg_policies
  where schemaname in ('public', 'audit') and roles <> '{authenticated}'::name[]
$$, 'every policy is scoped to authenticated (never anon/public)');

select is_empty($$
  select n.nspname || '.' || c.relname
  from pg_class c join pg_namespace n on n.oid = c.relnamespace
  where c.relkind = 'm' and n.nspname in ('public', 'audit', 'private')
$$, 'no materialized views (they bypass RLS)');

select is_empty($$
  select n.nspname || '.' || c.relname
  from pg_class c join pg_namespace n on n.oid = c.relnamespace
  where c.relkind = 'v' and n.nspname in ('public', 'audit')
    and not coalesce(c.reloptions @> array['security_invoker=true'], false)
$$, 'every view is security_invoker');

select is_empty($$
  select n.nspname || '.' || p.proname
  from pg_proc p join pg_namespace n on n.oid = p.pronamespace
  where p.prosecdef and n.nspname in ('public', 'private', 'audit')
    and not ('search_path=""' = any(coalesce(p.proconfig, '{}')))
$$, 'every security definer function pins search_path to empty');

-- Allowlist: a new security definer function fails this test until reviewed.
select set_eq($$
  select n.nspname || '.' || p.proname || '(' || oidvectortypes(p.proargtypes) || ')'
  from pg_proc p join pg_namespace n on n.oid = p.pronamespace
  where p.prosecdef and n.nspname in ('public', 'private', 'audit')
$$, array[
  'private.my_principals()',
  'private.my_org_id()',
  'private.has_role(text)',
  'private.rebuild_memberships(uuid)',
  'private.profiles_after_write()',
  'private.org_structure_changed()',
  'private.create_org_roles()',
  'private.documents_before_write()',
  'private.documents_restamp_chunks()',
  'private.document_acl_changed()',
  'private.chunks_before_write()',
  'public.log_rag_query(text, text, text, uuid[], uuid[], uuid[], text, text, text[], boolean, integer, integer, numeric)',
  'audit.purge_expired()',
  'private.enqueue_ingest()',
  'public.ingest_dequeue(integer, integer)',
  'public.ingest_ack(bigint)',
  'public.admin_dashboard()'
], 'security definer functions match the reviewed allowlist');

select is_empty($$
  select n.nspname || '.' || p.proname
  from pg_proc p join pg_namespace n on n.oid = p.pronamespace
  where n.nspname in ('public', 'private', 'audit')
    and has_function_privilege('anon', p.oid, 'execute')
$$, 'anon cannot execute any function in public/private/audit');

select is_empty($$
  select table_schema || '.' || table_name || ':' || privilege_type
  from information_schema.role_table_grants
  where grantee = 'anon' and table_schema in ('public', 'audit', 'private')
$$, 'anon has no table privileges');

select ok(not has_schema_privilege('anon', 'private', 'usage'), 'anon has no usage on schema private');
select ok(not has_schema_privilege('anon', 'audit', 'usage'), 'anon has no usage on schema audit');

select is_empty($$
  select table_name || ':' || privilege_type from information_schema.role_table_grants
  where grantee = 'authenticated' and table_schema = 'audit' and privilege_type <> 'SELECT'
$$, 'authenticated can only SELECT (RLS-filtered) from audit tables');

select is_empty($$
  select p.oid::regprocedure::text
  from pg_proc p join pg_namespace n on n.oid = p.pronamespace
  where n.nspname = 'public'
    and exists (select 1 from unnest(coalesce(p.proargnames, '{}')) a where a ilike '%principal%' or a ilike '%acl%')
$$, 'no public RPC accepts principals or ACLs as parameters');

select has_index('public', 'chunks', 'chunks_allowed_principals_idx', 'GIN index on chunks.allowed_principals');
select has_index('public', 'documents', 'documents_allowed_principals_idx', 'GIN index on documents.allowed_principals');
select ok(
  (select indexdef like '%USING hnsw (embedding vector_cosine_ops)%'
     from pg_indexes where indexname = 'chunks_embedding_hnsw_idx'),
  'HNSW index uses vector_cosine_ops (matches the <=> operator)'
);

select is_empty($$
  select policyname from pg_policies
  where schemaname = 'storage' and tablename = 'objects' and policyname like 'documents_objects_%'
    and (cmd = 'ALL' or roles <> '{authenticated}'::name[] or qual = 'true' or with_check = 'true')
$$, 'document bucket policies: per command, authenticated only, never true');

select is_empty($$
  select p.oid::regprocedure::text from pg_proc p join pg_namespace n on n.oid = p.pronamespace
  where n.nspname = 'public' and p.proname in ('ingest_dequeue', 'ingest_ack', 'replace_document_chunks')
    and (has_function_privilege('authenticated', p.oid, 'execute') or has_function_privilege('anon', p.oid, 'execute'))
$$, 'only the worker (service_role) can dequeue, ack or replace chunks');

select * from finish();
rollback;
