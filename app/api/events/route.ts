import { NextResponse } from "next/server";
import {
  SESSION_COOKIE,
  SESSION_MAX_AGE,
  serializeIdentity
} from "@/lib/github-auth";
import { getCurrentIdentity } from "@/lib/session";
import { createEvent } from "@/lib/store";

export const dynamic = "force-dynamic";

/** ログイン済みの人が、自分だけが管理できる新規イベントを作成する。 */
export async function POST(request: Request) {
  const identity = await getCurrentIdentity();
  if (!identity) {
    return NextResponse.json({ error: "主催するにはGitHubでログインしてください。" }, { status: 401 });
  }

  const body = (await request.json().catch(() => ({}))) as { name?: string };
  try {
    const event = await createEvent({
      name: body.name ?? "",
      ownerGithubUsername: identity.login
    });
    const response = NextResponse.json({ event });
    response.cookies.set(
      SESSION_COOKIE,
      serializeIdentity({ ...identity, role: "admin", eventId: event.id }),
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
      { error: error instanceof Error ? error.message : "イベントを作成できませんでした。" },
      { status: 400 }
    );
  }
}
