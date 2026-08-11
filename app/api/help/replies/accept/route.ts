import { NextResponse } from "next/server";
import { isGitHubAuthConfigured } from "@/lib/github-auth";
import { getCurrentIdentity } from "@/lib/session";
import { acceptHelpReply, getHelpPostById } from "@/lib/store";

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

  if (identity?.role === "admin") {
    return NextResponse.json(
      { error: "運営はお知らせチャットのみ利用できます。" },
      { status: 403 }
    );
  }

  const body = (await request.json().catch(() => ({}))) as {
    helpPostId?: string;
    replyId?: string;
  };

  if (!body.helpPostId || !body.replyId) {
    return NextResponse.json(
      { error: "投稿と回答の指定が必要です。" },
      { status: 400 }
    );
  }

  const post = await getHelpPostById(body.helpPostId);

  if (!post) {
    return NextResponse.json({ error: "投稿が見つかりません。" }, { status: 404 });
  }

  // 採用できるのは質問者本人と運営のみ。
  if (isGitHubAuthConfigured()) {
    if (!identity) {
      return NextResponse.json(
        { error: "GitHubでログインしてください。" },
        { status: 401 }
      );
    }

    const isAuthor = post.author_github === identity.login;
    if (!isAuthor) {
      return NextResponse.json(
        { error: "ベストアンサーを選べるのは質問者本人か運営だけです。" },
        { status: 403 }
      );
    }
  }

  try {
    await acceptHelpReply({ helpPostId: body.helpPostId, replyId: body.replyId });
    return NextResponse.json({ ok: true });
  } catch (error) {
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "採用に失敗しました。" },
      { status: 400 }
    );
  }
}
