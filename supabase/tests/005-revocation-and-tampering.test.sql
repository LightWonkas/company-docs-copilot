-- Revocation is live, ACL changes restamp chunks atomically, and nothing a
-- client controls (JWT claims, chunk ACL columns, direct writes) widens access.
begin;
select no_plan();
select tests.create_access_fixture();

-- Revocation applies on the next query, with the same JWT (no re-login).
select ok('team_ist' = any(tests.visible('employee_ist')), 'before: employee sees their team doc');
update public.profiles set team_id = null, department_id = null
  where id = tests.get_supabase_uid('employee_ist');
select is(tests.visible('employee_ist'), array['public'],
  'removed from team/department: only public, on the very next query');
delete from public.memberships where user_id = tests.get_supabase_uid('employee_ist');
select is(tests.visible('employee_ist'), '{}'::text[], 'all memberships removed: nothing');

-- ACL change restamps chunks in the same transaction.
update public.documents set scope = 'restricted', department_id = null
  where id = tests.fixture_id('document', 'sales_dept');
select is(tests.visible('head_sales'), array['public', 'team_eu', 'team_ist'],
  'department doc made restricted: department head loses it immediately');
insert into public.document_acl (document_id, principal_id, principal_type)
  values (tests.fixture_id('document', 'sales_dept'), tests.get_supabase_uid('head_sales'), 'user');
select is(tests.visible('head_sales'), array['public', 'sales_dept', 'team_eu', 'team_ist'],
  'granting the user restores access');
select is(tests.visible('lead_eu'), array['public', 'team_eu'],
  'other Sales members stay excluded from the restricted doc');
select is(
  (select allowed_principals from public.chunks where document_id = tests.fixture_id('document', 'sales_dept')),
  array[tests.get_supabase_uid('head_sales')],
  'chunk ACL equals the document ACL after restamp');

-- A chunk written with a forged ACL inherits the document's ACL instead.
insert into public.chunks (document_id, org_id, ordinal, text, lang, tokens, allowed_principals)
values (tests.fixture_id('document', 'board'), tests.fixture_id('org', 'other-org'), 99,
        'chunk:board_forged', 'en', 1, array[tests.fixture_id('org', 'fixture-org')]);
select is(
  (select allowed_principals from public.chunks where text = 'chunk:board_forged'),
  array[tests.fixture_id('role', 'executive')],
  'forged chunk ACL is overwritten with the document ACL');
select ok(not ('board_forged' = any(tests.visible('lead_eu'))), 'forged org-wide chunk ACL grants nothing');

-- A client sending allowed_principals on a document is ignored.
update public.documents set allowed_principals = array[tests.fixture_id('org', 'fixture-org')]
  where id = tests.fixture_id('document', 'board');
select is(
  (select allowed_principals from public.documents where id = tests.fixture_id('document', 'board')),
  array[tests.fixture_id('role', 'executive')],
  'documents.allowed_principals is always recomputed from scope/ACL');

-- JWT claims don't carry permissions: forged claims change nothing.
select tests.authenticate_as('lead_eu');
select set_config('request.jwt.claims',
  (current_setting('request.jwt.claims')::jsonb
    || jsonb_build_object(
         'app_metadata', jsonb_build_object('role', 'executive',
           'principals', jsonb_build_array(tests.fixture_id('role', 'executive')))))::text,
  true);
select ok(not ('board' = any(tests.current_visible('chunks'))), 'forged JWT claims do not unlock restricted docs');

-- Direct writes are denied to non-admins.
select throws_ok($$ insert into public.chunks (document_id, org_id, ordinal, text, lang, tokens)
  values (tests.fixture_id('document', 'public'), tests.fixture_id('org', 'fixture-org'), 50, 'x', 'en', 1) $$,
  '42501', null, 'employees cannot insert chunks');
select throws_ok($$ insert into public.memberships (user_id, principal_id, principal_type)
  values (auth.uid(), tests.fixture_id('role', 'executive'), 'role') $$,
  '42501', null, 'users cannot grant themselves principals');
select throws_ok($$ insert into public.documents (org_id, slug, title, language, scope)
  values (tests.fixture_id('org', 'fixture-org'), 'x', 'x', 'en', 'public') $$,
  '42501', null, 'non-admins cannot create documents');
select results_eq($$ with u as (update public.profiles set role = 'executive' where id = auth.uid() returning 1)
  select count(*)::int from u $$, array[0], 'users cannot change their own role');
reset role;

-- Admins manage others but not themselves (no self-escalation).
select tests.authenticate_as('admin');
select results_eq($$ with u as (update public.profiles set role = 'executive' where id = auth.uid() returning 1)
  select count(*)::int from u $$, array[0], 'admin cannot change their own role');
select results_eq($$ with u as (update public.profiles set full_name = 'Renamed'
  where id = tests.get_supabase_uid('employee_hr') returning 1) select count(*)::int from u $$,
  array[1], 'admin can update another user in the org');
select results_eq($$ with u as (update public.profiles set full_name = 'Renamed'
  where id = tests.get_supabase_uid('other_executive') returning 1) select count(*)::int from u $$,
  array[0], 'admin cannot touch users of another org');

select * from finish();
rollback;
