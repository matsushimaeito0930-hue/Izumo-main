-- このファイルは2つを直します。
--   1. DMの画像添付（列・バケット・Realtime通知）
--   2. 匿名質問の is_anonymous 列。schema.sql にしか無く、移行SQLから漏れていた。
--
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

-- 追加する前に必ず落とす。これが無いと2回目の実行が 42710 で止まる。
alter table public.direct_messages
  drop constraint if exists direct_messages_body_or_attachment_check;

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

-- 個人DMもRealtimeの通知対象にする。
-- これが無いと、相手に届くまでポーリングの間隔だけ待つことになる。
-- 通知されるのは app_change_signal の時刻だけで、DMの本文は流れない。
drop trigger if exists direct_messages_touch_app_change_signal on public.direct_messages;
create trigger direct_messages_touch_app_change_signal
after insert or update or delete on public.direct_messages
for each statement execute function public.touch_app_change_signal();

-- 匿名質問の列。schema.sql には入っていたが、移行SQLから漏れていた。
-- この列が無いと、質問の投稿そのものが失敗する。
alter table public.help_posts
  add column if not exists is_anonymous boolean not null default false;

-- 併せて、古いDBに欠けている可能性のある列も埋めておく。
alter table public.teams
  add column if not exists commit_count integer not null default 0;

-- PostgRESTは表の定義をキャッシュしている。
-- これを忘れると、列を足したのに
-- 「Could not find the '...' column ... in the schema cache」と言われ続ける。
notify pgrst, 'reload schema';
