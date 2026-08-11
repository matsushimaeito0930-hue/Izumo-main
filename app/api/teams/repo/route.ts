import { NextResponse } from "next/server";
import { isDemoModeEnabled } from "@/lib/env";
import { isGitHubAuthConfigured } from "@/lib/github-auth";
import { ensureRepoWebhook } from "@/lib/github-webhook-setup";
import { getCurrentIdentity } from "@/lib/session";
import { isTeamMember, setTeamRepo } from "@/lib/store";

export const dynamic = "force-dynamic";

/** チームにGitHubリポジトリを紐づける。参加後にいつでも変更できる。 */
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
      { error: "GitHubでログインしてください。" },
      { status: 401 }
    );
  }

  const body = (await request.json().catch(() => ({}))) as {
    teamId?: string;
    githubRepo?: string;
  };

  if (!body.teamId || !body.githubRepo) {
    return NextResponse.json(
      { error: "チームとリポジトリを指定してください。" },
      { status: 400 }
    );
  }

  if (identity?.role === "participant") {
    try {
      if (!(await isTeamMember({ githubUsername: identity.login, teamId: body.teamId }))) {
        return NextResponse.json(
          { error: "自分が所属しているチームのリポジトリだけ設定できます。" },
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
    const team = await setTeamRepo({
      teamId: body.teamId,
      githubRepo: body.githubRepo
    });

    // 参加者に手作業でWebhookを張らせないため、ここで自動登録する。
    // 失敗してもリポジトリ設定は成功のままにして、理由だけ返す。
    const webhook = await ensureRepoWebhook({
      accessToken: identity?.accessToken,
      scopes: identity?.scopes,
      githubRepo: body.githubRepo,
      requestUrl: request.url
    });

    return NextResponse.json({ team, webhook });
  } catch (error) {
    return NextResponse.json(
      {
        error: error instanceof Error ? error.message : "リポジトリを設定できませんでした。"
      },
      { status: 400 }
    );
  }
}
