-- 既存のSupabaseプロジェクトでは、このファイルをSQL Editorで一度だけ実行してください。
-- DM本文はAPIを通じて当事者だけに返すため、anonには権限を付与しません。

create table if not exists public.direct_messages (
  id uuid primary key default gen_random_uuid(),
  sender_login text not null,
  recipient_login text not null,
  sender_name text not null,
  sender_role text not null check (sender_role in ('participant', 'mentor', 'admin', 'judge')),
  body text not null check (char_length(body) between 1 and 1000),
  created_at timestamptz not null default now(),
  check (lower(sender_login) <> lower(recipient_login))
);

create index if not exists direct_messages_sender_created_at_idx
  on public.direct_messages(sender_login, created_at);

create index if not exists direct_messages_recipient_created_at_idx
  on public.direct_messages(recipient_login, created_at);
