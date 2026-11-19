-- Persona x scope matrix. Each persona's visible chunk set (and document
-- metadata set) must equal exactly what docs/SPEC.md §4 allows: not one more,
-- not one less.
begin;
select no_plan();
select tests.create_access_fixture();

-- Chunks (document content)
select is(tests.visible('employee_ist'), array['public', 'sales_dept', 'team_ist'],
  'employee in Sales/Istanbul: public + own department + own team');
select is(tests.visible('lead_eu'), array['public', 'sales_dept', 'team_eu'],
  'team lead of Sales/Europe: public + own department + own team, not the sibling team');
select is(tests.visible('head_sales'), array['public', 'sales_dept', 'team_eu', 'team_ist'],
  'Sales department head: every team in Sales, not HR');
select is(tests.visible('employee_hr'), array['hr_dept', 'public'],
  'HR employee: public + HR');
select is(tests.visible('head_hr'), array['hr_dept', 'hr_named', 'public'],
  'HR head: HR + restricted doc that names them');
select is(tests.visible('executive'), array['board', 'hr_dept', 'public', 'sales_dept', 'team_eu', 'team_ist'],
  'executive: everything except restricted docs granted to others');
select is(tests.visible('admin'), array['admin_grant', 'public'],
  'admin: only public + restricted docs explicitly granted to admins');
select is(tests.visible('auditor'), array['public'],
  'auditor capability grants no document access');
select is(tests.visible('other_executive'), array['other_public'],
  'executive of another org sees nothing of fixture-org');

-- Documents (metadata): same, except admins list every document of their org.
select is(tests.visible('employee_ist', 'documents'), array['public', 'sales_dept', 'team_ist'],
  'employee document list matches chunk access');
select is(tests.visible('executive', 'documents'), array['board', 'hr_dept', 'public', 'sales_dept', 'team_eu', 'team_ist'],
  'executive document list matches chunk access');
select is(tests.visible('head_hr', 'documents'), array['hr_dept', 'hr_named', 'public'],
  'HR head document list matches chunk access');
select is(tests.visible('admin', 'documents'),
  array['admin_grant', 'board', 'hr_dept', 'hr_named', 'public', 'sales_dept', 'team_eu', 'team_ist'],
  'admin lists all org documents (metadata) for management, but no other org');
select is(tests.visible('auditor', 'documents'), array['public'],
  'auditor document list: public only');

-- anon: no privileges at all.
select tests.clear_authentication();
select throws_ok($$ select count(*) from public.chunks $$, '42501', null, 'anon cannot read chunks');
select throws_ok($$ select count(*) from public.documents $$, '42501', null, 'anon cannot read documents');
select throws_ok($$ select count(*) from public.memberships $$, '42501', null, 'anon cannot read memberships');

select * from finish();
rollback;
