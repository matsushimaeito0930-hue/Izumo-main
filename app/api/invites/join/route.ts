import { NextResponse } from "next/server";
import { SESSION_COOKIE, SESSION_MAX_AGE, serializeIdentity } from "@/lib/github-auth";
import { isGitHubAuthConfigured } from "@/lib/github-auth";
import { getCurrentIdentity } from "@/lib/session";
import { joinTeamWithInvite } from "@/lib/store";

export const dynamic = "force-dynamic";

export async function POST(request: Request) {
  const identity = await getCurrentIdentity();
  const authRequired = isGitHubAuthConfigured();

  if (authRequired && !identity) {
    return NextResponse.json(
      { error: "GitHubでログインしてから参加してください。" },
      { status: 401 }
    );
  }

  const body = (await request.json().catch(() => ({}))) as {
    code?: string;
    displayName?: string;
    githubUsername?: string;
  };

  if (!body.code) {
    return NextResponse.json({ error: "招待コードを入力してください。" }, { status: 400 });
  }

  // ログインしていれば、表示名とGitHubユーザー名はクライアントの申告ではなく
  // cookieの本人情報を使う。OAuth未設定のローカルデモのみ手入力を許す。
  const displayName = identity?.displayName ?? body.displayName?.trim();
  const githubUsername = identity?.login ?? body.githubUsername?.trim();

  if (!displayName) {
    return NextResponse.json({ error: "表示名を入力してください。" }, { status: 400 });
  }

  try {
    const session = await joinTeamWithInvite({
      code: body.code,
      displayName,
      githubUsername,
      // 招待リンクでの参加は、以前の主催者ロールを引き継がない。
      role: "participant"
    });

    const response = NextResponse.json({
      session: {
        ...session,
        role: "participant"
      }
    });
    if (identity) {
      response.cookies.set(
        SESSION_COOKIE,
        serializeIdentity({
          ...identity,
          role: "participant",
          eventId: session.eventId
        }),
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
      { error: error instanceof Error ? error.message : "チームに参加できませんでした。" },
      { status: 400 }
    );
  }
}
