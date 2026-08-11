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
  created_at timestamptz not null default now()
);

create table if not exists public.teams (
  id uuid primary key default gen_random_uuid(),
  name text not null,
  github_repo text unique,
  score integer not null default 0,
  commit_count integer not null default 0,
  house_level integer not null default 1 check (house_level between 1 and 4),
  created_at timestamptz not null default now()
);

alter table public.teams
  add column if not exists commit_count integer not null default 0;

-- リポジトリは参加者があとから紐づけるため、未設定を許す。
alter table public.teams
  alter column github_repo drop not null;

alter table public.users
  add column if not exists specialty text;

create unique index if not exists teams_name_idx on public.teams(name);

create unique index if not exists teams_name_lower_idx
  on public.teams (lower(name));

create table if not exists public.team_members (
  id uuid primary key default gen_random_uuid(),
  team_id uuid not null references public.teams(id) on delete cascade,
  user_id uuid not null references public.users(id) on delete cascade,
  unique (team_id, user_id)
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
  status text not null default 'open' check (status in ('open', 'helping', 'solved')),
  created_at timestamptz not null default now()
);

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
  team_id uuid references public.teams(id) on delete cascade,
  author_name text not null,
  author_role text not null default 'participant' check (author_role in ('participant', 'mentor', 'admin', 'judge')),
  body text not null check (char_length(body) between 1 and 500),
  created_at timestamptz not null default now()
);

create index if not exists activities_created_at_idx on public.activities(created_at desc);
create index if not exists activities_team_id_idx on public.activities(team_id);
create index if not exists activities_actor_idx on public.activities(team_id, actor_login);
create index if not exists help_posts_status_idx on public.help_posts(status);
create index if not exists help_replies_post_idx on public.help_replies(help_post_id, created_at);
create index if not exists teams_score_idx on public.teams(score desc);
create index if not exists teams_commit_count_idx on public.teams(commit_count desc);
create index if not exists team_invites_created_at_idx on public.team_invites(created_at desc);
create index if not exists chat_messages_created_at_idx on public.chat_messages(created_at);
create index if not exists chat_messages_channel_team_idx on public.chat_messages(channel, team_id);

grant select on public.users to anon;
grant select on public.teams to anon;
grant select on public.events to anon;
grant select on public.activities to anon;
grant select on public.help_posts to anon;
grant select, insert on public.help_replies to anon;
grant select on public.team_invites to anon;
grant select, insert on public.chat_messages to anon;

do $$
begin
  alter publication supabase_realtime add table public.activities;
exception
  when duplicate_object then null;
end $$;

do $$
begin
  alter publication supabase_realtime add table public.chat_messages;
exception
  when duplicate_object then null;
end $$;

do $$
begin
  alter publication supabase_realtime add table public.teams;
exception
  when duplicate_object then null;
end $$;

do $$
begin
  alter publication supabase_realtime add table public.help_posts;
exception
  when duplicate_object then null;
end $$;

do $$
begin
  alter publication supabase_realtime add table public.help_replies;
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

drop table if exists public.mentors;
