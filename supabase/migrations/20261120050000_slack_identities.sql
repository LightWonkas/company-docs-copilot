-- M7: Slack user -> app user mapping.
-- A row can only be created by the app user themselves (their JWT), after
-- following a signed, expiring link the bot sent them in Slack. The bot reads
-- the mapping with the secret key (identity bridge), never documents.

create table public.slack_identities (
  team_id text not null,
  slack_user_id text not null,
  user_id uuid not null default auth.uid() references public.profiles (id) on delete cascade,
  created_at timestamptz not null default now(),
  primary key (team_id, slack_user_id)
);
create index on public.slack_identities (user_id);

alter table public.slack_identities enable row level security;
alter table public.slack_identities force row level security;
revoke all on public.slack_identities from anon;

create policy slack_identities_select on public.slack_identities for select to authenticated
  using (user_id = (select auth.uid()));
create policy slack_identities_insert on public.slack_identities for insert to authenticated
  with check (user_id = (select auth.uid()));
create policy slack_identities_delete on public.slack_identities for delete to authenticated
  using (user_id = (select auth.uid()));
