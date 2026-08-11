import { randomUUID } from "node:crypto";
import { NextResponse } from "next/server";
import {
  SESSION_COOKIE,
  SESSION_MAX_AGE,
  serializeIdentity
} from "@/lib/github-auth";
import { getCurrentIdentity } from "@/lib/session";
import { verifyMentorInviteCode } from "@/lib/store";

export const dynamic = "force-dynamic";

/**
 * 審査員として入る。
 *
 * 審査員は開発状況とお知らせを見るだけなので、GitHubログインもチーム所属も要らない。
 * 招待コードを知っていることが唯一の関門で、DBには何も書き込まない。
 */
export async function POST(request: Request) {
  const identity = getCurrentIdentity();

  const body = (await request.json().catch(() => ({}))) as {
    code?: string;
    displayName?: string;
  };

  const displayName = body.displayName?.trim() || identity?.displayName;

  if (!displayName || !body.code?.trim()) {
    return NextResponse.json(
      { error: "招待コードと名前を入力してください。" },
      { status: 400 }
    );
  }

  // イベントの招待コード、またはチームの部屋番号のどちらでも入れる。
  if (!(await verifyMentorInviteCode(body.code))) {
    return NextResponse.json(
      { error: "招待コードが違います。運営から配られたコードを確認してください。" },
      { status: 403 }
    );
  }

  // すでにログインしている人は、その役割のまま通す。
  //
  // 審査員にできることは運営にできることの一部なので、運営を審査員に
  // 引き下げる意味がない。参加者の場合も、上書きするとGitHubのトークンが
  // 消えてリポジトリ選択が壊れる。審査員として入るのはログインしていない人だけ。
  if (identity) {
    return NextResponse.json({
      session: {
        role: identity.role,
        displayName: identity.displayName,
        githubUsername: identity.login
      },
      keptRole: identity.role
    });
  }

  const session = {
    role: "judge" as const,
    displayName
  };

  const response = NextResponse.json({ session });

  // 名乗った名前をcookieに焼き込む。以後の表示はこの値が使われる。
  response.cookies.set(
    SESSION_COOKIE,
    serializeIdentity({
      githubId: 0,
      login: `judge-${randomUUID().slice(0, 8)}`,
      displayName,
      avatarUrl: null,
      role: "judge",
      issuedAt: Math.floor(Date.now() / 1000)
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
}
