-- Conversations, messages and feedback are private to their owner.
begin;
select no_plan();
select tests.create_access_fixture();

select tests.authenticate_as('employee_ist');
insert into public.conversations (org_id, title) values (tests.fixture_id('org', 'fixture-org'), 'mine');
insert into public.messages (conversation_id, role, content)
  select id, 'assistant', 'answer' from public.conversations where title = 'mine';
select lives_ok($$ insert into public.feedback (message_id, rating, reason)
  select id, 1, 'helpful' from public.messages limit 1 $$, 'owner can leave feedback on their answer');
select throws_ok($$ insert into public.conversations (org_id, title)
  values (tests.fixture_id('org', 'other-org'), 'x') $$, '42501', null, 'cannot create a conversation in another org');
select throws_ok($$ insert into public.conversations (user_id, org_id, title)
  values (tests.get_supabase_uid('executive'), tests.fixture_id('org', 'fixture-org'), 'x') $$, '42501', null,
  'cannot create a conversation for someone else');
reset role;

create temp table mine as select id from public.conversations where title = 'mine';
grant select on mine to authenticated;
select tests.authenticate_as('executive');
select is((select count(*)::int from public.conversations), 0, 'other users (even executives) cannot read my conversations');
select is((select count(*)::int from public.messages), 0, 'or my messages');
select throws_ok($$ insert into public.messages (conversation_id, role, content)
  values ((select id from mine), 'user', 'injected') $$, '42501', null, 'cannot inject a message into my conversation even knowing its id');
reset role;

select tests.authenticate_as('admin');
select is((select count(*)::int from public.messages), 0, 'admins cannot read user conversations');
reset role;

select tests.authenticate_as('employee_ist');
select results_eq($$ with u as (update public.messages set content = 'rewritten' returning 1) select count(*)::int from u $$,
  array[0], 'stored answers are never rewritten (no update policy)');
reset role;

select * from finish();
rollback;
