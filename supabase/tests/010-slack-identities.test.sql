-- Slack identity links: users can only link (and see) their own Slack account.
begin;
select no_plan();
select tests.create_access_fixture();

select tests.authenticate_as('employee_ist');
select lives_ok($$ insert into public.slack_identities (team_id, slack_user_id) values ('T1', 'U_IST') $$,
  'a user links their own Slack account');
select throws_ok($$ insert into public.slack_identities (team_id, slack_user_id, user_id)
  values ('T1', 'U_EXEC', tests.get_supabase_uid('executive')) $$, '42501', null,
  'a user cannot link a Slack account to someone else (e.g. an executive)');
reset role;

select tests.authenticate_as('executive');
select is((select count(*)::int from public.slack_identities), 0, 'links are private');
select throws_ok($$ insert into public.slack_identities (team_id, slack_user_id) values ('T1', 'U_IST') $$, '23505', null,
  'an already-linked Slack user cannot be re-linked to another account');
reset role;

select * from finish();
rollback;
