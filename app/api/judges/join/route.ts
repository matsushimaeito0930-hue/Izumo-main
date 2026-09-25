import { randomUUID } from "node:crypto";
import { NextResponse } from "next/server";
import {
  SESSION_COOKIE,
  SESSION_MAX_AGE,
  serializeIdentity
} from "@/lib/github-auth";
import { getCurrentIdentity } from "@/lib/session";
import {
  getEvent,
  getEventIdForAccessCode,
  getEventsJoinedBy,
  isEventOwner,
  syncDirectMessageProfile
} from "@/lib/store";

export const dynamic = "force-dynamic";

/** 招待コードからイベントを確定し、審査員の閲覧セッションを発行する。 */
export async function POST(request: Request) {
  const identity = await getCurrentIdentity();
  const body = (await request.json().catch(() => ({}))) as {
    code?: string;
    displayName?: string;
  };
  const displayName = body.displayName?.trim() || identity?.displayName;
  if (!displayName || !body.code?.trim()) {
    return NextResponse.json({ error: "招待コードと名前を入力してください。" }, { status: 400 });
  }

  try {
    const eventId = await getEventIdForAccessCode(body.code);
    if (!eventId) {
      return NextResponse.json(
        { error: "招待コードが違います。運営から配られたコードを確認してください。" },
        { status: 403 }
      );
    }
    const event = await getEvent(eventId);
    if (!event) return NextResponse.json({ error: "イベントが見つかりません。" }, { status: 404 });

    const login = identity?.login ?? `judge-${randomUUID().slice(0, 8)}`;
    const existingEvent = identity
      ? (await getEventsJoinedBy(login)).find((joined) => joined.id === eventId)
      : undefined;
    const existingRole = existingEvent?.role;
    const owner = identity
      ? await isEventOwner({ eventId, githubUsername: login })
      : false;
    // 同じイベントの既存参加者・主催者は、その権限を失わせない。
    const role = owner ? "admin" : existingRole ?? "judge";
    if (!existingRole && !owner) {
      await syncDirectMessageProfile({
        eventId,
        githubUsername: login,
        displayName,
        avatarUrl: identity?.avatarUrl ?? null,
        role: "judge"
      });
    }

    const response = NextResponse.json({
      session: {
        role,
        displayName,
        githubUsername: login,
        eventId,
        eventName: event.name,
        teamId: role === "participant" ? existingEvent?.teamId : undefined,
        teamName: role === "participant" ? existingEvent?.teamName : undefined
      }
    });
    response.cookies.set(
      SESSION_COOKIE,
      serializeIdentity({
        githubId: identity?.githubId ?? 0,
        login,
        displayName,
        avatarUrl: identity?.avatarUrl ?? null,
        role,
        eventId,
        issuedAt: Math.floor(Date.now() / 1000),
        accessToken: identity?.accessToken,
        scopes: identity?.scopes
      }),
      {
        httpOnly: true,
        sameSite: "lax",
        secure: process.env.NODE_ENV === "production",
        path: "/",
        maxAge: SESSION_MAX_AGE
      }
    );
    return response;
  } catch (error) {
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "審査員として参加できませんでした。" },
      { status: 503 }
    );
  }
}
