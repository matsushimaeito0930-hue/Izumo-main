import { NextResponse } from "next/server";
import { isGitHubAuthConfigured } from "@/lib/github-auth";
import { ensureRepoWebhook, type WebhookSetupResult } from "@/lib/github-webhook-setup";
import { getCurrentIdentity } from "@/lib/session";
import { getEvent, joinTeamWithInvite, setTeamRepo } from "@/lib/store";

export const dynamic = "force-dynamic";

export async function POST(request: Request) {
  const identity = getCurrentIdentity();

  if (isGitHubAuthConfigured() && !identity) {
    return NextResponse.json(
      { error: "GitHubでログインしてからチームに参加してください。" },
      { status: 401 }
    );
  }

  const body = (await request.json().catch(() => ({}))) as {
    joinCode?: string;
    displayName?: string;
    githubRepo?: string;
  };

  const displayName = identity?.displayName ?? body.displayName?.trim();
  const githubUsername = identity?.login;

  if (!body.joinCode?.trim() || !displayName) {
    return NextResponse.json(
      { error: "チーム招待コードと表示名を入力してください。" },
      { status: 400 }
    );
  }

  // 全体コードは運営・メンター用。参加者が間違えて入れやすいので専用の案内を出す。
  const event = await getEvent();
  if (
    event?.join_code &&
    body.joinCode.trim().toUpperCase() === event.join_code.toUpperCase()
  ) {
    return NextResponse.json(
      {
        error:
          "それは運営・メンター用の全体コードです。参加者は、運営から配られたチームごとの部屋番号を入力してください。"
      },
      { status: 400 }
    );
  }

  try {
    const session = await joinTeamWithInvite({
      code: body.joinCode,
      displayName,
      githubUsername,
      role: identity?.role
    });

    // リポジトリは任意。指定があればこの場で紐づけ、Webhookも自動登録する。
    let webhook: WebhookSetupResult | null = null;

    if (body.githubRepo?.trim() && session.teamId) {
      try {
        await setTeamRepo({ teamId: session.teamId, githubRepo: body.githubRepo });
        webhook = await ensureRepoWebhook({
          accessToken: identity?.accessToken,
          scopes: identity?.scopes,
          githubRepo: body.githubRepo,
          requestUrl: request.url
        });
      } catch (repoError) {
        // 参加自体は成立させ、リポジトリはあとから設定してもらう。
        return NextResponse.json({
          session: {
            ...session,
            role: identity?.role === "admin" ? "admin" : session.role
          },
          repoWarning:
            repoError instanceof Error
              ? repoError.message
              : "リポジトリを設定できませんでした。"
        });
      }
    }

    return NextResponse.json({
      session: {
        ...session,
        role: identity?.role === "admin" ? "admin" : session.role
      },
      webhook
    });
  } catch (error) {
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "チームに参加できませんでした。" },
      { status: 400 }
    );
  }
}
