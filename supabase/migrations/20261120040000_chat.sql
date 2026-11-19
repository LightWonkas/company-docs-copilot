-- M5: conversations, messages, feedback. Owner-only, RLS enabled + forced.
-- Messages store cited chunk ids (not chunk text); the answer text itself is
-- the user's own data.

create table public.conversations (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null default auth.uid() references public.profiles (id) on delete cascade,
  org_id uuid not null references public.orgs (id) on delete cascade,
  channel text not null default 'web' check (channel in ('web', 'slack', 'mcp')),
  title text not null default '',
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create index on public.conversations (user_id, updated_at desc);

create table public.messages (
  id uuid primary key default gen_random_uuid(),
  conversation_id uuid not null references public.conversations (id) on delete cascade,
  user_id uuid not null default auth.uid() references public.profiles (id) on delete cascade,
  role text not null check (role in ('user', 'assistant')),
  content text not null,
  -- Validated answer blocks: [{text, status, citations: [{chunkId, documentId, title, citedText}]}]
  blocks jsonb not null default '[]',
  cited_chunk_ids uuid[] not null default '{}',
  retrieved_chunk_ids uuid[] not null default '{}',
  abstained boolean not null default false,
  abstain_reason text check (abstain_reason in ('below_threshold', 'model', 'refusal')),
  citations_invalid int not null default 0,
  prompt_version text,
  model text,
  latency_ms int,
  cost_usd numeric(12, 6),
  created_at timestamptz not null default now()
);
create index on public.messages (conversation_id, created_at);

create table public.feedback (
  id uuid primary key default gen_random_uuid(),
  message_id uuid not null references public.messages (id) on delete cascade,
  user_id uuid not null default auth.uid() references public.profiles (id) on delete cascade,
  rating smallint not null check (rating in (-1, 1)),
  reason text check (reason is null or length(reason) <= 500),
  created_at timestamptz not null default now(),
  unique (message_id, user_id)
);

alter table public.conversations enable row level security;
alter table public.conversations force row level security;
alter table public.messages enable row level security;
alter table public.messages force row level security;
alter table public.feedback enable row level security;
alter table public.feedback force row level security;

revoke all on public.conversations, public.messages, public.feedback from anon;

-- conversations: owner only; org must be the caller's own.
create policy conversations_select on public.conversations for select to authenticated
  using (user_id = (select auth.uid()));
create policy conversations_insert on public.conversations for insert to authenticated
  with check (user_id = (select auth.uid()) and org_id = (select private.my_org_id()));
create policy conversations_update on public.conversations for update to authenticated
  using (user_id = (select auth.uid()))
  with check (user_id = (select auth.uid()) and org_id = (select private.my_org_id()));
create policy conversations_delete on public.conversations for delete to authenticated
  using (user_id = (select auth.uid()));

-- messages: owner only, inside the owner's own conversation. No update
-- policy: a stored answer is never rewritten.
create policy messages_select on public.messages for select to authenticated
  using (user_id = (select auth.uid()));
create policy messages_insert on public.messages for insert to authenticated
  with check (
    user_id = (select auth.uid())
    and exists (select 1 from public.conversations c where c.id = conversation_id and c.user_id = (select auth.uid()))
  );
create policy messages_delete on public.messages for delete to authenticated
  using (user_id = (select auth.uid()));

-- feedback: on your own assistant messages only.
create policy feedback_select on public.feedback for select to authenticated
  using (user_id = (select auth.uid()));
create policy feedback_insert on public.feedback for insert to authenticated
  with check (
    user_id = (select auth.uid())
    and exists (select 1 from public.messages m where m.id = message_id and m.user_id = (select auth.uid()) and m.role = 'assistant')
  );
create policy feedback_update on public.feedback for update to authenticated
  using (user_id = (select auth.uid()))
  with check (user_id = (select auth.uid()));
create policy feedback_delete on public.feedback for delete to authenticated
  using (user_id = (select auth.uid()));
