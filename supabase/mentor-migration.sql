-- Run this once in the Supabase SQL Editor for an existing project.
alter table public.users
  add column if not exists specialty text;

alter table public.users drop constraint if exists users_role_check;
alter table public.users
  add constraint users_role_check
  check (role in ('participant', 'mentor', 'admin'));

alter table public.help_replies drop constraint if exists help_replies_author_role_check;
alter table public.help_replies
  add constraint help_replies_author_role_check
  check (author_role in ('participant', 'mentor', 'admin'));

alter table public.chat_messages drop constraint if exists chat_messages_author_role_check;
alter table public.chat_messages
  add constraint chat_messages_author_role_check
  check (author_role in ('participant', 'mentor', 'admin'));
