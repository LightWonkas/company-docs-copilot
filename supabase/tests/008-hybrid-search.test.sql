-- Hybrid search under RLS, including the filtered-ANN failure mode that is
-- invisible at demo scale: a user who can read ~1% of the chunks.
begin;
select no_plan();
select tests.create_access_fixture();
select setseed(0.42);

-- 2000 random-vector chunks: every 100th belongs to team_ist (visible to
-- employee_ist), the rest to hr_named (visible only to head_hr).
insert into public.chunks (document_id, org_id, ordinal, text, lang, tokens, embedding)
select tests.fixture_id('document', case when g % 100 = 0 then 'team_ist' else 'hr_named' end),
       tests.fixture_id('org', 'fixture-org'), 1000 + g, 'synthetic ' || g, 'en', 1,
       (select array_agg(random()::real - 0.5) from generate_series(1, 384) where g > 0)::extensions.vector
from generate_series(1, 2000) g;

-- Lexical fixtures (no embedding) in a document employee_ist can read.
insert into public.chunks (document_id, org_id, ordinal, text, lang, tokens, text_folded)
values
  (tests.fixture_id('document', 'team_ist'), tests.fixture_id('org', 'fixture-org'), 5000,
   'Yıllık izin süresi çalışanlar için on dört iş günüdür.', 'tr', 9, 'yillik izin suresi calisanlar icin on dort is gunudur.'),
  (tests.fixture_id('document', 'hr_named'), tests.fixture_id('org', 'fixture-org'), 5001,
   'Disiplin kurulu yıllık izin ihlallerini inceler.', 'tr', 6, 'disiplin kurulu yillik izin ihlallerini inceler.');

create temp table q as select (select array_agg(random()::real - 0.5) from generate_series(1, 384))::extensions.vector as v;
create temp table hidden as select id from public.chunks where document_id = tests.fixture_id('document', 'hr_named');
grant select on q, hidden to authenticated;

select tests.authenticate_as('employee_ist');

-- Ground truth: exact KNN over the rows this user can see.
set local enable_indexscan = off;
create temp table exact as
  select c.id from public.chunks c, q
  where c.kind = 'chunk' and c.embedding is not null
  order by c.embedding operator(extensions.<=>) q.v limit 10;
reset enable_indexscan;

-- Same query forced through the HNSW index with iterative scans OFF (sorting
-- disabled so the planner cannot fall back to an exact sort over few rows).
set local enable_sort = off;
set local enable_seqscan = off;
set local enable_bitmapscan = off;
set local hnsw.iterative_scan = off;
set local hnsw.ef_search = 40;
select cmp_ok(
  (select count(*)::int from (
     select c.id from public.chunks c
     where c.kind = 'chunk' and c.embedding is not null
     order by c.embedding operator(extensions.<=>) (select v from q) limit 10) x),
  '<', 10,
  'without iterative scans, HNSW + RLS under-returns for a user who sees ~1% of chunks');
reset enable_sort;
reset enable_seqscan;
reset enable_bitmapscan;
reset hnsw.iterative_scan;
reset hnsw.ef_search;

-- hybrid_search sets relaxed_order iterative scans itself.
select cmp_ok(
  (select count(*)::int from public.hybrid_search((select v from q), null, null, null, 10, 10) h
     where h.chunk_id in (select id from exact)),
  '>=', 9,
  'hybrid_search vector leg recovers >= 90% of exact top-10 under the same RLS filter');

select is_empty(
  $$ select h.chunk_id from public.hybrid_search((select v from q), 'yıllık izin', 'annual leave', 'yillik izin', 100, 300) h
     where h.chunk_id in (select id from hidden) $$,
  'no leg (vector, FTS, trigram) returns a chunk the user cannot read');

select ok(
  exists (select 1 from public.hybrid_search(null, 'yıllık izinler kaç gün', null, null, 10, 10) h
          where h.fts_rank is not null and h.text like 'Yıllık izin%'),
  'Turkish FTS leg matches inflected forms (izinler -> izin)');

select ok(
  exists (select 1 from public.hybrid_search(null, null, null, 'yillik izin', 10, 10) h
          where h.trgm_rank is not null and h.text like 'Yıllık izin%'),
  'trigram leg matches a query typed without diacritics');

select ok(
  (select count(*) > 0 and bool_and(h.document_id = tests.fixture_id('document', 'team_ist'))
     from public.hybrid_search((select v from q), null, null, null, 10, 10,
                               60, array[tests.fixture_id('document', 'team_ist')]) h),
  'document filter only narrows results');

reset role;
select * from finish();
rollback;
