import { NextResponse } from "next/server";
import { apiFailure } from "@/lib/api-error";
import { isDemoModeEnabled } from "@/lib/env";
import { isGitHubAuthConfigured } from "@/lib/github-auth";
import { getCurrentIdentity } from "@/lib/session";
import { createHelpReply, getHelpPostById } from "@/lib/store";

export const dynamic = "force-dynamic";

export async function POST(request: Request) {
  const identity = await getCurrentIdentity();

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

  if (isGitHubAuthConfigured() && identity && !identity.eventId) {
    return NextResponse.json({ error: "イベントを選択してください。" }, { status: 400 });
  }

  // 運営も回答できる。小規模な会では運営が技術サポートを兼ねるため、
  // 質問に答える手段が無いと詰まる。発言者の役割は表示に出るので、
  // 誰が答えたかは読み手に分かる。

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
    if (identity?.eventId) {
      const post = await getHelpPostById(body.helpPostId, identity.eventId);
      if (!post) {
        return NextResponse.json({ error: "このイベントの投稿が見つかりません。" }, { status: 404 });
      }
    }

    const reply = await createHelpReply({
      helpPostId: body.helpPostId,
      authorName,
      authorGithub: identity?.login,
      authorRole: identity?.role ?? "participant",
      body: body.body
    });

    return NextResponse.json({ reply });
  } catch (error) {
    return apiFailure("help-replies", error, "回答を投稿できませんでした。");
  }
}
