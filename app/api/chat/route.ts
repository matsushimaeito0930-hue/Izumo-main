import { NextResponse } from "next/server";
import { isDemoModeEnabled } from "@/lib/env";
import { isGitHubAuthConfigured } from "@/lib/github-auth";
import { getCurrentIdentity } from "@/lib/session";
import { createChatMessage } from "@/lib/store";
import type { ChatChannel, ChatMessage } from "@/lib/types";

export const dynamic = "force-dynamic";

export async function POST(request: Request) {
  const identity = getCurrentIdentity();

  if ((isGitHubAuthConfigured() || !isDemoModeEnabled()) && !identity) {
    return NextResponse.json(
      { error: "GitHubでログインしてから運営に相談してください。" },
      { status: 401 }
    );
  }

  const body = (await request.json().catch(() => ({}))) as {
    channel?: ChatChannel;
    teamId?: string;
    authorName?: string;
    authorRole?: ChatMessage["author_role"];
    body?: string;
  };

  if (body.channel !== "staff") {
    return NextResponse.json(
      { error: "チャンネルの指定が正しくありません。" },
      { status: 400 }
    );
  }

  if (!body.body?.trim()) {
    return NextResponse.json({ error: "メッセージを入力してください。" }, { status: 400 });
  }

  if (!body.teamId) {
    return NextResponse.json({ error: "チームを選択してください。" }, { status: 400 });
  }

  try {
    const message = await createChatMessage({
      channel: body.channel,
      teamId: body.teamId,
      // ログイン済みなら投稿者名はcookieの本人情報で固定する。
      authorName: identity?.displayName ?? (body.authorName?.trim() || "HackRadar user"),
      authorRole: identity?.role ?? body.authorRole ?? "participant",
      body: body.body
    });

    return NextResponse.json({ message });
  } catch (error) {
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "メッセージを送信できませんでした。" },
      { status: 400 }
    );
  }
}
