import { NextResponse } from "next/server";
import { isGitHubAuthConfigured } from "@/lib/github-auth";
import { ensureRepoWebhook, type WebhookSetupResult } from "@/lib/github-webhook-setup";
import { getCurrentIdentity } from "@/lib/session";
import { joinTeamByName, setTeamRepo, verifyJoinCode } from "@/lib/store";

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
    teamName?: string;
    displayName?: string;
    githubRepo?: string;
  };

  const teamName = body.teamName?.trim();
  const displayName = identity?.displayName ?? body.displayName?.trim();
  const githubUsername = identity?.login;

  if (!teamName || !displayName) {
    return NextResponse.json(
      { error: "チーム名と表示名を入力してください。" },
      { status: 400 }
    );
  }

  // イベントが登録されているときだけ、参加コードを照合する。
  if (!(await verifyJoinCode(body.joinCode))) {
    return NextResponse.json(
      { error: "参加コードが違います。運営から配られたコードを確認してください。" },
      { status: 403 }
    );
  }

  try {
    const session = await joinTeamByName({
      teamName,
      displayName,
      githubUsername
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
