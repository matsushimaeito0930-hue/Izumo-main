import { NextResponse } from "next/server";
import { getCurrentIdentity } from "@/lib/session";
import {
  createDirectMessage,
  getDirectMessageContacts,
  getDirectMessages,
  syncDirectMessageProfile
} from "@/lib/store";

export const dynamic = "force-dynamic";

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
  try {
    const identity = await syncViewer();
    if (!identity) return unauthorized();

    const body = (await request.json().catch(() => ({}))) as {
      recipientLogin?: string;
      body?: string;
    };

    const message = await createDirectMessage({
      senderLogin: identity.login,
      senderName: identity.displayName,
      senderRole: identity.role,
      eventId: identity.eventId,
      recipientLogin: body.recipientLogin ?? "",
      body: body.body ?? ""
    });

    return NextResponse.json({ message });
  } catch (error) {
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "DMを送信できませんでした。" },
      { status: 400 }
    );
  }
}
