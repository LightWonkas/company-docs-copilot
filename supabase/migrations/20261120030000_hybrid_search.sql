-- M4: hybrid retrieval in one RPC.
--
-- SECURITY INVOKER and called with the end user's JWT: every leg reads
-- public.chunks under RLS, so a chunk the user may not read never becomes a
-- candidate. There is deliberately no parameter for principals/ACLs; the
-- optional document/language filters are topical and only ever narrow
-- (they are AND-ed with RLS).
--
-- Filtered ANN: RLS turns the vector leg into a filtered HNSW search. Without
-- iterative scans HNSW returns ef_search candidates and the filter then drops
-- most of them for a user who can see 1% of the corpus. relaxed_order makes
-- the index keep scanning until enough visible rows are found
-- (see supabase/tests/008-filtered-ann.test.sql).

create function public.hybrid_search(
  p_query_embedding extensions.vector(384),
  p_query_tr text default null,
  p_query_en text default null,
  p_query_folded text default null,
  p_match_count int default 25,
  p_candidates int default 75,
  p_rrf_k int default 60,
  p_document_ids uuid[] default null,
  p_languages text[] default null
)
returns table (
  chunk_id uuid,
  document_id uuid,
  document_title text,
  parent_id uuid,
  heading_path text[],
  text text,
  lang text,
  injection_suspected boolean,
  vector_rank int,
  fts_rank int,
  trgm_rank int,
  vector_distance real,
  rrf_score double precision
)
language sql stable security invoker
set search_path = ''
set hnsw.iterative_scan = 'relaxed_order'
set hnsw.ef_search = 100
set pg_trgm.word_similarity_threshold = 0.3
as $$
  with eligible as (
    -- Topical narrowing only; RLS has already restricted public.chunks.
    select c.id from public.chunks c
    where c.kind = 'chunk'
      and (p_document_ids is null or c.document_id = any(p_document_ids))
      and (p_languages is null or c.lang = any(p_languages))
  ),
  vector_leg as (
    select c.id, (c.embedding operator(extensions.<=>) p_query_embedding)::real as distance,
           row_number() over (order by c.embedding operator(extensions.<=>) p_query_embedding)::int as rnk
    from public.chunks c
    where p_query_embedding is not null
      and c.kind = 'chunk' and c.embedding is not null
      and (p_document_ids is null or c.document_id = any(p_document_ids))
      and (p_languages is null or c.lang = any(p_languages))
    order by c.embedding operator(extensions.<=>) p_query_embedding
    limit p_candidates
  ),
  fts_queries as (
    -- OR the terms: natural-language questions rarely contain every word of
    -- the answer. Explicit regconfig per language; ts_rank_cd ranks.
    select 'tr'::text as lang,
           nullif(replace(plainto_tsquery('turkish'::regconfig, coalesce(p_query_tr, ''))::text, '&', '|'), '')::tsquery as q
    union all
    select 'en', nullif(replace(plainto_tsquery('english'::regconfig, coalesce(p_query_en, ''))::text, '&', '|'), '')::tsquery
  ),
  fts_leg as (
    select c.id, row_number() over (order by ts_rank_cd(c.tsv, f.q, 32) desc)::int as rnk
    from public.chunks c
    join fts_queries f on f.lang = c.lang and f.q is not null
    where c.kind = 'chunk' and c.tsv @@ f.q and c.id in (select id from eligible)
    order by ts_rank_cd(c.tsv, f.q, 32) desc
    limit p_candidates
  ),
  trgm_leg as (
    -- Diacritic/typo tolerant: both sides ASCII-folded by the app.
    select c.id,
           row_number() over (order by extensions.word_similarity(p_query_folded, c.text_folded) desc)::int as rnk
    from public.chunks c
    where p_query_folded is not null and length(p_query_folded) >= 3
      and c.kind = 'chunk' and p_query_folded operator(extensions.<%) c.text_folded
      and c.id in (select id from eligible)
    order by extensions.word_similarity(p_query_folded, c.text_folded) desc
    limit p_candidates
  ),
  fused as (
    select coalesce(v.id, f.id, t.id) as id,
           v.rnk as vector_rank, f.rnk as fts_rank, t.rnk as trgm_rank, v.distance,
           coalesce(1.0 / (p_rrf_k + v.rnk), 0)
             + coalesce(1.0 / (p_rrf_k + f.rnk), 0)
             + coalesce(1.0 / (p_rrf_k + t.rnk), 0) as rrf
    from vector_leg v
    full join fts_leg f on f.id = v.id
    full join trgm_leg t on t.id = coalesce(v.id, f.id)
  )
  select c.id, c.document_id, d.title, c.parent_id, c.heading_path, c.text, c.lang,
         c.injection_suspected, fu.vector_rank, fu.fts_rank, fu.trgm_rank, fu.distance, fu.rrf
  from fused fu
  join public.chunks c on c.id = fu.id
  join public.documents d on d.id = c.document_id
  order by fu.rrf desc, fu.vector_rank nulls last
  limit least(greatest(p_match_count, 1), 100)
$$;

revoke all on function public.hybrid_search(extensions.vector, text, text, text, int, int, int, uuid[], text[]) from public, anon;
grant execute on function public.hybrid_search(extensions.vector, text, text, text, int, int, int, uuid[], text[]) to authenticated;

-- Small-to-big: the parent section text for chunks the user can already read.
-- Invoker + RLS: a section row carries the same ACL as its document.
create function public.chunk_sections(p_chunk_ids uuid[])
returns table (chunk_id uuid, section_id uuid, section_text text)
language sql stable security invoker set search_path = ''
as $$
  select c.id, s.id, s.text
  from public.chunks c
  join public.chunks s on s.id = c.parent_id
  where c.id = any(p_chunk_ids)
$$;
revoke all on function public.chunk_sections(uuid[]) from public, anon;
grant execute on function public.chunk_sections(uuid[]) to authenticated;
