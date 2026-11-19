-- Dashboard aggregates: admins/auditors only, aggregate-only question text.
begin;
select no_plan();
select tests.create_access_fixture();

select tests.authenticate_as('employee_ist');
select public.log_rag_query('web', 'how many leave days', 'h-repeat', '{}', '{}', '{}', 'm', 'v', '{}', true, 0, 100, 0.001);
select public.log_rag_query('web', 'how many leave days', 'h-repeat', '{}', '{}', '{}', 'm', 'v', '{}', true, 0, 200, 0.001);
select public.log_rag_query('web', 'my private one-off question', 'h-once', '{}', '{}', '{}', 'm', 'v', '{}', false, 0, 300, 0.001);
select throws_ok($$ select public.admin_dashboard() $$, '42501', null, 'employees cannot read the dashboard');
reset role;

select tests.authenticate_as('admin');
select is((public.admin_dashboard() -> 'queries' ->> 'total')::int, 3, 'admin sees query totals');
select is((public.admin_dashboard() -> 'documents' ->> 'total')::int, 8, 'admin sees document counts for their org only');
select ok(public.admin_dashboard()::text like '%how many leave days%', 'repeated questions appear (k >= 2)');
select ok(public.admin_dashboard()::text not like '%one-off%', 'a question asked once is never shown');
reset role;

select tests.authenticate_as('auditor');
select lives_ok($$ select public.admin_dashboard() $$, 'auditors can read the dashboard');
reset role;

select tests.authenticate_as('other_executive');
select throws_ok($$ select public.admin_dashboard() $$, '42501', null, 'executives (no admin/auditor role) cannot');
reset role;

select * from finish();
rollback;
