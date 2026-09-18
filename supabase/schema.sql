create extension if not exists "pgcrypto";

create table if not exists public.users (
  id uuid primary key default gen_random_uuid(),
  github_username text not null unique,
  display_name text not null,
  avatar_url text,
  role text not null default 'participant' check (role in ('participant', 'mentor', 'admin', 'judge')),
  specialty text,
  created_at timestamptz not null default now()
);

create table if not exists public.events (
  id uuid primary key default gen_random_uuid(),
  name text not null,
  join_code text not null unique,
  owner_github_username text not null,
  created_at timestamptz not null default now()
);

create table if not exists public.teams (
  id uuid primary key default gen_random_uuid(),
  event_id uuid not null references public.events(id) on delete cascade,
  name text not null,
  github_repo text unique,
  score integer not null default 0,
  commit_count integer not null default 0,
  house_level integer not null default 1 check (house_level between 1 and 4),
  created_at timestamptz not null default now()
);

-- 古いDBにも、イベント単位のインデックスや移行SQLより先に列を用意する。
alter table public.events
  add column if not exists owner_github_username text;
alter table public.teams
  add column if not exists event_id uuid references public.events(id) on delete cascade;

alter table public.teams
  add column if not exists commit_count integer not null default 0;

-- リポジトリは参加者があとから紐づけるため、未設定を許す。
alter table public.teams
  alter column github_repo drop not null;

alter table public.users
  add column if not exists specialty text;

create unique index if not exists teams_event_name_lower_idx
  on public.teams (event_id, lower(name));

create table if not exists public.team_members (
  id uuid primary key default gen_random_uuid(),
  team_id uuid not null references public.teams(id) on delete cascade,
  user_id uuid not null references public.users(id) on delete cascade,
  unique (team_id, user_id)
);

-- 同じリポジトリを別イベントで再利用できるよう、重複制約はイベント内だけにする。
alter table public.teams drop constraint if exists teams_github_repo_key;
create unique index if not exists teams_event_github_repo_lower_idx
  on public.teams(event_id, lower(github_repo))
  where github_repo is not null;

-- 同じGitHubアカウントでも、イベントごとに参加者・メンター・運営を切り替えられる。
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

-- 既存データを安全に移行する。参加者は所属チーム、運営はイベント所有者から復元できる。
insert into public.event_members (event_id, user_id, role, specialty)
select distinct teams.event_id, team_members.user_id, 'participant', null
from public.team_members
join public.teams on teams.id = team_members.team_id
where teams.event_id is not null
on conflict (event_id, user_id) do nothing;

insert into public.event_members (event_id, user_id, role, specialty)
select events.id, users.id, 'admin', users.specialty
from public.events
join public.users
  on lower(users.github_username) = lower(events.owner_github_username)
where events.owner_github_username is not null
on conflict (event_id, user_id) do update set role = 'admin';

-- WakaTime OAuth tokens are deliberately not granted to anon. The server-side
-- service role is the only client that reads them, so browser code never sees a token.
create table if not exists public.wakatime_connections (
  user_id uuid primary key references public.users(id) on delete cascade,
  access_token text not null,
  refresh_token text,
  expires_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists public.team_invites (
  id uuid primary key default gen_random_uuid(),
  code text not null unique,
  team_id uuid not null references public.teams(id) on delete cascade,
  invited_by text not null default 'HackRadar Admin',
  created_at timestamptz not null default now()
);

create table if not exists public.activities (
  id uuid primary key default gen_random_uuid(),
  team_id uuid not null references public.teams(id) on delete cascade,
  type text not null check (
    type in (
      'push',
      'pull_request_opened',
      'pull_request_merged',
      'issue_closed',
      'review'
    )
  ),
  message text not null,
  score_delta integer not null default 0,
  actor_login text,
  actor_avatar_url text,
  metadata jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now()
);

-- 誰がやったかの記録。あとから足したので、既存テーブルにも列を用意する。
alter table public.activities
  add column if not exists actor_login text;

alter table public.activities
  add column if not exists actor_avatar_url text;

-- 配点はイベントごとに変えられるようにする。null なら既定値を使う。
alter table public.events
  add column if not exists score_config jsonb;

create table if not exists public.help_posts (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references public.users(id) on delete cascade,
  team_id uuid not null references public.teams(id) on delete cascade,
  title text not null,
  body text not null,
  category text not null,
  is_anonymous boolean not null default false,
  status text not null default 'open' check (status in ('open', 'helping', 'solved')),
  created_at timestamptz not null default now()
);

alter table public.help_posts
  add column if not exists is_anonymous boolean not null default false;

create table if not exists public.help_replies (
  id uuid primary key default gen_random_uuid(),
  help_post_id uuid not null references public.help_posts(id) on delete cascade,
  author_name text not null,
  author_github text,
  author_role text not null default 'participant' check (author_role in ('participant', 'mentor', 'admin', 'judge')),
  body text not null check (char_length(body) between 1 and 1000),
  is_accepted boolean not null default false,
  created_at timestamptz not null default now()
);

create table if not exists public.chat_messages (
  id uuid primary key default gen_random_uuid(),
  channel text not null check (channel in ('staff')),
  event_id uuid not null references public.events(id) on delete cascade,
  team_id uuid references public.teams(id) on delete cascade,
  author_name text not null,
  author_role text not null default 'participant' check (author_role in ('participant', 'mentor', 'admin', 'judge')),
  body text not null check (char_length(body) between 1 and 500),
  created_at timestamptz not null default now()
);

alter table public.chat_messages
  add column if not exists event_id uuid references public.events(id) on delete cascade;

-- 個人DMはブラウザから直接読ませない。APIが送受信者を確認して返すため、
-- anon には権限を与えない。
create table if not exists public.direct_messages (
  id uuid primary key default gen_random_uuid(),
  event_id uuid not null references public.events(id) on delete cascade,
  sender_login text not null,
  recipient_login text not null,
  sender_name text not null,
  sender_role text not null check (sender_role in ('participant', 'mentor', 'admin', 'judge')),
  body text not null check (char_length(body) <= 1000),
  attachment_path text,
  attachment_name text,
  attachment_mime_type text,
  attachment_size integer,
  created_at timestamptz not null default now(),
  check (lower(sender_login) <> lower(recipient_login))
);

alter table public.direct_messages
  add column if not exists event_id uuid references public.events(id) on delete cascade;

alter table public.direct_messages
  add column if not exists attachment_path text,
  add column if not exists attachment_name text,
  add column if not exists attachment_mime_type text,
  add column if not exists attachment_size integer;

alter table public.direct_messages
  drop constraint if exists direct_messages_body_check;

alter table public.direct_messages
  add constraint direct_messages_body_or_attachment_check
  check (
    char_length(body) <= 1000
    and (char_length(body) > 0 or attachment_path is not null)
  ) not valid;

alter table public.direct_messages
  drop constraint if exists direct_messages_attachment_metadata_check;

alter table public.direct_messages
  add constraint direct_messages_attachment_metadata_check
  check (
    (attachment_path is null and attachment_name is null and attachment_mime_type is null and attachment_size is null)
    or (
      attachment_path is not null
      and attachment_name is not null
      and attachment_mime_type in ('image/jpeg', 'image/png', 'image/gif', 'image/webp')
      and attachment_size between 1 and 5242880
    )
  ) not valid;

insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values (
  'direct-message-attachments',
  'direct-message-attachments',
  false,
  5242880,
  array['image/jpeg', 'image/png', 'image/gif', 'image/webp']
)
on conflict (id) do update
set public = false,
    file_size_limit = excluded.file_size_limit,
    allowed_mime_types = excluded.allowed_mime_types;

create index if not exists activities_created_at_idx on public.activities(created_at desc);
create index if not exists activities_team_id_idx on public.activities(team_id);
create index if not exists activities_actor_idx on public.activities(team_id, actor_login);
create index if not exists help_posts_status_idx on public.help_posts(status);
create index if not exists help_replies_post_idx on public.help_replies(help_post_id, created_at);
create index if not exists teams_score_idx on public.teams(score desc);
create index if not exists teams_event_score_idx on public.teams(event_id, score desc);
create index if not exists teams_commit_count_idx on public.teams(commit_count desc);
create index if not exists team_invites_created_at_idx on public.team_invites(created_at desc);
create index if not exists wakatime_connections_expires_at_idx on public.wakatime_connections(expires_at);
create index if not exists chat_messages_created_at_idx on public.chat_messages(created_at);
create index if not exists chat_messages_channel_team_idx on public.chat_messages(channel, team_id);
create index if not exists chat_messages_event_created_at_idx on public.chat_messages(event_id, created_at);
create index if not exists direct_messages_sender_created_at_idx on public.direct_messages(sender_login, created_at);
create index if not exists direct_messages_recipient_created_at_idx on public.direct_messages(recipient_login, created_at);
create index if not exists direct_messages_event_sender_created_at_idx on public.direct_messages(event_id, sender_login, created_at);
create index if not exists direct_messages_event_recipient_created_at_idx on public.direct_messages(event_id, recipient_login, created_at);

-- Webhookの重複排除・履歴追加・チーム加点を同じトランザクションで行う。
-- 同時に複数のpushが届いても、後勝ちの上書きで点数が消えない。
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
  -- 配信IDとcommit SHAの両方を同じ順序でロックする。別の配信IDから
  -- 同じcommitが同時に届いた場合も、2件目は挿入前の再確認で止める。
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
  )
  returning * into saved_activity;

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

-- ブラウザは独自GitHubセッションを使うため、Supabaseのanon権限では本人確認できない。
-- 本文や招待コードを直接読ませず、すべて認可済みのNext.js APIを経由させる。
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

-- Realtimeではデータ本体ではなく「何かが更新された」という時刻だけを公開する。
create table if not exists public.app_change_signal (
  id smallint primary key default 1 check (id = 1),
  updated_at timestamptz not null default now()
);

insert into public.app_change_signal (id)
values (1)
on conflict (id) do nothing;

create or replace function public.touch_app_change_signal()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  update public.app_change_signal set updated_at = now() where id = 1;
  -- statement-level triggerではNEW/OLDを使わず、戻り値も無視される。
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

-- 以前のschema.sqlで公開済みの場合も、データ本体をRealtime publicationから外す。
do $$
declare
  target_table text;
begin
  foreach target_table in array array[
    'activities',
    'teams',
    'help_posts',
    'help_replies',
    'chat_messages'
  ]
  loop
    if exists (
      select 1
      from pg_publication_tables
      where pubname = 'supabase_realtime'
        and schemaname = 'public'
        and tablename = target_table
    ) then
      execute format(
        'alter publication supabase_realtime drop table public.%I',
        target_table
      );
    end if;
  end loop;
end $$;

do $$
begin
  alter publication supabase_realtime add table public.app_change_signal;
exception
  when duplicate_object then null;
end $$;

-- Teams and invites are created by the operator from the onboarding screen.

-- ここから下は、以前のスキーマで作ったDBを新しい形に合わせるための移行です。
-- 新規作成なら実行しても何も起きません。

-- 相談チャットのチャンネル名を 'mentor' から 'staff' に統一する。
alter table public.chat_messages drop constraint if exists chat_messages_channel_check;
update public.chat_messages set channel = 'staff' where channel in ('mentor', 'team');
alter table public.chat_messages
  add constraint chat_messages_channel_check check (channel in ('staff'));

-- ロールの制約を貼り直す。
alter table public.users drop constraint if exists users_role_check;
alter table public.users
  add constraint users_role_check check (role in ('participant', 'mentor', 'admin', 'judge'));

alter table public.help_replies drop constraint if exists help_replies_author_role_check;
alter table public.help_replies
  add constraint help_replies_author_role_check
  check (author_role in ('participant', 'mentor', 'admin', 'judge'));

alter table public.chat_messages drop constraint if exists chat_messages_author_role_check;
alter table public.chat_messages
  add constraint chat_messages_author_role_check
  check (author_role in ('participant', 'mentor', 'admin', 'judge'));

-- 旧 mentors テーブルは新コードでは参照しないが、既存データの確認・移行が
-- 済むまでは自動削除しない。
