import { NextResponse } from "next/server";
import {
  SESSION_COOKIE,
  SESSION_MAX_AGE,
  serializeIdentity
} from "@/lib/github-auth";
import { getCurrentIdentity } from "@/lib/session";
import { getEvent, isEventOwner } from "@/lib/store";

export const dynamic = "force-dynamic";

/** 所有イベントを開き、以降の画面・APIをそのイベントに固定する。 */
export async function POST(request: Request) {
  const identity = getCurrentIdentity();
  const body = (await request.json().catch(() => ({}))) as { eventId?: string };
  if (!identity || !body.eventId) {
    return NextResponse.json({ error: "イベントを開くにはログインが必要です。" }, { status: 401 });
  }

  if (!(await isEventOwner({ eventId: body.eventId, githubUsername: identity.login }))) {
    return NextResponse.json({ error: "このイベントを管理する権限がありません。" }, { status: 403 });
  }

  const event = await getEvent(body.eventId);
  const response = NextResponse.json({ event });
  response.cookies.set(
    SESSION_COOKIE,
    serializeIdentity({ ...identity, role: "admin", eventId: body.eventId }),
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
