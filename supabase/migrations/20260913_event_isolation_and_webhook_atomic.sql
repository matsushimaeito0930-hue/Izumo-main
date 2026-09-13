-- Existing HackRadar databases only. Run after a backup, before deploying the
-- matching application code. This migration preserves existing rows.
begin;

alter table public.events add column if not exists owner_github_username text;
alter table public.events add column if not exists score_config jsonb;
alter table public.users add column if not exists specialty text;
alter table public.teams add column if not exists event_id uuid references public.events(id) on delete cascade;
alter table public.activities add column if not exists actor_login text;
alter table public.activities add column if not exists actor_avatar_url text;
alter table public.chat_messages add column if not exists event_id uuid references public.events(id) on delete cascade;
alter table public.direct_messages add column if not exists event_id uuid references public.events(id) on delete cascade;

-- Team conversations have an unambiguous event. Old event-wide announcements
-- and DMs can only be inferred automatically when the database has one event.
update public.chat_messages as message
set event_id = team.event_id
from public.teams as team
where message.event_id is null and message.team_id = team.id;

do $$
declare
  only_event_id uuid;
begin
  if (select count(*) from public.events) = 1 then
    select id into only_event_id from public.events limit 1;
    update public.chat_messages set event_id = only_event_id where event_id is null;
    update public.direct_messages set event_id = only_event_id where event_id is null;
  end if;
end;
$$;

-- Missing ownership cannot be guessed without granting access to the wrong person.
do $$
begin
  if exists (select 1 from public.events where nullif(trim(owner_github_username), '') is null) then
    raise exception 'Event owner is missing. Set owner_github_username for each event before migration.';
  end if;
  if exists (select 1 from public.teams where event_id is null) then
    raise exception 'A team has no event_id. Assign its event before migration.';
  end if;
  if exists (select 1 from public.chat_messages where event_id is null) then
    raise exception 'A chat message has no event_id. Assign its event before migration.';
  end if;
  if exists (select 1 from public.direct_messages where event_id is null) then
    raise exception 'A direct message has no event_id. Assign its event before migration.';
  end if;
  if exists (
    select 1 from public.teams
    where github_repo is not null
    group by event_id, lower(github_repo)
    having count(*) > 1
  ) then
    raise exception 'Duplicate repository names exist inside one event (case insensitive). Resolve them before migration.';
  end if;
end;
$$;

alter table public.teams drop constraint if exists teams_github_repo_key;
create unique index if not exists teams_event_github_repo_lower_idx
  on public.teams(event_id, lower(github_repo)) where github_repo is not null;

create table if not exists public.event_members (
  event_id uuid not null references public.events(id) on delete cascade,
  user_id uuid not null references public.users(id) on delete cascade,
  role text not null check (role in ('participant', 'mentor', 'admin', 'judge')),
  specialty text,
  created_at timestamptz not null default now(),
  primary key (event_id, user_id)
);
create index if not exists event_members_event_role_idx
  on public.event_members(event_id, role);

insert into public.event_members (event_id, user_id, role, specialty)
select distinct teams.event_id, team_members.user_id, 'participant', null
from public.team_members
join public.teams on teams.id = team_members.team_id
on conflict (event_id, user_id) do nothing;

insert into public.event_members (event_id, user_id, role, specialty)
select events.id, users.id, 'admin', users.specialty
from public.events
join public.users on lower(users.github_username) = lower(events.owner_github_username)
on conflict (event_id, user_id) do update set role = 'admin';

-- A single-event legacy database had globally registered mentors and judges.
-- With multiple events their membership cannot be inferred safely.
insert into public.event_members (event_id, user_id, role, specialty)
select events.id, users.id, users.role, users.specialty
from public.events cross join public.users
where (select count(*) from public.events) = 1
  and users.role in ('mentor', 'judge')
on conflict (event_id, user_id) do nothing;

-- Deliveries are deduplicated and points are incremented in one transaction.
create or replace function public.record_activity_atomic(
  p_id uuid,
  p_team_id uuid,
  p_type text,
  p_message text,
  p_score_delta integer,
  p_commit_delta integer,
  p_actor_login text,
  p_actor_avatar_url text,
  p_metadata jsonb,
  p_created_at timestamptz
)
returns setof public.activities
language plpgsql
security definer
set search_path = public
as $$
declare
  saved_activity public.activities%rowtype;
  delivery_id text := nullif(p_metadata ->> 'githubDeliveryId', '');
  commit_sha text := nullif(p_metadata ->> 'commitSha', '');
begin
  if delivery_id is not null then
    perform pg_advisory_xact_lock(
      hashtextextended(p_team_id::text || ':delivery:' || delivery_id, 0)
    );
  end if;
  if commit_sha is not null then
    perform pg_advisory_xact_lock(
      hashtextextended(p_team_id::text || ':commit:' || commit_sha, 0)
    );
  end if;

  select * into saved_activity
  from public.activities
  where (delivery_id is not null and team_id = p_team_id and metadata ->> 'githubDeliveryId' = delivery_id)
     or (commit_sha is not null and team_id = p_team_id and metadata ->> 'commitSha' = commit_sha)
  order by created_at desc
  limit 1;

  if found then
    return next saved_activity;
    return;
  end if;

  insert into public.activities (
    id, team_id, type, message, score_delta, actor_login, actor_avatar_url, metadata, created_at
  ) values (
    p_id, p_team_id, p_type, p_message, p_score_delta,
    p_actor_login, p_actor_avatar_url, coalesce(p_metadata, '{}'::jsonb), p_created_at
  ) returning * into saved_activity;

  update public.teams
  set score = score + greatest(p_score_delta, 0),
      commit_count = commit_count + greatest(p_commit_delta, 0),
      house_level = case
        when score + greatest(p_score_delta, 0) >= 600 then 4
        when score + greatest(p_score_delta, 0) >= 300 then 3
        when score + greatest(p_score_delta, 0) >= 100 then 2
        else 1
      end
  where id = p_team_id;

  return next saved_activity;
end;
$$;

revoke all on function public.record_activity_atomic(
  uuid, uuid, text, text, integer, integer, text, text, jsonb, timestamptz
) from public, anon, authenticated;
grant execute on function public.record_activity_atomic(
  uuid, uuid, text, text, integer, integer, text, text, jsonb, timestamptz
) to service_role;

-- The browser only receives a change signal. All real data goes through
-- authenticated, event-scoped Next.js API routes.
revoke all privileges on table public.users from anon, authenticated;
revoke all privileges on table public.teams from anon, authenticated;
revoke all privileges on table public.events from anon, authenticated;
revoke all privileges on table public.activities from anon, authenticated;
revoke all privileges on table public.help_posts from anon, authenticated;
revoke all privileges on table public.help_replies from anon, authenticated;
revoke all privileges on table public.team_invites from anon, authenticated;
revoke all privileges on table public.chat_messages from anon, authenticated;
revoke all privileges on table public.direct_messages from anon, authenticated;
revoke all privileges on table public.wakatime_connections from anon, authenticated;
revoke all privileges on table public.team_members from anon, authenticated;
revoke all privileges on table public.event_members from anon, authenticated;

create table if not exists public.app_change_signal (
  id smallint primary key default 1 check (id = 1),
  updated_at timestamptz not null default now()
);
insert into public.app_change_signal (id) values (1) on conflict (id) do nothing;

create or replace function public.touch_app_change_signal()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  update public.app_change_signal set updated_at = now() where id = 1;
  return null;
end;
$$;
revoke all on function public.touch_app_change_signal() from public;

drop trigger if exists activities_touch_app_change_signal on public.activities;
create trigger activities_touch_app_change_signal
after insert or update or delete on public.activities
for each statement execute function public.touch_app_change_signal();
drop trigger if exists teams_touch_app_change_signal on public.teams;
create trigger teams_touch_app_change_signal
after insert or update or delete on public.teams
for each statement execute function public.touch_app_change_signal();
drop trigger if exists team_members_touch_app_change_signal on public.team_members;
create trigger team_members_touch_app_change_signal
after insert or update or delete on public.team_members
for each statement execute function public.touch_app_change_signal();
drop trigger if exists help_posts_touch_app_change_signal on public.help_posts;
create trigger help_posts_touch_app_change_signal
after insert or update or delete on public.help_posts
for each statement execute function public.touch_app_change_signal();
drop trigger if exists help_replies_touch_app_change_signal on public.help_replies;
create trigger help_replies_touch_app_change_signal
after insert or update or delete on public.help_replies
for each statement execute function public.touch_app_change_signal();
drop trigger if exists chat_messages_touch_app_change_signal on public.chat_messages;
create trigger chat_messages_touch_app_change_signal
after insert or update or delete on public.chat_messages
for each statement execute function public.touch_app_change_signal();

revoke all privileges on table public.app_change_signal from anon, authenticated;
grant select on table public.app_change_signal to anon, authenticated;

do $$
declare
  target_table text;
begin
  foreach target_table in array array[
    'activities', 'teams', 'help_posts', 'help_replies', 'chat_messages'
  ] loop
    if exists (
      select 1 from pg_publication_tables
      where pubname = 'supabase_realtime' and schemaname = 'public' and tablename = target_table
    ) then
      execute format('alter publication supabase_realtime drop table public.%I', target_table);
    end if;
  end loop;
end;
$$;

do $$
begin
  alter publication supabase_realtime add table public.app_change_signal;
exception when duplicate_object then null;
end;
$$;

commit;
