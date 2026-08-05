import { NextResponse } from "next/server";
import { isDemoModeEnabled } from "@/lib/env";
import { isGitHubAuthConfigured } from "@/lib/github-auth";
import { getCurrentIdentity } from "@/lib/session";
import { setTeamRepo } from "@/lib/store";

export const dynamic = "force-dynamic";

/** チームにGitHubリポジトリを紐づける。参加後にいつでも変更できる。 */
export async function POST(request: Request) {
  const identity = getCurrentIdentity();

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

  try {
    const team = await setTeamRepo({
      teamId: body.teamId,
      githubRepo: body.githubRepo
    });
    return NextResponse.json({ team });
  } catch (error) {
    return NextResponse.json(
      {
        error: error instanceof Error ? error.message : "リポジトリを設定できませんでした。"
      },
      { status: 400 }
    );
  }
}
