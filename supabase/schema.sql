create extension if not exists "pgcrypto";

create table if not exists public.users (
  id uuid primary key default gen_random_uuid(),
  github_username text not null unique,
  display_name text not null,
  avatar_url text,
  role text not null default 'participant' check (role in ('participant', 'mentor', 'admin')),
  created_at timestamptz not null default now()
);

create table if not exists public.teams (
  id uuid primary key default gen_random_uuid(),
  name text not null,
  github_repo text not null unique,
  score integer not null default 0,
  commit_count integer not null default 0,
  house_level integer not null default 1 check (house_level between 1 and 4),
  created_at timestamptz not null default now()
);

alter table public.teams
  add column if not exists commit_count integer not null default 0;

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
  metadata jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now()
);

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
  author_role text not null default 'participant' check (author_role in ('participant', 'mentor', 'admin')),
  body text not null check (char_length(body) between 1 and 1000),
  is_accepted boolean not null default false,
  created_at timestamptz not null default now()
);

create table if not exists public.mentors (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null unique references public.users(id) on delete cascade,
  specialty text not null,
  availability text not null default 'offline' check (availability in ('available', 'busy', 'offline'))
);

create table if not exists public.chat_messages (
  id uuid primary key default gen_random_uuid(),
  channel text not null check (channel in ('team', 'mentor')),
  team_id uuid references public.teams(id) on delete cascade,
  author_name text not null,
  author_role text not null default 'participant' check (author_role in ('participant', 'mentor', 'admin')),
  body text not null check (char_length(body) between 1 and 500),
  created_at timestamptz not null default now()
);

create index if not exists activities_created_at_idx on public.activities(created_at desc);
create index if not exists activities_team_id_idx on public.activities(team_id);
create index if not exists help_posts_status_idx on public.help_posts(status);
create index if not exists help_replies_post_idx on public.help_replies(help_post_id, created_at);
create index if not exists teams_score_idx on public.teams(score desc);
create index if not exists teams_commit_count_idx on public.teams(commit_count desc);
create unique index if not exists mentors_user_id_idx on public.mentors(user_id);
create index if not exists team_invites_created_at_idx on public.team_invites(created_at desc);
create index if not exists chat_messages_created_at_idx on public.chat_messages(created_at);
create index if not exists chat_messages_channel_team_idx on public.chat_messages(channel, team_id);

grant select on public.users to anon;
grant select on public.teams to anon;
grant select on public.activities to anon;
grant select on public.help_posts to anon;
grant select, insert on public.help_replies to anon;
grant select on public.mentors to anon;
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

insert into public.users (github_username, display_name, role)
values
  ('js-mentor', 'JavaScript Mentor', 'mentor'),
  ('ui-mentor', 'UI/UX Mentor', 'mentor')
on conflict (github_username) do nothing;

-- Teams and invites are created by the operator from the onboarding screen.

insert into public.mentors (user_id, specialty, availability)
select id, 'JavaScript / Realtime', 'available'
from public.users
where github_username = 'js-mentor'
on conflict do nothing;

insert into public.mentors (user_id, specialty, availability)
select id, 'UI/UX / Pitch polish', 'busy'
from public.users
where github_username = 'ui-mentor'
on conflict do nothing;
