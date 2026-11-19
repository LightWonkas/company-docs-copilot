-- M2: org model, pre-expanded memberships, document/chunk ACLs, audit log.
--
-- Enforcement design (docs/SPEC.md §4):
--   * memberships(user, principal) holds every principal a user acts as, with
--     ancestors pre-expanded (team -> department -> org, plus role/user).
--   * documents/chunks carry allowed_principals uuid[], computed in the DB from
--     scope (never supplied by a client or the LLM) and GIN-indexed.
--   * RLS: allowed_principals && private.my_principals(), which reads
--     memberships live so a revocation applies on the very next query.

-- ---------------------------------------------------------------------------
-- Schemas and default privileges
-- ---------------------------------------------------------------------------

-- `private` and `audit` are not in config.toml [api].schemas, so PostgREST
-- never exposes them. authenticated needs USAGE so RLS policies can call the
-- helper functions while evaluating a user's query.
create schema private;
revoke all on schema private from public, anon;
grant usage on schema private to authenticated, service_role;

create schema audit;
revoke all on schema audit from public, anon;
grant usage on schema audit to authenticated, service_role;

-- Supabase grants EXECUTE on new public functions to anon by default. Make
-- every anon-callable RPC an explicit decision instead.
alter default privileges for role postgres in schema public revoke execute on functions from public, anon;
-- Same for tables and sequences: anon gets nothing on future tables either.
alter default privileges for role postgres in schema public revoke all on tables from anon;
alter default privileges for role postgres in schema public revoke all on sequences from anon;

-- ---------------------------------------------------------------------------
-- Types
-- ---------------------------------------------------------------------------

create type public.app_role as enum ('employee', 'team_lead', 'department_head', 'executive', 'admin');
create type public.principal_type as enum ('org', 'department', 'team', 'role', 'user');
create type public.doc_scope as enum ('public', 'department', 'team', 'restricted');
create type public.doc_status as enum ('pending', 'processing', 'ready', 'failed');

-- ---------------------------------------------------------------------------
-- Org structure. Every org/department/team/role id doubles as a principal id.
-- ---------------------------------------------------------------------------

create table public.orgs (
  id uuid primary key default gen_random_uuid(),
  slug text not null unique,
  name text not null,
  created_at timestamptz not null default now()
);

create table public.departments (
  id uuid primary key default gen_random_uuid(),
  org_id uuid not null references public.orgs (id) on delete cascade,
  slug text not null,
  name text not null,
  unique (org_id, slug)
);
create index on public.departments (org_id);

create table public.teams (
  id uuid primary key default gen_random_uuid(),
  org_id uuid not null references public.orgs (id) on delete cascade,
  department_id uuid not null references public.departments (id) on delete cascade,
  slug text not null,
  name text not null,
  unique (org_id, slug)
);
create index on public.teams (org_id);
create index on public.teams (department_id);

-- Role principals (e.g. role:executive) so restricted docs can name a role.
-- 'auditor' is a capability, not an app_role, but it is a principal too.
create table public.roles (
  id uuid primary key default gen_random_uuid(),
  org_id uuid not null references public.orgs (id) on delete cascade,
  key text not null check (key in ('employee', 'team_lead', 'department_head', 'executive', 'admin', 'auditor')),
  unique (org_id, key)
);

create table public.profiles (
  id uuid primary key references auth.users (id) on delete cascade,
  org_id uuid not null references public.orgs (id) on delete cascade,
  email text not null,
  full_name text not null,
  role public.app_role not null default 'employee',
  is_auditor boolean not null default false,
  department_id uuid references public.departments (id) on delete set null,
  team_id uuid references public.teams (id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create index on public.profiles (org_id);

create table public.memberships (
  user_id uuid not null references public.profiles (id) on delete cascade,
  principal_id uuid not null,
  principal_type public.principal_type not null,
  primary key (user_id, principal_id)
);

-- ---------------------------------------------------------------------------
-- Documents and chunks
-- ---------------------------------------------------------------------------

create table public.documents (
  id uuid primary key default gen_random_uuid(),
  org_id uuid not null references public.orgs (id) on delete cascade,
  slug text not null,
  title text not null,
  language text not null check (language in ('tr', 'en')),
  scope public.doc_scope not null,
  department_id uuid references public.departments (id) on delete restrict,
  team_id uuid references public.teams (id) on delete restrict,
  -- Computed by trigger from scope/team/department/document_acl; any value a
  -- client sends is overwritten.
  allowed_principals uuid[] not null default '{}',
  owner_id uuid references public.profiles (id) on delete set null,
  version int not null default 1,
  storage_path text,
  checksum text,
  status public.doc_status not null default 'pending',
  error text,
  superseded_by uuid references public.documents (id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (org_id, slug),
  constraint documents_scope_targets check (
    (scope in ('public', 'restricted') and department_id is null and team_id is null)
    or (scope = 'department' and department_id is not null and team_id is null)
    or (scope = 'team' and team_id is not null)
  )
);
create index documents_allowed_principals_idx on public.documents using gin (allowed_principals);
create index on public.documents (org_id, status);

-- Explicit allow-list for scope = 'restricted' (users or role principals).
create table public.document_acl (
  document_id uuid not null references public.documents (id) on delete cascade,
  principal_id uuid not null,
  principal_type public.principal_type not null check (principal_type in ('user', 'role')),
  primary key (document_id, principal_id)
);

create table public.chunks (
  id uuid primary key default gen_random_uuid(),
  document_id uuid not null references public.documents (id) on delete cascade,
  org_id uuid not null references public.orgs (id) on delete cascade,
  -- Small-to-big: 'section' rows hold a whole heading section (not embedded),
  -- 'chunk' rows are the retrievable units and point at their section.
  kind text not null default 'chunk' check (kind in ('section', 'chunk')),
  parent_id uuid references public.chunks (id) on delete cascade,
  ordinal int not null,
  heading_path text[] not null default '{}',
  text text not null,
  -- Contextual Retrieval blurb (M3). Indexed together with text; the answer
  -- model only ever sees `text`.
  context text,
  lang text not null check (lang in ('tr', 'en')),
  tokens int not null,
  embedding extensions.vector(384),
  -- Language-specific stemming with an explicit regconfig per row.
  tsv tsvector generated always as (
    to_tsvector(
      case lang when 'tr' then 'turkish'::regconfig else 'english'::regconfig end,
      coalesce(context, '') || ' ' || text
    )
  ) stored,
  -- ASCII-folded (Turkish-aware, done in the app) context + text for pg_trgm.
  text_folded text not null default '',
  -- Copied from the document by trigger; never written by clients.
  allowed_principals uuid[] not null default '{}',
  injection_suspected boolean not null default false,
  created_at timestamptz not null default now(),
  unique (document_id, kind, ordinal)
);
create index chunks_allowed_principals_idx on public.chunks using gin (allowed_principals);
create index on public.chunks (document_id);
create index chunks_tsv_idx on public.chunks using gin (tsv);
create index chunks_text_folded_trgm_idx on public.chunks using gin (text_folded extensions.gin_trgm_ops);
-- Operator class must match the query operator: <=> (cosine) <-> vector_cosine_ops.
create index chunks_embedding_hnsw_idx on public.chunks using hnsw (embedding extensions.vector_cosine_ops);

-- ---------------------------------------------------------------------------
-- Audit log: ids and scores only, never chunk text.
-- ---------------------------------------------------------------------------

create table audit.settings (
  id boolean primary key default true check (id),
  retention_days int not null default 365 check (retention_days > 0)
);
insert into audit.settings default values;

create table audit.rag_queries (
  id bigint generated always as identity primary key,
  created_at timestamptz not null default now(),
  org_id uuid not null,
  user_id uuid not null,
  channel text not null check (channel in ('web', 'slack', 'mcp', 'eval')),
  effective_principals uuid[] not null,
  query_redacted text not null,
  query_hash text not null,
  retrieved_chunk_ids uuid[] not null default '{}',
  cited_chunk_ids uuid[] not null default '{}',
  -- Ids the app refused to use: citations failing validation, or candidates
  -- dropped by the permitted-set check.
  denied_chunk_ids uuid[] not null default '{}',
  model text,
  prompt_version text,
  injection_flags text[] not null default '{}',
  abstained boolean,
  citations_invalid int not null default 0,
  latency_ms int,
  cost_usd numeric(12, 6)
);
create index on audit.rag_queries (org_id, created_at desc);

-- ---------------------------------------------------------------------------
-- Principal helpers (the only security definer functions besides triggers).
-- search_path = '' and fully qualified names prevent search_path hijacking.
-- ---------------------------------------------------------------------------

create function private.my_principals()
returns uuid[]
language sql stable security definer set search_path = ''
as $$
  select coalesce(array_agg(m.principal_id), '{}'::uuid[])
  from public.memberships m
  where m.user_id = (select auth.uid())
$$;

create function private.my_org_id()
returns uuid
language sql stable security definer set search_path = ''
as $$
  select p.org_id from public.profiles p where p.id = (select auth.uid())
$$;

create function private.has_role(p_role text)
returns boolean
language sql stable security definer set search_path = ''
as $$
  select exists (
    select 1 from public.profiles p
    where p.id = (select auth.uid())
      and (p.role::text = p_role or (p_role = 'auditor' and p.is_auditor))
  )
$$;

revoke all on function private.my_principals() from public, anon;
revoke all on function private.my_org_id() from public, anon;
revoke all on function private.has_role(text) from public, anon;
grant execute on function private.my_principals() to authenticated;
grant execute on function private.my_org_id() to authenticated;
grant execute on function private.has_role(text) to authenticated;

-- ---------------------------------------------------------------------------
-- Membership maintenance (definer: memberships has no write policies).
-- ---------------------------------------------------------------------------

create function private.rebuild_memberships(p_user_id uuid)
returns void
language plpgsql security definer set search_path = ''
as $$
declare
  p public.profiles;
begin
  delete from public.memberships where user_id = p_user_id;
  select * into p from public.profiles where id = p_user_id;
  if p.id is null then
    return;
  end if;

  insert into public.memberships (user_id, principal_id, principal_type)
  select p_user_id, x.principal_id, x.principal_type
  from (
    select p.org_id as principal_id, 'org'::public.principal_type as principal_type
    union all select p.id, 'user'
    union all select r.id, 'role' from public.roles r
      where r.org_id = p.org_id and (r.key = p.role::text or (p.is_auditor and r.key = 'auditor'))
    -- ancestors of the user's own team/department
    union all select p.department_id, 'department' where p.department_id is not null
    union all select p.team_id, 'team' where p.team_id is not null
    -- a department head sees every team in their department
    union all select t.id, 'team' from public.teams t
      where p.role = 'department_head' and t.department_id = p.department_id
    -- executives see every department and team (restricted docs still need
    -- an explicit grant)
    union all select d.id, 'department' from public.departments d
      where p.role = 'executive' and d.org_id = p.org_id
    union all select t.id, 'team' from public.teams t
      where p.role = 'executive' and t.org_id = p.org_id
  ) x
  where x.principal_id is not null
  on conflict do nothing;
end;
$$;
revoke all on function private.rebuild_memberships(uuid) from public, anon, authenticated;

create function private.profiles_before_write()
returns trigger
language plpgsql security invoker set search_path = ''
as $$
begin
  -- A team implies its department; keeps the two from disagreeing.
  if new.team_id is not null then
    select t.department_id into new.department_id from public.teams t where t.id = new.team_id;
  end if;
  new.updated_at := now();
  return new;
end;
$$;

create function private.profiles_after_write()
returns trigger
language plpgsql security definer set search_path = ''
as $$
begin
  perform private.rebuild_memberships(new.id);
  return null;
end;
$$;

create trigger profiles_before_write before insert or update on public.profiles
  for each row execute function private.profiles_before_write();
create trigger profiles_after_write after insert or update on public.profiles
  for each row execute function private.profiles_after_write();

-- New departments/teams must reach executives and department heads at once.
create function private.org_structure_changed()
returns trigger
language plpgsql security definer set search_path = ''
as $$
declare
  v_org uuid := coalesce(new.org_id, old.org_id);
  v_user uuid;
begin
  for v_user in
    select p.id from public.profiles p
    where p.org_id = v_org and p.role in ('executive', 'department_head')
  loop
    perform private.rebuild_memberships(v_user);
  end loop;
  return null;
end;
$$;

create trigger departments_changed after insert or delete on public.departments
  for each row execute function private.org_structure_changed();
create trigger teams_changed after insert or update of department_id or delete on public.teams
  for each row execute function private.org_structure_changed();

create function private.create_org_roles()
returns trigger
language plpgsql security definer set search_path = ''
as $$
begin
  insert into public.roles (org_id, key)
  select new.id, k from unnest(array['employee', 'team_lead', 'department_head', 'executive', 'admin', 'auditor']) k;
  return null;
end;
$$;

create trigger orgs_create_roles after insert on public.orgs
  for each row execute function private.create_org_roles();

-- ---------------------------------------------------------------------------
-- Document ACL stamping
-- ---------------------------------------------------------------------------

create function private.documents_before_write()
returns trigger
language plpgsql security definer set search_path = ''
as $$
begin
  if new.scope = 'team' then
    select t.department_id into new.department_id from public.teams t where t.id = new.team_id;
  end if;

  new.allowed_principals := case new.scope
    when 'public' then array[new.org_id]
    when 'department' then array[new.department_id]
    when 'team' then array[new.team_id]
    else coalesce(
      (select array_agg(a.principal_id order by a.principal_id)
         from public.document_acl a where a.document_id = new.id),
      '{}'::uuid[])
  end;
  new.updated_at := now();
  return new;
end;
$$;

create trigger documents_before_write before insert or update on public.documents
  for each row execute function private.documents_before_write();

-- Re-stamp every chunk in the same transaction as the ACL change, so there is
-- no window where chunks carry a stale (wider) ACL. Definer because the admin
-- changing the ACL has no write access to chunks.
create function private.documents_restamp_chunks()
returns trigger
language plpgsql security definer set search_path = ''
as $$
begin
  update public.chunks
     set allowed_principals = new.allowed_principals
   where document_id = new.id;
  return null;
end;
$$;

-- Deliberately NOT `after update of allowed_principals`: column-specific
-- triggers only fire when the column is in the UPDATE's SET list, and here the
-- value is changed by documents_before_write (e.g. `set scope = 'restricted'`).
-- That variant leaves chunks on the old, wider ACL (caught by pgTAP 005).
create trigger documents_restamp_chunks after update on public.documents
  for each row when (old.allowed_principals is distinct from new.allowed_principals)
  execute function private.documents_restamp_chunks();

-- Touching the parent row re-runs documents_before_write, which recomputes
-- allowed_principals (and so re-stamps chunks).
create function private.document_acl_changed()
returns trigger
language plpgsql security definer set search_path = ''
as $$
begin
  update public.documents set updated_at = now()
   where id = coalesce(new.document_id, old.document_id);
  return null;
end;
$$;

create trigger document_acl_changed after insert or update or delete on public.document_acl
  for each row execute function private.document_acl_changed();

-- Chunks inherit org and ACL from their document whatever the writer sends.
create function private.chunks_before_write()
returns trigger
language plpgsql security definer set search_path = ''
as $$
begin
  select d.org_id, d.allowed_principals
    into new.org_id, new.allowed_principals
    from public.documents d where d.id = new.document_id;
  return new;
end;
$$;

create trigger chunks_before_write before insert or update of document_id, allowed_principals, org_id on public.chunks
  for each row execute function private.chunks_before_write();

-- Trigger functions are never called directly.
revoke all on function private.profiles_before_write() from public, anon, authenticated;
revoke all on function private.profiles_after_write() from public, anon, authenticated;
revoke all on function private.org_structure_changed() from public, anon, authenticated;
revoke all on function private.create_org_roles() from public, anon, authenticated;
revoke all on function private.documents_before_write() from public, anon, authenticated;
revoke all on function private.documents_restamp_chunks() from public, anon, authenticated;
revoke all on function private.document_acl_changed() from public, anon, authenticated;
revoke all on function private.chunks_before_write() from public, anon, authenticated;

-- ---------------------------------------------------------------------------
-- Audit: insert-only through a definer function; immutable afterwards.
-- ---------------------------------------------------------------------------

create function public.log_rag_query(
  p_channel text,
  p_query_redacted text,
  p_query_hash text,
  p_retrieved_chunk_ids uuid[],
  p_cited_chunk_ids uuid[],
  p_denied_chunk_ids uuid[],
  p_model text,
  p_prompt_version text,
  p_injection_flags text[],
  p_abstained boolean,
  p_citations_invalid int,
  p_latency_ms int,
  p_cost_usd numeric
)
returns bigint
language plpgsql security definer set search_path = ''
as $$
declare
  v_id bigint;
begin
  if (select auth.uid()) is null then
    raise exception 'log_rag_query requires an authenticated user' using errcode = '42501';
  end if;
  -- Who asked and with which principals comes from the session, not parameters.
  insert into audit.rag_queries (
    org_id, user_id, channel, effective_principals, query_redacted, query_hash,
    retrieved_chunk_ids, cited_chunk_ids, denied_chunk_ids, model, prompt_version,
    injection_flags, abstained, citations_invalid, latency_ms, cost_usd)
  values (
    private.my_org_id(), (select auth.uid()), p_channel, private.my_principals(),
    left(p_query_redacted, 2000), p_query_hash,
    coalesce(p_retrieved_chunk_ids, '{}'), coalesce(p_cited_chunk_ids, '{}'),
    coalesce(p_denied_chunk_ids, '{}'), p_model, p_prompt_version,
    coalesce(p_injection_flags, '{}'), p_abstained, coalesce(p_citations_invalid, 0),
    p_latency_ms, p_cost_usd)
  returning id into v_id;
  return v_id;
end;
$$;
revoke all on function public.log_rag_query(text, text, text, uuid[], uuid[], uuid[], text, text, text[], boolean, int, int, numeric) from public, anon;
grant execute on function public.log_rag_query(text, text, text, uuid[], uuid[], uuid[], text, text, text[], boolean, int, int, numeric) to authenticated;

create function audit.block_mutation()
returns trigger
language plpgsql security invoker set search_path = ''
as $$
begin
  -- Only the retention purge may delete, and it says so explicitly.
  if tg_op = 'DELETE' and current_setting('audit.purging', true) = 'on' then
    return old;
  end if;
  raise exception 'audit.rag_queries is append-only' using errcode = '42501';
end;
$$;

create trigger rag_queries_immutable before update or delete on audit.rag_queries
  for each row execute function audit.block_mutation();
revoke all on function audit.block_mutation() from public, anon, authenticated;

create function audit.purge_expired()
returns int
language plpgsql security definer set search_path = ''
as $$
declare
  v_deleted int;
begin
  perform set_config('audit.purging', 'on', true);
  delete from audit.rag_queries
   where created_at < now() - make_interval(days => (select s.retention_days from audit.settings s));
  get diagnostics v_deleted = row_count;
  perform set_config('audit.purging', 'off', true);
  return v_deleted;
end;
$$;
revoke all on function audit.purge_expired() from public, anon, authenticated;
grant execute on function audit.purge_expired() to service_role;

-- Auditor read path (invoker: RLS on audit.rag_queries decides).
create function public.audit_log(p_limit int default 50, p_before_id bigint default null)
returns setof audit.rag_queries
language sql stable security invoker set search_path = ''
as $$
  select * from audit.rag_queries q
  where p_before_id is null or q.id < p_before_id
  order by q.id desc
  limit least(greatest(p_limit, 1), 200)
$$;
revoke all on function public.audit_log(int, bigint) from public, anon;
grant execute on function public.audit_log(int, bigint) to authenticated;

-- ---------------------------------------------------------------------------
-- Grants. anon gets nothing on any table here.
-- ---------------------------------------------------------------------------

revoke all on public.orgs, public.departments, public.teams, public.roles, public.profiles,
  public.memberships, public.documents, public.document_acl, public.chunks from anon;

revoke all on audit.rag_queries, audit.settings from public, anon, authenticated;
grant select on audit.rag_queries to authenticated;
grant all on audit.rag_queries, audit.settings to service_role;

-- ---------------------------------------------------------------------------
-- Row level security: enabled AND forced everywhere, one policy per command.
-- No policy for a command = denied.
-- ---------------------------------------------------------------------------

alter table public.orgs enable row level security;
alter table public.orgs force row level security;
alter table public.departments enable row level security;
alter table public.departments force row level security;
alter table public.teams enable row level security;
alter table public.teams force row level security;
alter table public.roles enable row level security;
alter table public.roles force row level security;
alter table public.profiles enable row level security;
alter table public.profiles force row level security;
alter table public.memberships enable row level security;
alter table public.memberships force row level security;
alter table public.documents enable row level security;
alter table public.documents force row level security;
alter table public.document_acl enable row level security;
alter table public.document_acl force row level security;
alter table public.chunks enable row level security;
alter table public.chunks force row level security;
alter table audit.rag_queries enable row level security;
alter table audit.rag_queries force row level security;
alter table audit.settings enable row level security;
alter table audit.settings force row level security;

-- orgs
create policy orgs_select on public.orgs for select to authenticated
  using (id = (select private.my_org_id()));

-- departments
create policy departments_select on public.departments for select to authenticated
  using (org_id = (select private.my_org_id()));
create policy departments_insert on public.departments for insert to authenticated
  with check (org_id = (select private.my_org_id()) and (select private.has_role('admin')));
create policy departments_update on public.departments for update to authenticated
  using (org_id = (select private.my_org_id()) and (select private.has_role('admin')))
  with check (org_id = (select private.my_org_id()));
create policy departments_delete on public.departments for delete to authenticated
  using (org_id = (select private.my_org_id()) and (select private.has_role('admin')));

-- teams
create policy teams_select on public.teams for select to authenticated
  using (org_id = (select private.my_org_id()));
create policy teams_insert on public.teams for insert to authenticated
  with check (org_id = (select private.my_org_id()) and (select private.has_role('admin')));
create policy teams_update on public.teams for update to authenticated
  using (org_id = (select private.my_org_id()) and (select private.has_role('admin')))
  with check (org_id = (select private.my_org_id()));
create policy teams_delete on public.teams for delete to authenticated
  using (org_id = (select private.my_org_id()) and (select private.has_role('admin')));

-- roles (read-only; created by trigger)
create policy roles_select on public.roles for select to authenticated
  using (org_id = (select private.my_org_id()));

-- profiles: own row; admins and auditors read the org. Admins manage other
-- users but never their own row, so an admin can't self-escalate.
create policy profiles_select on public.profiles for select to authenticated
  using (
    id = (select auth.uid())
    or (org_id = (select private.my_org_id())
        and ((select private.has_role('admin')) or (select private.has_role('auditor'))))
  );
create policy profiles_insert on public.profiles for insert to authenticated
  with check (org_id = (select private.my_org_id()) and (select private.has_role('admin')));
create policy profiles_update on public.profiles for update to authenticated
  using (org_id = (select private.my_org_id()) and (select private.has_role('admin')) and id <> (select auth.uid()))
  with check (org_id = (select private.my_org_id()) and id <> (select auth.uid()));
create policy profiles_delete on public.profiles for delete to authenticated
  using (org_id = (select private.my_org_id()) and (select private.has_role('admin')) and id <> (select auth.uid()));

-- memberships: users see their own; writes only via definer triggers.
create policy memberships_select on public.memberships for select to authenticated
  using (user_id = (select auth.uid()));

-- documents: readers by ACL; admins see metadata of every org document so they
-- can manage it, but content lives in chunks/storage, which admins can't read
-- unless granted.
create policy documents_select on public.documents for select to authenticated
  using (
    allowed_principals && (select private.my_principals())
    or (org_id = (select private.my_org_id()) and (select private.has_role('admin')))
  );
create policy documents_insert on public.documents for insert to authenticated
  with check (org_id = (select private.my_org_id()) and (select private.has_role('admin')));
create policy documents_update on public.documents for update to authenticated
  using (org_id = (select private.my_org_id()) and (select private.has_role('admin')))
  with check (org_id = (select private.my_org_id()));
create policy documents_delete on public.documents for delete to authenticated
  using (org_id = (select private.my_org_id()) and (select private.has_role('admin')));

-- document_acl: admin-managed.
create policy document_acl_select on public.document_acl for select to authenticated
  using ((select private.has_role('admin')) and exists (
    select 1 from public.documents d where d.id = document_id and d.org_id = (select private.my_org_id())));
create policy document_acl_insert on public.document_acl for insert to authenticated
  with check ((select private.has_role('admin')) and exists (
    select 1 from public.documents d where d.id = document_id and d.org_id = (select private.my_org_id())));
create policy document_acl_delete on public.document_acl for delete to authenticated
  using ((select private.has_role('admin')) and exists (
    select 1 from public.documents d where d.id = document_id and d.org_id = (select private.my_org_id())));

-- chunks: read by ACL only. Writes come from the ingest worker (secret key).
create policy chunks_select on public.chunks for select to authenticated
  using (allowed_principals && (select private.my_principals()));

-- audit
create policy rag_queries_select on audit.rag_queries for select to authenticated
  using ((select private.has_role('auditor')) and org_id = (select private.my_org_id()));
