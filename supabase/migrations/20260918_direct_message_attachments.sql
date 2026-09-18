-- DM画像は非公開バケットに保存し、Next.js APIが当事者向けに期限付きURLを発行する。
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

alter table public.direct_messages
  add column if not exists attachment_path text,
  add column if not exists attachment_name text,
  add column if not exists attachment_mime_type text,
  add column if not exists attachment_size integer;

-- 画像だけのDMも許可する。本文は空文字を許可するが、本文と画像の両方が空は許可しない。
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
