import { NextResponse } from "next/server";
import { randomUUID } from "node:crypto";
import {
  SESSION_COOKIE,
  SESSION_MAX_AGE,
  serializeIdentity
} from "@/lib/github-auth";
import { getCurrentIdentity } from "@/lib/session";
import { joinMentorByCode } from "@/lib/store";
import { getMentorJoinErrorMessage } from "@/lib/mentor-errors";

export const dynamic = "force-dynamic";

export async function POST(request: Request) {
  const identity = await getCurrentIdentity();

  // メンターはリポジトリを持たないので、GitHubログインを必須にしない。
  // 招待コードを知っていることが唯一の関門になる。

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

    const cookieOptions = {
      httpOnly: true,
      sameSite: "lax" as const,
      secure: process.env.NODE_ENV === "production",
      path: "/",
      maxAge: SESSION_MAX_AGE
    };

    if (identity) {
      // イベントを切り替える場合も、そのイベントで確定した役割とIDに更新する。
      response.cookies.set(
        SESSION_COOKIE,
        serializeIdentity({ ...identity, role: session.role, eventId: session.eventId }),
        cookieOptions
      );
    } else if (!identity) {
      // GitHubログインなしのメンター。名乗った名前をcookieに焼き込むことで、
      // 以後の投稿でも本人の申告ではなくこのcookieの値が使われる。
      response.cookies.set(
        SESSION_COOKIE,
        serializeIdentity({
          githubId: 0,
          login: session.githubUsername ?? `mentor-${randomUUID().slice(0, 8)}`,
          displayName,
          avatarUrl: null,
          role: "mentor",
          eventId: session.eventId,
          issuedAt: Math.floor(Date.now() / 1000)
        }),
        cookieOptions
      );
    }

    return response;
  } catch (error) {
    console.error("[mentor-join] failed", error);
    return NextResponse.json(
      { error: getMentorJoinErrorMessage(error) },
      { status: 400 }
    );
  }
}
