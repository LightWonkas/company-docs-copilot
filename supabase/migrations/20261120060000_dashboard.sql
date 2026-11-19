-- M8: admin dashboard numbers, computed in SQL (never by the model).
--
-- Definer because it aggregates across tables the caller can't read row by
-- row (audit log, other users' feedback). It returns aggregates only, checks
-- the caller's role first, and only shows question text that was asked at
-- least twice (redacted already), so the dashboard can't identify a single
-- employee's question.

create function public.admin_dashboard()
returns jsonb
language plpgsql stable security definer set search_path = ''
as $$
declare
  v_org uuid := private.my_org_id();
begin
  if not (private.has_role('admin') or private.has_role('auditor')) then
    raise exception 'admin or auditor role required' using errcode = '42501';
  end if;

  return jsonb_build_object(
    'documents', (
      select jsonb_build_object(
        'total', count(*),
        'ready', count(*) filter (where status = 'ready'),
        'pending', count(*) filter (where status in ('pending', 'processing')),
        'failed', count(*) filter (where status = 'failed'),
        'flagged', count(*) filter (where cardinality(injection_flags) > 0),
        'chunks', coalesce(sum(chunk_count), 0),
        'byScope', (select jsonb_object_agg(scope, n) from (
          select scope, count(*) n from public.documents where org_id = v_org group by scope) s))
      from public.documents where org_id = v_org),
    'coverage', (
      select coalesce(jsonb_agg(jsonb_build_object('department', d.name, 'documents', c.docs, 'chunks', c.chunks) order by d.name), '[]')
      from public.departments d
      left join lateral (
        select count(*) docs, coalesce(sum(x.chunk_count), 0) chunks
        from public.documents x where x.department_id = d.id and x.status = 'ready') c on true
      where d.org_id = v_org),
    'queries', (
      select jsonb_build_object(
        'total', count(*),
        'last7d', count(*) filter (where created_at > now() - interval '7 days'),
        'abstained', count(*) filter (where abstained),
        'invalidCitations', coalesce(sum(citations_invalid), 0),
        'byChannel', (select jsonb_object_agg(channel, n) from (
          select channel, count(*) n from audit.rag_queries where org_id = v_org group by channel) s),
        'p50LatencyMs', percentile_cont(0.5) within group (order by latency_ms),
        'p95LatencyMs', percentile_cont(0.95) within group (order by latency_ms),
        'costUsd', coalesce(sum(cost_usd), 0))
      from audit.rag_queries where org_id = v_org),
    'topQuestions', (
      select coalesce(jsonb_agg(t order by t.n desc), '[]') from (
        select min(query_redacted) as question, count(*) n
        from audit.rag_queries where org_id = v_org and channel <> 'eval'
        group by query_hash having count(*) >= 2 order by count(*) desc limit 10) t),
    'unanswered', (
      select coalesce(jsonb_agg(t order by t.n desc), '[]') from (
        select min(query_redacted) as question, count(*) n
        from audit.rag_queries where org_id = v_org and abstained and channel <> 'eval'
        group by query_hash having count(*) >= 2 order by count(*) desc limit 10) t),
    'feedback', (
      select jsonb_build_object(
        'up', count(*) filter (where f.rating = 1),
        'down', count(*) filter (where f.rating = -1),
        'recentReasons', (select coalesce(jsonb_agg(r.reason), '[]') from (
          select f2.reason from public.feedback f2 join public.profiles p2 on p2.id = f2.user_id
          where p2.org_id = v_org and f2.rating = -1 and f2.reason is not null
          order by f2.created_at desc limit 5) r))
      from public.feedback f join public.profiles p on p.id = f.user_id where p.org_id = v_org)
  );
end;
$$;
revoke all on function public.admin_dashboard() from public, anon;
grant execute on function public.admin_dashboard() to authenticated;
