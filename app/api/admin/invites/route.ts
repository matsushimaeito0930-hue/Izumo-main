import { NextResponse } from "next/server";
import { isGitHubAuthConfigured } from "@/lib/github-auth";
import { getCurrentIdentity } from "@/lib/session";
import { createTeamInvite, getTeamInvites } from "@/lib/store";

export const dynamic = "force-dynamic";

export async function GET() {
  const invites = await getTeamInvites();
  return NextResponse.json({ invites });
}

export async function POST(request: Request) {
  const identity = getCurrentIdentity();

  // GitHubログインを設定していない環境（ローカルデモ）では従来どおり素通しする。
  if (isGitHubAuthConfigured()) {
    if (!identity) {
      return NextResponse.json(
        { error: "GitHubでログインしてから招待を作成してください。" },
        { status: 401 }
      );
    }

    // ADMIN_GITHUB_LOGINS が設定されている場合のみ運営限定にする。
    const adminOnly = Boolean(process.env.ADMIN_GITHUB_LOGINS);
    if (adminOnly && identity.role !== "admin") {
      return NextResponse.json(
        { error: "招待コードを作成できるのは運営のみです。" },
        { status: 403 }
      );
    }
  }

  const body = (await request.json().catch(() => ({}))) as {
    teamName?: string;
    githubRepo?: string;
    invitedBy?: string;
  };

  if (!body.teamName || !body.githubRepo) {
    return NextResponse.json(
      { error: "チーム名とGitHubリポジトリを入力してください。" },
      { status: 400 }
    );
  }

  try {
    const invite = await createTeamInvite({
      teamName: body.teamName,
      githubRepo: body.githubRepo,
      invitedBy: identity?.displayName ?? body.invitedBy ?? "HackRadar 運営"
    });

    return NextResponse.json({ invite });
  } catch (error) {
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "招待コードの作成に失敗しました。" },
      { status: 500 }
    );
  }
}
