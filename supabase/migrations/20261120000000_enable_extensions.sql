-- Extensions are installed into the `extensions` schema, which is not in the
-- PostgREST-exposed schema list, so none of their functions become callable
-- RPC endpoints.
--
-- vector  >= 0.8: HNSW iterative index scans (hnsw.iterative_scan), needed so
--                 restrictive RLS filters don't silently cut ANN recall (M4).
-- pg_trgm:        trigram similarity on ASCII-folded text, the typo- and
--                 diacritic-tolerant lexical leg of hybrid search (M4).
create extension if not exists vector with schema extensions;
create extension if not exists pg_trgm with schema extensions;
