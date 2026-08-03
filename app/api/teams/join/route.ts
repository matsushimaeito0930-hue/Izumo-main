import { NextResponse } from "next/server";
import { isGitHubAuthConfigured } from "@/lib/github-auth";
import { getCurrentIdentity } from "@/lib/session";
import { joinTeamByName } from "@/lib/store";

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
    teamName?: string;
    displayName?: string;
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

  try {
    const session = await joinTeamByName({
      teamName,
      displayName,
      githubUsername
    });

    return NextResponse.json({
      session: {
        ...session,
        role: identity?.role === "admin" ? "admin" : session.role
      }
    });
  } catch (error) {
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "チームに参加できませんでした。" },
      { status: 400 }
    );
  }
}
