import { NextResponse } from "next/server";
import { inspectGitHubRepoTechStack } from "@/lib/github-tech-stack";
import { getCurrentIdentity } from "@/lib/session";
import { getHackVerseState } from "@/lib/store";

export const dynamic = "force-dynamic";

/** 審査員向けに、現在のイベントの各リポジトリから技術構成を取得する。 */
export async function GET(request: Request) {
  const identity = await getCurrentIdentity();
  if (!identity?.eventId) {
    return NextResponse.json({ error: "イベントを選択してください。" }, { status: 401 });
  }
  if (identity.role !== "judge" && identity.role !== "admin" && identity.role !== "mentor") {
    return NextResponse.json({ error: "技術スタックは審査・運営用の画面です。" }, { status: 403 });
  }

  try {
    const forceRefresh = new URL(request.url).searchParams.get("refresh") === "1";
    const state = await getHackVerseState(identity.eventId);
    const targets = state.teams.filter((team) => Boolean(team.github_repo));
    const stacks = await Promise.all(
      targets.map(async (team) => ({
        teamId: team.id,
        teamName: team.name,
        ...(await inspectGitHubRepoTechStack(team.github_repo ?? "", identity.accessToken, { forceRefresh }))
      }))
    );
    return NextResponse.json(
      { stacks },
      { headers: { "cache-control": "private, max-age=300" } }
    );
  } catch (error) {
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "技術スタックを取得できませんでした。" },
      { status: 400 }
    );
  }
}
