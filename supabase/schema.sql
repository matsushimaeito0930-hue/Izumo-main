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

create table if not exists public.team_members (
  id uuid primary key default gen_random_uuid(),
  team_id uuid not null references public.teams(id) on delete cascade,
  user_id uuid not null references public.users(id) on delete cascade,
  unique (team_id, user_id)
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

create table if not exists public.mentors (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null unique references public.users(id) on delete cascade,
  specialty text not null,
  availability text not null default 'offline' check (availability in ('available', 'busy', 'offline'))
);

create index if not exists activities_created_at_idx on public.activities(created_at desc);
create index if not exists activities_team_id_idx on public.activities(team_id);
create index if not exists help_posts_status_idx on public.help_posts(status);
create index if not exists teams_score_idx on public.teams(score desc);
create index if not exists teams_commit_count_idx on public.teams(commit_count desc);
create unique index if not exists mentors_user_id_idx on public.mentors(user_id);

grant select on public.users to anon;
grant select on public.teams to anon;
grant select on public.activities to anon;
grant select on public.help_posts to anon;
grant select on public.mentors to anon;

do $$
begin
  alter publication supabase_realtime add table public.activities;
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

insert into public.users (github_username, display_name, role)
values
  ('team-a-lead', 'Aoi', 'participant'),
  ('team-b-dev', 'Ren', 'participant'),
  ('js-mentor', 'JavaScript Mentor', 'mentor'),
  ('ui-mentor', 'UI/UX Mentor', 'mentor')
on conflict (github_username) do nothing;

insert into public.teams (name, github_repo, score, commit_count, house_level)
values
  ('Team A', 'matsushimaeito0930-hue/Izumo-main', 95, 3, 1),
  ('Team B', 'example/team-b', 220, 12, 2),
  ('Team C', 'example/team-c', 365, 18, 3),
  ('Team D', 'example/team-d', 54, 4, 1)
on conflict (github_repo) do nothing;

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

insert into public.help_posts (user_id, team_id, title, body, category, status)
select users.id, teams.id, 'Firebase auth callback is stuck',
  'The OAuth redirect returns, but the session never appears in the client.',
  'Backend', 'open'
from public.users
cross join public.teams
where users.github_username = 'team-a-lead'
  and teams.github_repo = 'matsushimaeito0930-hue/Izumo-main'
  and not exists (
    select 1 from public.help_posts
    where title = 'Firebase auth callback is stuck'
  );

insert into public.help_posts (user_id, team_id, title, body, category, status)
select users.id, teams.id, 'Need a fast UI review',
  'We have the flow working and want a mentor to check if the first screen makes sense.',
  'UI/UX', 'helping'
from public.users
cross join public.teams
where users.github_username = 'team-b-dev'
  and teams.github_repo = 'example/team-b'
  and not exists (
    select 1 from public.help_posts
    where title = 'Need a fast UI review'
  );
