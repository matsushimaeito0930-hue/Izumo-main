import { NextResponse } from "next/server";
import {
  SESSION_COOKIE,
  SESSION_MAX_AGE,
  isGitHubAuthConfigured,
  serializeIdentity
} from "@/lib/github-auth";
import { getCurrentIdentity } from "@/lib/session";
import { joinMentorByCode } from "@/lib/store";

export const dynamic = "force-dynamic";

export async function POST(request: Request) {
  const identity = getCurrentIdentity();

  if (isGitHubAuthConfigured() && !identity) {
    return NextResponse.json(
      { error: "GitHubでログインしてからメンター登録をしてください。" },
      { status: 401 }
    );
  }

  const body = (await request.json().catch(() => ({}))) as {
    code?: string;
    displayName?: string;
    specialty?: string;
  };

  const displayName = body.displayName?.trim() || identity?.displayName;
  const specialty = body.specialty?.trim();

  if (!displayName || !specialty || !body.code?.trim()) {
    return NextResponse.json(
      { error: "招待コード、名前、得意なことを入力してください。" },
      { status: 400 }
    );
  }

  try {
    const session = await joinMentorByCode({
      code: body.code,
      displayName,
      specialty,
      githubUsername: identity?.login,
      role: identity?.role
    });

    const response = NextResponse.json({ session });

    // GitHubログイン済みの参加者がメンター登録した場合も、以後の投稿権限を維持する。
    if (identity && identity.role !== "admin") {
      response.cookies.set(SESSION_COOKIE, serializeIdentity({ ...identity, role: "mentor" }), {
        httpOnly: true,
        sameSite: "lax",
        secure: process.env.NODE_ENV === "production",
        path: "/",
        maxAge: SESSION_MAX_AGE
      });
    }

    return response;
  } catch (error) {
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "メンター登録に失敗しました。" },
      { status: 400 }
    );
  }
}
