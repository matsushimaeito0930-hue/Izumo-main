import { NextResponse } from "next/server";
import { isDemoModeEnabled } from "@/lib/env";
import { isGitHubAuthConfigured } from "@/lib/github-auth";
import { getCurrentIdentity } from "@/lib/session";
import { createHelpReply } from "@/lib/store";

export const dynamic = "force-dynamic";

export async function POST(request: Request) {
  const identity = getCurrentIdentity();

  // 審査員は閲覧専用。画面を書き換えて送っても通さない。
  if (identity?.role === "judge") {
    return NextResponse.json(
      { error: "審査員は閲覧のみです。投稿はできません。" },
      { status: 403 }
    );
  }

  if ((isGitHubAuthConfigured() || !isDemoModeEnabled()) && !identity) {
    return NextResponse.json(
      { error: "GitHubでログインしてから回答してください。" },
      { status: 401 }
    );
  }

  if (identity?.role === "admin") {
    return NextResponse.json(
      { error: "運営はお知らせチャットのみ利用できます。" },
      { status: 403 }
    );
  }

  const body = (await request.json().catch(() => ({}))) as {
    helpPostId?: string;
    body?: string;
    authorName?: string;
  };

  if (!body.helpPostId || !body.body?.trim()) {
    return NextResponse.json(
      { error: "回答する投稿と本文が必要です。" },
      { status: 400 }
    );
  }

  // ログイン済みなら本人名義で固定する。未設定環境のみ手入力を許す。
  const authorName = identity?.displayName ?? body.authorName?.trim();

  if (!authorName) {
    return NextResponse.json({ error: "表示名が必要です。" }, { status: 400 });
  }

  try {
    const reply = await createHelpReply({
      helpPostId: body.helpPostId,
      authorName,
      authorGithub: identity?.login,
      authorRole: identity?.role ?? "participant",
      body: body.body
    });

    return NextResponse.json({ reply });
  } catch (error) {
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "回答を投稿できませんでした。" },
      { status: 400 }
    );
  }
}
