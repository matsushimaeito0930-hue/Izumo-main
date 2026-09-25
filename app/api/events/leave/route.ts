import { NextResponse } from "next/server";
import {
  SESSION_COOKIE,
  SESSION_MAX_AGE,
  serializeIdentity
} from "@/lib/github-auth";
import { getCurrentIdentity } from "@/lib/session";
import { leaveEventAsParticipant } from "@/lib/store";

export const dynamic = "force-dynamic";

/** 参加者が終了済みイベントの所属を自分で外す。共有の活動記録は消さない。 */
export async function POST(request: Request) {
  const identity = await getCurrentIdentity();
  const body = (await request.json().catch(() => ({}))) as { eventId?: string };
  if (!identity || !body.eventId) {
    return NextResponse.json({ error: "退出するにはGitHubでログインしてください。" }, { status: 401 });
  }

  try {
    await leaveEventAsParticipant({
      eventId: body.eventId,
      githubUsername: identity.login
    });

    const response = NextResponse.json({ left: true });
    // 開いていたイベントを退出した場合だけ、古い所属を含むcookieを解除する。
    if (identity.eventId === body.eventId) {
      response.cookies.set(
        SESSION_COOKIE,
        serializeIdentity({ ...identity, role: "participant", eventId: undefined }),
        {
          httpOnly: true,
          sameSite: "lax",
          secure: process.env.NODE_ENV === "production",
          path: "/",
          maxAge: SESSION_MAX_AGE
        }
      );
    }
    return response;
  } catch (error) {
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "イベントから退出できませんでした。" },
      { status: 400 }
    );
  }
}
