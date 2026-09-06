import { NextResponse } from "next/server";
import {
  SESSION_COOKIE,
  SESSION_MAX_AGE,
  serializeIdentity
} from "@/lib/github-auth";
import { getCurrentIdentity } from "@/lib/session";
import { getEvent, getMembershipInEvent, isEventOwner } from "@/lib/store";

export const dynamic = "force-dynamic";

/** 所有イベントを開き、以降の画面・APIをそのイベントに固定する。 */
export async function POST(request: Request) {
  const identity = getCurrentIdentity();
  const body = (await request.json().catch(() => ({}))) as { eventId?: string; role?: string };
  if (!identity || !body.eventId) {
    return NextResponse.json({ error: "イベントを開くにはログインが必要です。" }, { status: 401 });
  }

  const isOwner = await isEventOwner({ eventId: body.eventId, githubUsername: identity.login });
  const membership = await getMembershipInEvent({
    eventId: body.eventId,
    githubUsername: identity.login
  });
  const role = body.role === "participant" ? "participant" : "admin";
  if ((role === "admin" && !isOwner) || (role === "participant" && !membership)) {
    return NextResponse.json({ error: "このイベントを管理する権限がありません。" }, { status: 403 });
  }

  const event = await getEvent(body.eventId);
  if (!event) return NextResponse.json({ error: "Event not found." }, { status: 404 });
  const response = NextResponse.json({
    event,
    session: {
      role,
      displayName: identity.displayName,
      githubUsername: identity.login,
      eventId: event.id,
      eventName: event.name,
      teamId: membership?.teamId,
      teamName: membership?.teamName
    }
  });
  response.cookies.set(
    SESSION_COOKIE,
    serializeIdentity({ ...identity, role, eventId: body.eventId }),
    {
      httpOnly: true,
      sameSite: "lax",
      secure: process.env.NODE_ENV === "production",
      path: "/",
      maxAge: SESSION_MAX_AGE
    }
  );
  return response;
}
