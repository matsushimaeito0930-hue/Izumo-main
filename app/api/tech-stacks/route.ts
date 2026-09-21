import { NextResponse } from "next/server";
import { inspectGitHubRepoTechStack } from "@/lib/github-tech-stack";
import { getCurrentIdentity } from "@/lib/session";
import { getHackVerseState, getMembershipInEvent } from "@/lib/store";

export const dynamic = "force-dynamic";

/**
 * 技術構成を返す。参加者は自チームのみ、メンター・運営・審査員は全チームを閲覧できる。
 * 画面だけで絞らず、ここでも対象チームを確定して他チームの情報を返さない。
 */
export async function GET(request: Request) {
  const identity = await getCurrentIdentity();
  if (!identity?.eventId) {
    return NextResponse.json({ error: "イベントを選択してください。" }, { status: 401 });
  }
  try {
    const forceRefresh = new URL(request.url).searchParams.get("refresh") === "1";
    const state = await getHackVerseState(identity.eventId);
    let targets = state.teams;
    let scope: "own" | "all" = "all";
    if (identity.role === "participant") {
      const membership = await getMembershipInEvent({
        eventId: identity.eventId,
        githubUsername: identity.login
      });
      if (!membership) {
        return NextResponse.json({ error: "自分のチームが見つかりません。" }, { status: 403 });
      }
      targets = state.teams.filter((team) => team.id === membership.teamId);
      scope = "own";
    } else if (identity.role !== "judge" && identity.role !== "admin" && identity.role !== "mentor") {
      return NextResponse.json({ error: "技術スタックを閲覧できる役割ではありません。" }, { status: 403 });
    }
    targets = targets.filter((team) => Boolean(team.github_repo));
    const stacks = await Promise.all(
      targets.map(async (team) => ({
        teamId: team.id,
        teamName: team.name,
        ...(await inspectGitHubRepoTechStack(team.github_repo ?? "", identity.accessToken, { forceRefresh }))
      }))
    );
    return NextResponse.json(
      { stacks, scope },
      { headers: { "cache-control": "private, max-age=300" } }
    );
  } catch (error) {
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "技術スタックを取得できませんでした。" },
      { status: 400 }
    );
  }
}
