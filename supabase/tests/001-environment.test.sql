-- Environment guarantees the rest of the project relies on. If a Supabase
-- image upgrade or a config change breaks one of these, CI fails here instead
-- of as a silent recall drop in retrieval.
begin;
select plan(6);

select has_extension('extensions', 'vector', 'pgvector is installed in the extensions schema');
select has_extension('extensions', 'pg_trgm', 'pg_trgm is installed in the extensions schema');

select ok(
  (select string_to_array(extversion, '.')::int[] >= array[0, 8]
     from pg_extension where extname = 'vector'),
  'pgvector >= 0.8 (HNSW iterative index scans)'
);

-- Using the type loads the pgvector library, which registers its GUCs.
select lives_ok($$ select '[1,2,3]'::extensions.vector $$, 'vector type is usable');

select ok(
  (select 'relaxed_order' = any(enumvals) from pg_settings where name = 'hnsw.iterative_scan'),
  'hnsw.iterative_scan supports relaxed_order (filtered-ANN recall under RLS)'
);

-- Vacuous until M2 adds tables; from then on every public table needs RLS.
select tests.rls_enabled('public');

select * from finish();
rollback;
