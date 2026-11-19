-- Audit log: anyone signed in appends (identity from the session), only
-- auditors read, nobody updates or deletes.
begin;
select no_plan();
select tests.create_access_fixture();

select tests.authenticate_as('employee_ist');
select isnt(
  public.log_rag_query('web', 'how many leave days', 'hash1', '{}', '{}', '{}',
    'claude-sonnet-5-5', 'v1', '{}', false, 0, 120, 0.001),
  null, 'a signed-in user can append an audit row');
select is((select count(*)::int from audit.rag_queries), 0, 'a non-auditor reads nothing from the audit table');
select is((select count(*)::int from public.audit_log()), 0, 'audit_log() returns nothing to non-auditors');
reset role;

select tests.authenticate_as('admin');
select is((select count(*)::int from public.audit_log()), 0, 'admins are not auditors');
reset role;

select tests.authenticate_as('auditor');
select is((select count(*)::int from public.audit_log()), 1, 'auditor reads the audit log');
select is((select user_id from public.audit_log() limit 1), tests.get_supabase_uid('employee_ist'),
  'user_id is taken from the session, not a parameter');
select ok(
  (select effective_principals @> array[tests.fixture_id('team', 'sales-ist')] from public.audit_log() limit 1),
  'effective principals are recorded from memberships');
select throws_ok($$ update audit.rag_queries set query_redacted = 'tampered' $$, '42501', null,
  'auditor cannot update audit rows');
select throws_ok($$ delete from audit.rag_queries $$, '42501', null, 'auditor cannot delete audit rows');
reset role;

-- Even the table owner is blocked by the append-only trigger.
select throws_ok($$ update audit.rag_queries set query_redacted = 'tampered' $$, '42501', null,
  'owner update blocked by append-only trigger');
select throws_ok($$ delete from audit.rag_queries $$, '42501', null, 'owner delete blocked by append-only trigger');
select lives_ok($$ select audit.purge_expired() $$, 'retention purge is the only delete path');

select tests.clear_authentication();
select throws_ok($$ select public.log_rag_query('web', 'q', 'h', '{}', '{}', '{}', null, null, '{}', null, 0, 0, 0) $$,
  '42501', null, 'anon cannot write to the audit log');

select * from finish();
rollback;
