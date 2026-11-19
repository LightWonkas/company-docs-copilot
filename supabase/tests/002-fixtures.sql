-- Shared fixture for the access-control suites. Defines functions only; each
-- test file calls tests.create_access_fixture() inside its own transaction,
-- so nothing persists.
--
-- Org "fixture-org": departments sales (teams sales-ist, sales-eu) and hr.
-- One document per scope, each with exactly one chunk whose text is
-- 'chunk:<slug>', so visibility can be asserted as a sorted slug list.
-- A second org ("other-org") with a public doc proves tenant isolation.

create or replace function tests.create_access_fixture()
returns void
language plpgsql
as $$
declare
  v_org uuid;
  v_other_org uuid;
  v_sales uuid;
  v_hr uuid;
  v_ist uuid;
  v_eu uuid;
  r record;
begin
  insert into public.orgs (slug, name) values ('fixture-org', 'Fixture Org') returning id into v_org;
  insert into public.orgs (slug, name) values ('other-org', 'Other Org') returning id into v_other_org;
  insert into public.departments (org_id, slug, name) values (v_org, 'sales', 'Sales') returning id into v_sales;
  insert into public.departments (org_id, slug, name) values (v_org, 'hr', 'HR') returning id into v_hr;
  insert into public.teams (org_id, department_id, slug, name) values (v_org, v_sales, 'sales-ist', 'Sales Istanbul') returning id into v_ist;
  insert into public.teams (org_id, department_id, slug, name) values (v_org, v_sales, 'sales-eu', 'Sales Europe') returning id into v_eu;

  for r in
    select * from (values
      ('employee_ist', 'employee'::public.app_role, false, null::uuid, v_ist, v_org),
      ('lead_eu', 'team_lead', false, null, v_eu, v_org),
      ('head_sales', 'department_head', false, v_sales, null, v_org),
      ('employee_hr', 'employee', false, v_hr, null, v_org),
      ('head_hr', 'department_head', false, v_hr, null, v_org),
      ('executive', 'executive', false, null, null, v_org),
      ('admin', 'admin', false, null, null, v_org),
      ('auditor', 'employee', true, null, null, v_org),
      ('other_executive', 'executive', false, null, null, v_other_org)
    ) as t (ident, role, is_auditor, department_id, team_id, org_id)
  loop
    insert into public.profiles (id, org_id, email, full_name, role, is_auditor, department_id, team_id)
    values (
      tests.create_supabase_user(r.ident, r.ident || '@fixture.test'),
      r.org_id, r.ident || '@fixture.test', r.ident, r.role, r.is_auditor, r.department_id, r.team_id
    );
  end loop;

  perform tests.fixture_doc(v_org, 'public', 'public', null, null);
  perform tests.fixture_doc(v_org, 'sales_dept', 'department', v_sales, null);
  perform tests.fixture_doc(v_org, 'hr_dept', 'department', v_hr, null);
  perform tests.fixture_doc(v_org, 'team_ist', 'team', null, v_ist);
  perform tests.fixture_doc(v_org, 'team_eu', 'team', null, v_eu);
  perform tests.fixture_doc(v_org, 'board', 'restricted', null, null,
    array[(select id from public.roles where org_id = v_org and key = 'executive')], 'role');
  perform tests.fixture_doc(v_org, 'hr_named', 'restricted', null, null,
    array[tests.get_supabase_uid('head_hr')], 'user');
  perform tests.fixture_doc(v_org, 'admin_grant', 'restricted', null, null,
    array[(select id from public.roles where org_id = v_org and key = 'admin')], 'role');
  perform tests.fixture_doc(v_other_org, 'other_public', 'public', null, null);
end;
$$;

create or replace function tests.fixture_doc(
  p_org uuid, p_slug text, p_scope public.doc_scope, p_department uuid, p_team uuid,
  p_acl uuid[] default '{}', p_acl_type public.principal_type default 'user'
)
returns uuid
language plpgsql
as $$
declare
  v_doc uuid;
begin
  insert into public.documents (org_id, slug, title, language, scope, department_id, team_id, status)
  values (p_org, p_slug, p_slug, 'en', p_scope, p_department, p_team, 'ready')
  returning id into v_doc;
  insert into public.document_acl (document_id, principal_id, principal_type)
  select v_doc, unnest(p_acl), p_acl_type;
  insert into public.chunks (document_id, org_id, ordinal, text, lang, tokens)
  values (v_doc, p_org, 0, 'chunk:' || p_slug, 'en', 1);
  return v_doc;
end;
$$;

create or replace function tests.fixture_id(p_kind text, p_slug text)
returns uuid
language sql
as $$
  select case p_kind
    when 'org' then (select id from public.orgs where slug = p_slug)
    when 'department' then (select d.id from public.departments d join public.orgs o on o.id = d.org_id where o.slug = 'fixture-org' and d.slug = p_slug)
    when 'team' then (select t.id from public.teams t join public.orgs o on o.id = t.org_id where o.slug = 'fixture-org' and t.slug = p_slug)
    when 'document' then (select d.id from public.documents d join public.orgs o on o.id = d.org_id where o.slug = 'fixture-org' and d.slug = p_slug)
    when 'role' then (select r.id from public.roles r join public.orgs o on o.id = r.org_id where o.slug = 'fixture-org' and r.key = p_slug)
  end
$$;

-- Slugs of chunks/documents visible to whoever the session is authenticated as.
-- Dynamic SQL so each call is planned for the current role.
create or replace function tests.current_visible(p_table text)
returns text[]
language plpgsql
as $$
declare
  v text[];
begin
  if p_table = 'chunks' then
    execute $q$ select coalesce(array_agg(replace(text, 'chunk:', '') order by text), '{}') from public.chunks $q$ into v;
  else
    execute $q$ select coalesce(array_agg(slug order by slug), '{}') from public.documents $q$ into v;
  end if;
  return v;
end;
$$;

-- Authenticate as a fixture persona, read, then return to the test's own role.
create or replace function tests.visible(p_identifier text, p_table text default 'chunks')
returns text[]
language plpgsql
as $$
declare
  v text[];
begin
  perform tests.authenticate_as(p_identifier);
  v := tests.current_visible(p_table);
  execute 'reset role';
  perform set_config('request.jwt.claims', '', true);
  return v;
end;
$$;

begin;
select plan(1);
select has_function('tests', 'create_access_fixture', 'access fixture is installed');
select * from finish();
rollback;
