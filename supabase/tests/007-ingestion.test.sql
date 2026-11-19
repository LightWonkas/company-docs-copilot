-- Ingestion plumbing: enqueue on upload, worker-only queue access, atomic
-- chunk replacement, and storage downloads following content ACLs.
begin;
select no_plan();
select tests.create_access_fixture();

-- A pending document with a file is enqueued by trigger.
select lives_ok($$
  insert into public.documents (org_id, slug, title, language, scope, status, storage_path)
  values (tests.fixture_id('org', 'fixture-org'), 'queued', 'Queued', 'en', 'public', 'pending',
          tests.fixture_id('org', 'fixture-org')::text || '/q/v1/queued.md')
$$, 'admin-style insert of a pending document');
select ok(
  exists (select 1 from pgmq.q_ingest where message->>'document_id' = tests.fixture_id('document', 'queued')::text),
  'pending upload is enqueued for the worker');

-- Atomic replacement (as the worker would call it).
select is(
  public.replace_document_chunks(
    tests.fixture_id('document', 'queued'), 'sha-1',
    '[{"ordinal":0,"heading_path":["Intro"],"text":"Intro section","lang":"en","tokens":3,
       "chunks":[{"ordinal":0,"text":"first","context":"ctx","tokens":1,"text_folded":"first",
                  "embedding":null},
                 {"ordinal":1,"text":"second","tokens":1,"text_folded":"second","embedding":null,
                  "injection_suspected":true}]}]'::jsonb,
    array['heuristic:override']),
  2, 'replace_document_chunks writes the chunks');
select is(
  (select array[status::text, checksum, chunk_count::text] from public.documents where id = tests.fixture_id('document', 'queued')),
  array['ready', 'sha-1', '2'], 'document marked ready with checksum and count');
select is(
  (select count(*)::int from public.chunks where document_id = tests.fixture_id('document', 'queued') and kind = 'section'),
  1, 'section (parent) row stored');
select ok(
  (select bool_and(allowed_principals = array[tests.fixture_id('org', 'fixture-org')])
     from public.chunks where document_id = tests.fixture_id('document', 'queued')),
  'chunk ACL and org come from the document, not the worker payload');
select is(
  public.replace_document_chunks(tests.fixture_id('document', 'queued'), 'sha-2',
    '[{"ordinal":0,"heading_path":[],"text":"v2","lang":"en","tokens":1,
       "chunks":[{"ordinal":0,"text":"only","tokens":1,"text_folded":"only","embedding":null}]}]'::jsonb, '{}'),
  1, 're-ingest replaces the previous chunks');
select is((select count(*)::int from public.chunks where document_id = tests.fixture_id('document', 'queued') and kind = 'chunk'),
  1, 'no stale chunks remain after re-ingest');

-- Only the worker can touch the queue or chunk replacement.
select tests.authenticate_as('admin');
select throws_ok($$ select * from public.ingest_dequeue(1, 1) $$, '42501', null, 'admins cannot read the queue');
select throws_ok($$ select public.replace_document_chunks(gen_random_uuid(), 'x', '[]', '{}') $$, '42501', null,
  'admins cannot write chunks directly');
reset role;

-- Storage downloads follow content ACLs (not admin metadata visibility).
insert into storage.objects (bucket_id, name)
select 'documents', tests.fixture_id('org', 'fixture-org')::text || '/' || slug || '.md'
from public.documents where org_id = tests.fixture_id('org', 'fixture-org') and slug in ('board', 'team_ist');
update public.documents set storage_path = tests.fixture_id('org', 'fixture-org')::text || '/' || slug || '.md'
where org_id = tests.fixture_id('org', 'fixture-org') and slug in ('board', 'team_ist');

select tests.authenticate_as('admin');
select is((select count(*)::int from storage.objects where bucket_id = 'documents' and name like '%/board.md'), 0,
  'admin cannot download a restricted file they were not granted');
reset role;
select tests.authenticate_as('executive');
select is((select count(*)::int from storage.objects where bucket_id = 'documents' and name like '%/board.md'), 1,
  'executive downloads the board file');
reset role;
select tests.authenticate_as('lead_eu');
select is((select count(*)::int from storage.objects where bucket_id = 'documents'), 0,
  'Sales/Europe lead downloads neither the board nor the Istanbul team file');
reset role;
select tests.authenticate_as('employee_ist');
select throws_ok($$ insert into storage.objects (bucket_id, name) values ('documents', 'x/y.md') $$, '42501', null,
  'non-admins cannot upload');
reset role;

select * from finish();
rollback;
