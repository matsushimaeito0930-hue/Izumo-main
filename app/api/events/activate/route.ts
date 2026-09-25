import { NextResponse } from "next/server";
import {
  SESSION_COOKIE,
  SESSION_MAX_AGE,
  serializeIdentity
} from "@/lib/github-auth";
import { getCurrentIdentity } from "@/lib/session";
import { getEvent, getEventsJoinedBy, getMembershipInEvent, isEventOwner } from "@/lib/store";
import type { UserRole } from "@/lib/types";

export const dynamic = "force-dynamic";

/** 所有イベントを開き、以降の画面・APIをそのイベントに固定する。 */
export async function POST(request: Request) {
  const identity = await getCurrentIdentity();
  const body = (await request.json().catch(() => ({}))) as { eventId?: string; role?: string };
  if (!identity || !body.eventId) {
    return NextResponse.json({ error: "イベントを開くにはログインが必要です。" }, { status: 401 });
  }

  const role: UserRole =
    body.role === "participant" || body.role === "mentor" || body.role === "judge"
      ? body.role
      : "admin";
  const [isOwner, joinedEvents] = await Promise.all([
    isEventOwner({ eventId: body.eventId, githubUsername: identity.login }),
    getEventsJoinedBy(identity.login)
  ]);
  const joined = joinedEvents.find((event) => event.id === body.eventId);
  const membership = role === "participant"
    ? await getMembershipInEvent({ eventId: body.eventId, githubUsername: identity.login })
    : null;
  if (
    (role === "admin" && !isOwner) ||
    (role === "participant" && (joined?.role !== "participant" || !membership)) ||
    ((role === "mentor" || role === "judge") && joined?.role !== role)
  ) {
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
      teamId: role === "participant" ? membership?.teamId : undefined,
      teamName: role === "participant" ? membership?.teamName : undefined
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
