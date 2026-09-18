import { NextResponse } from "next/server";
import { randomUUID } from "node:crypto";
import { getCurrentIdentity } from "@/lib/session";
import { createServerSupabaseClient } from "@/lib/supabase";
import {
  createDirectMessage,
  getDirectMessageContacts,
  getDirectMessages,
  syncDirectMessageProfile
} from "@/lib/store";

export const dynamic = "force-dynamic";

const ATTACHMENT_BUCKET = "direct-message-attachments";
const MAX_IMAGE_SIZE = 5 * 1024 * 1024;
const IMAGE_EXTENSIONS: Record<string, string> = {
  "image/jpeg": "jpg",
  "image/png": "png",
  "image/gif": "gif",
  "image/webp": "webp"
};

function unauthorized() {
  return NextResponse.json(
    { error: "個人DMを使うにはログインが必要です。" },
    { status: 401 }
  );
}

/**
 * 失敗の理由を取り出す。
 *
 * Supabaseのエラーは Error のインスタンスではなく
 * `{ message, details, hint, code }` の素のオブジェクトで返る。
 * instanceof だけで判定すると理由が消え、画面に汎用文しか出なくなる。
 */
function describe(error: unknown, fallback: string) {
  if (error instanceof Error) {
    return { message: error.message, code: undefined as string | undefined };
  }

  if (error && typeof error === "object") {
    const source = error as {
      message?: unknown;
      details?: unknown;
      hint?: unknown;
      code?: unknown;
    };
    const parts = [source.message, source.details, source.hint]
      .filter((part): part is string => typeof part === "string" && part.length > 0)
      .join(" / ");

    if (parts) {
      return {
        message: parts,
        code: typeof source.code === "string" ? source.code : undefined
      };
    }
  }

  return { message: fallback, code: undefined as string | undefined };
}

/**
 * DBのエラーコードを、次の一手が分かる日本語にする。
 * ここに出るものはほぼ移行SQLの未実行が原因なので、実行すべきファイル名まで書く。
 */
const DB_HINTS: Record<string, string> = {
  "42P01": "DMの表がまだありません。Supabaseで supabase/schema.sql を実行してください。",
  "42703":
    "DMの表に画像添付用の項目がありません。Supabaseで supabase/migrations/20260918_direct_message_attachments.sql を実行してください。",
  PGRST204:
    "DMの表に画像添付用の項目がありません。Supabaseで supabase/migrations/20260918_direct_message_attachments.sql を実行してください。",
  "42501":
    "DBへの書き込みが拒否されました。VercelのSUPABASE_SERVICE_ROLE_KEYを確認してください。",
  "23503":
    "参加中のイベントがDBに見つかりません。ログアウトして入り直してください。",
  "23514":
    "メッセージの内容がDBの条件に合いません。画像添付用の移行SQLが未実行の可能性があります。",
  "22P02": "イベントIDの形式が不正です。ログアウトして入り直してください。"
};

function failure(error: unknown, fallback: string) {
  const { message, code } = describe(error, fallback);
  const hint = code ? DB_HINTS[code] : undefined;

  // バケット未作成はコードが付かないことがあるので、本文からも拾う。
  const bucketMissing = /bucket/i.test(message) && /not found|does not exist/i.test(message);
  const resolved = hint
    ? `${hint}（${code}: ${message}）`
    : bucketMissing
      ? `画像の保存先がまだありません。Supabaseで supabase/migrations/20260918_direct_message_attachments.sql を実行してください。（${message}）`
      : message;

  console.error("[direct-messages]", code ?? "-", message, error);

  return NextResponse.json({ error: resolved, code }, { status: 400 });
}

async function syncViewer() {
  const identity = await getCurrentIdentity();
  if (!identity || identity.role === "judge" || !identity.eventId) return null;

  await syncDirectMessageProfile({
    eventId: identity.eventId,
    githubUsername: identity.login,
    displayName: identity.displayName,
    avatarUrl: identity.avatarUrl,
    role: identity.role
  });
  return { ...identity, eventId: identity.eventId };
}

export async function GET() {
  try {
    const identity = await syncViewer();
    if (!identity) return unauthorized();

    const [contacts, messages] = await Promise.all([
      getDirectMessageContacts({
        eventId: identity.eventId,
        viewerLogin: identity.login,
        viewerRole: identity.role
      }),
      getDirectMessages(identity.login, identity.eventId)
    ]);

    return NextResponse.json({ contacts, messages });
  } catch (error) {
    return failure(
      error,
      "DMを読み込めませんでした。SupabaseのDM用更新を確認してください。"
    );
  }
}

export async function POST(request: Request) {
  let uploadedAttachmentPath: string | null = null;
  try {
    const identity = await syncViewer();
    if (!identity) return unauthorized();

    const formData = await request.formData();
    const recipientLogin = String(formData.get("recipientLogin") ?? "");
    const body = String(formData.get("body") ?? "");
    const attachment = formData.get("attachment");

    let attachmentName: string | null = null;
    let attachmentMimeType: string | null = null;
    let attachmentSize: number | null = null;

    if (attachment instanceof File && attachment.size > 0) {
      const extension = IMAGE_EXTENSIONS[attachment.type];
      if (!extension) {
        throw new Error("添付できる画像はPNG・JPEG・GIF・WebPのみです。");
      }
      if (attachment.size > MAX_IMAGE_SIZE) {
        throw new Error("画像は5MB以下にしてください。");
      }

      const supabase = createServerSupabaseClient();
      if (!supabase) {
        throw new Error("画像添付にはSupabase Storageの設定が必要です。");
      }

      uploadedAttachmentPath = `${identity.eventId}/${randomUUID()}.${extension}`;
      const { error: uploadError } = await supabase.storage
        .from(ATTACHMENT_BUCKET)
        .upload(uploadedAttachmentPath, Buffer.from(await attachment.arrayBuffer()), {
          contentType: attachment.type,
          upsert: false
        });
      if (uploadError) throw uploadError;

      attachmentName = attachment.name.slice(0, 255) || `image.${extension}`;
      attachmentMimeType = attachment.type;
      attachmentSize = attachment.size;
    }

    const message = await createDirectMessage({
      senderLogin: identity.login,
      senderName: identity.displayName,
      senderRole: identity.role,
      eventId: identity.eventId,
      recipientLogin,
      body,
      attachmentPath: uploadedAttachmentPath,
      attachmentName,
      attachmentMimeType,
      attachmentSize
    });

    return NextResponse.json({ message });
  } catch (error) {
    if (uploadedAttachmentPath) {
      const supabase = createServerSupabaseClient();
      await supabase?.storage.from(ATTACHMENT_BUCKET).remove([uploadedAttachmentPath]);
    }
    return failure(error, "DMを送信できませんでした。");
  }
}
