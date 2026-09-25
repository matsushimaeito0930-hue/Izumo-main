-- イベント分離への移行（既存データを保持します）。
-- 実行後、現在のHackRadarイベントの所有者は @maeo49057-png になります。

alter table public.events
  add column if not exists owner_github_username text;

alter table public.teams
  add column if not exists event_id uuid references public.events(id) on delete cascade;

alter table public.chat_messages
  add column if not exists event_id uuid references public.events(id) on delete cascade;

create table if not exists public.direct_messages (
  id uuid primary key default gen_random_uuid(),
  event_id uuid references public.events(id) on delete cascade,
  sender_login text not null,
  recipient_login text not null,
  sender_name text not null,
  sender_role text not null check (sender_role in ('participant', 'mentor', 'admin', 'judge')),
  body text not null check (char_length(body) between 1 and 1000),
  created_at timestamptz not null default now(),
  check (lower(sender_login) <> lower(recipient_login))
);

alter table public.direct_messages
  add column if not exists event_id uuid references public.events(id) on delete cascade;

do $$
declare
  legacy_event_id uuid;
begin
  select id into legacy_event_id
    from public.events
    order by created_at asc
    limit 1;

  if legacy_event_id is not null then
    update public.events
      set owner_github_username = 'maeo49057-png'
      where id = legacy_event_id and owner_github_username is null;
    update public.teams set event_id = legacy_event_id where event_id is null;
    update public.chat_messages set event_id = legacy_event_id where event_id is null;
    update public.direct_messages set event_id = legacy_event_id where event_id is null;
  end if;
end $$;

alter table public.events
  alter column owner_github_username set not null;

alter table public.teams
  alter column event_id set not null;

alter table public.chat_messages
  alter column event_id set not null;

alter table public.direct_messages
  alter column event_id set not null;

drop index if exists public.teams_name_idx;
drop index if exists public.teams_name_lower_idx;
create unique index if not exists teams_event_name_lower_idx
  on public.teams (event_id, lower(name));
create index if not exists teams_event_score_idx
  on public.teams(event_id, score desc);
create index if not exists chat_messages_event_created_at_idx
  on public.chat_messages(event_id, created_at);
create index if not exists direct_messages_event_sender_created_at_idx
  on public.direct_messages(event_id, sender_login, created_at);
create index if not exists direct_messages_event_recipient_created_at_idx
  on public.direct_messages(event_id, recipient_login, created_at);
