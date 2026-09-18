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
    return NextResponse.json(
      {
        error:
          error instanceof Error
            ? error.message
            : "DMを読み込めませんでした。SupabaseのDM用更新を確認してください。"
      },
      { status: 400 }
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
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "DMを送信できませんでした。" },
      { status: 400 }
    );
  }
}
