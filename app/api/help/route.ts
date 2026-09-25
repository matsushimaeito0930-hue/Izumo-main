import { NextResponse } from "next/server";
import { apiFailure } from "@/lib/api-error";
import { isDemoModeEnabled } from "@/lib/env";
import { isGitHubAuthConfigured } from "@/lib/github-auth";
import { getCurrentIdentity } from "@/lib/session";
import { createHelpPost, getMembershipInEvent, getTeamById } from "@/lib/store";

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
      { error: "GitHubでログインしてから質問を投稿してください。" },
      { status: 401 }
    );
  }

  if (isGitHubAuthConfigured() && identity && !identity.eventId) {
    return NextResponse.json({ error: "イベントを選択してください。" }, { status: 400 });
  }

  // 運営は回答する側。全員に伝えたいことはお知らせを使う。
  if (identity?.role === "admin") {
    return NextResponse.json(
      { error: "運営は質問への回答とお知らせを利用してください。" },
      { status: 403 }
    );
  }

  const body = (await request.json().catch(() => ({}))) as {
    teamId?: string;
    title?: string;
    body?: string;
    category?: string;
    anonymous?: boolean;
  };

  if (!body.teamId || !body.title || !body.body || !body.category) {
    return NextResponse.json(
      { error: "チーム・タイトル・詳細・カテゴリを入力してください。" },
      { status: 400 }
    );
  }

  if (identity?.eventId) {
    const team = await getTeamById(body.teamId);
    if (!team || team.event_id !== identity.eventId) {
      return NextResponse.json({ error: "このイベントのチームではありません。" }, { status: 403 });
    }
  }

  if (identity?.role === "participant") {
    try {
      const membership = identity.eventId
        ? await getMembershipInEvent({
            eventId: identity.eventId,
            githubUsername: identity.login
          })
        : null;
      if (membership?.teamId !== body.teamId) {
        return NextResponse.json(
          { error: "自分が所属しているチームにだけ質問を投稿できます。" },
          { status: 403 }
        );
      }
    } catch {
      return NextResponse.json(
        { error: "チーム所属を確認できませんでした。" },
        { status: 403 }
      );
    }
  }

  try {
    const post = await createHelpPost({
      teamId: body.teamId,
      title: body.title,
      body: body.body,
      category: body.category,
      authorName: identity?.displayName,
      authorGithub: identity?.login,
      anonymous: body.anonymous === true
    });

    return NextResponse.json({ post });
  } catch (error) {
    return apiFailure("help", error, "質問を投稿できませんでした。");
  }
}
