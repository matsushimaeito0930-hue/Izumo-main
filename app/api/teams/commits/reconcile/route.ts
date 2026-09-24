import { NextResponse } from "next/server";
import { fetchUniqueRepoCommitCount } from "@/lib/github-commits";
import { getCurrentIdentity } from "@/lib/session";
import { getEvent, getMembershipInEvent, getTeamById, updateTeamCommitCount } from "@/lib/store";

export const dynamic = "force-dynamic";

/** 自チームの表示用コミット数を、GitHubの実コミットSHAから補正する。 */
export async function POST() {
  const identity = await getCurrentIdentity();
  if (!identity?.eventId) {
    return NextResponse.json({ error: "イベントを選択してください。" }, { status: 401 });
  }

  const membership = await getMembershipInEvent({
    eventId: identity.eventId,
    githubUsername: identity.login
  });
  if (!membership) {
    return NextResponse.json({ error: "自分のチームが見つかりません。" }, { status: 403 });
  }

  const [team, event] = await Promise.all([getTeamById(membership.teamId), getEvent(identity.eventId)]);
  if (!team || team.event_id !== identity.eventId || !team.github_repo || !event) {
    return NextResponse.json({ error: "リポジトリ設定が見つかりません。" }, { status: 400 });
  }

  try {
    const commitCount = await fetchUniqueRepoCommitCount(
      team.github_repo,
      event.created_at,
      identity.accessToken
    );
    await updateTeamCommitCount(team.id, commitCount);
    return NextResponse.json({ teamId: team.id, commitCount });
  } catch (error) {
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "コミット数を照合できませんでした。" },
      { status: 502 }
    );
  }
}
