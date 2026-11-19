-- M3: ingestion plumbing. Storage bucket, Supabase Queue, atomic chunk
-- replacement. Extraction/chunking/embedding run in the Node worker.

create extension if not exists pgmq;
select pgmq.create('ingest');

alter table public.documents
  add column injection_flags text[] not null default '{}',
  add column chunk_count int not null default 0,
  add column mime_type text,
  add column ingested_at timestamptz;

-- ---------------------------------------------------------------------------
-- Storage: private bucket; object path = <org_id>/<document_id>/v<version>/<file>
-- ---------------------------------------------------------------------------

insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values (
  'documents', 'documents', false, 20 * 1024 * 1024,
  array['application/pdf',
        'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
        'text/markdown', 'text/plain']
);

-- Download = content access, so it follows allowed_principals, NOT the admin
-- metadata clause on documents: admins can't fetch restricted files.
create policy documents_objects_select on storage.objects for select to authenticated
  using (
    bucket_id = 'documents'
    and exists (
      select 1 from public.documents d
      where d.storage_path = storage.objects.name
        and d.allowed_principals && (select private.my_principals())
    )
  );
create policy documents_objects_insert on storage.objects for insert to authenticated
  with check (
    bucket_id = 'documents'
    and (select private.has_role('admin'))
    and (storage.foldername(name))[1] = (select private.my_org_id())::text
  );
create policy documents_objects_update on storage.objects for update to authenticated
  using (
    bucket_id = 'documents'
    and (select private.has_role('admin'))
    and (storage.foldername(name))[1] = (select private.my_org_id())::text
  );
create policy documents_objects_delete on storage.objects for delete to authenticated
  using (
    bucket_id = 'documents'
    and (select private.has_role('admin'))
    and (storage.foldername(name))[1] = (select private.my_org_id())::text
  );

-- ---------------------------------------------------------------------------
-- Queue. Messages are enqueued by a trigger, so no client ever gets queue
-- access; only the worker (service_role) can dequeue/ack.
-- ---------------------------------------------------------------------------

create function private.enqueue_ingest()
returns trigger
language plpgsql security definer set search_path = ''
as $$
begin
  if new.status = 'pending' and new.storage_path is not null
     and (tg_op = 'INSERT' or old.status is distinct from 'pending'
          or old.storage_path is distinct from new.storage_path) then
    perform pgmq.send('ingest', jsonb_build_object('document_id', new.id, 'storage_path', new.storage_path));
  end if;
  return null;
end;
$$;
revoke all on function private.enqueue_ingest() from public, anon, authenticated;

create trigger documents_enqueue_ingest after insert or update on public.documents
  for each row execute function private.enqueue_ingest();

create function public.ingest_dequeue(p_visibility_seconds int default 300, p_qty int default 5)
returns table (msg_id bigint, read_ct int, message jsonb)
language sql security definer set search_path = ''
as $$
  select r.msg_id, r.read_ct, r.message
  from pgmq.read('ingest', p_visibility_seconds, least(greatest(p_qty, 1), 20)) r
$$;

create function public.ingest_ack(p_msg_id bigint)
returns boolean
language sql security definer set search_path = ''
as $$
  select pgmq.delete('ingest', p_msg_id)
$$;

revoke all on function public.ingest_dequeue(int, int) from public, anon, authenticated;
revoke all on function public.ingest_ack(bigint) from public, anon, authenticated;
grant execute on function public.ingest_dequeue(int, int) to service_role;
grant execute on function public.ingest_ack(bigint) to service_role;

-- ---------------------------------------------------------------------------
-- Atomic re-ingest: old chunks disappear and new ones appear in one
-- transaction, so readers never see a half-replaced document.
-- Invoker, executable by service_role only (the worker).
-- ---------------------------------------------------------------------------

create function public.replace_document_chunks(
  p_document_id uuid,
  p_checksum text,
  p_sections jsonb,
  p_injection_flags text[]
)
returns int
language plpgsql security invoker set search_path = ''
as $$
declare
  s jsonb;
  c jsonb;
  v_section_id uuid;
  v_count int := 0;
begin
  delete from public.chunks where document_id = p_document_id;

  for s in select * from jsonb_array_elements(p_sections) loop
    insert into public.chunks (document_id, org_id, kind, ordinal, heading_path, text, lang, tokens)
    values (p_document_id, '00000000-0000-0000-0000-000000000000', 'section', (s->>'ordinal')::int,
            array(select jsonb_array_elements_text(s->'heading_path')),
            s->>'text', s->>'lang', (s->>'tokens')::int)
    returning id into v_section_id;

    for c in select * from jsonb_array_elements(s->'chunks') loop
      insert into public.chunks (
        document_id, org_id, kind, parent_id, ordinal, heading_path, text, context, lang,
        tokens, embedding, text_folded, injection_suspected)
      values (
        p_document_id, '00000000-0000-0000-0000-000000000000', 'chunk', v_section_id,
        (c->>'ordinal')::int, array(select jsonb_array_elements_text(s->'heading_path')),
        c->>'text', c->>'context', s->>'lang', (c->>'tokens')::int,
        (c->>'embedding')::extensions.vector, c->>'text_folded',
        coalesce((c->>'injection_suspected')::boolean, false));
      v_count := v_count + 1;
    end loop;
  end loop;

  -- org_id/allowed_principals above are placeholders: chunks_before_write
  -- overwrites them from the document.
  update public.documents
     set status = 'ready', checksum = p_checksum, error = null,
         injection_flags = coalesce(p_injection_flags, '{}'),
         chunk_count = v_count, ingested_at = now()
   where id = p_document_id;
  return v_count;
end;
$$;
revoke all on function public.replace_document_chunks(uuid, text, jsonb, text[]) from public, anon, authenticated;
grant execute on function public.replace_document_chunks(uuid, text, jsonb, text[]) to service_role;
