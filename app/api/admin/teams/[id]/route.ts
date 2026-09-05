import { NextResponse } from "next/server";
import { isGitHubAuthConfigured } from "@/lib/github-auth";
import { getCurrentIdentity } from "@/lib/session";
import { getActiveEventOwner } from "@/lib/event-access";
import { deleteTeam, getTeamById, moveTeamMember, removeTeamMember, updateTeam } from "@/lib/store";

export const dynamic = "force-dynamic";

function requireAdmin() {
  const identity = getCurrentIdentity();

  if (!isGitHubAuthConfigured()) return null;
  if (!identity) {
    return NextResponse.json({ error: "GitHubでログインしてください。" }, { status: 401 });
  }
  if (identity.role !== "admin") {
    return NextResponse.json({ error: "この操作は運営のみです。" }, { status: 403 });
  }
  return null;
}

export async function PATCH(
  request: Request,
  { params }: { params: { id: string } }
) {
  const denied = requireAdmin();
  if (denied) return denied;
  const access = await getActiveEventOwner();
  const team = await getTeamById(params.id);
  if (!access || !team || team.event_id !== access.event.id) {
    return NextResponse.json({ error: "このイベントのチームではありません。" }, { status: 403 });
  }

  const body = (await request.json().catch(() => ({}))) as {
    name?: string;
    githubRepo?: string | null;
    /** メンバーの操作。部屋番号を間違えて入った人を直すために使う。 */
    removeMember?: string;
    moveMember?: { githubUsername: string; toTeamId: string };
  };

  try {
    if (body.removeMember) {
      await removeTeamMember({
        teamId: params.id,
        githubUsername: body.removeMember
      });
      return NextResponse.json({ ok: true });
    }

    if (body.moveMember) {
      const destination = await getTeamById(body.moveMember.toTeamId);
      if (!destination || destination.event_id !== access.event.id) {
        return NextResponse.json({ error: "移動先のチームが違います。" }, { status: 400 });
      }
      await moveTeamMember({
        githubUsername: body.moveMember.githubUsername,
        fromTeamId: params.id,
        toTeamId: body.moveMember.toTeamId
      });
      return NextResponse.json({ ok: true });
    }

    const team = await updateTeam({
      teamId: params.id,
      name: body.name ?? "",
      githubRepo: body.githubRepo
    });
    return NextResponse.json({ team });
  } catch (error) {
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "チームを更新できませんでした。" },
      { status: 400 }
    );
  }
}

/** チームを削除する。所属・部屋番号・活動履歴も一緒に消える。 */
export async function DELETE(
  request: Request,
  { params }: { params: { id: string } }
) {
  const denied = requireAdmin();
  if (denied) return denied;
  const access = await getActiveEventOwner();
  const team = await getTeamById(params.id);
  if (!access || !team || team.event_id !== access.event.id) {
    return NextResponse.json({ error: "このイベントのチームではありません。" }, { status: 403 });
  }

  try {
    await deleteTeam(params.id);
    return NextResponse.json({ ok: true });
  } catch (error) {
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "チームを削除できませんでした。" },
      { status: 400 }
    );
  }
}
