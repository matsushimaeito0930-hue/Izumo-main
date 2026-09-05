import { NextResponse } from "next/server";
import { isGitHubAuthConfigured } from "@/lib/github-auth";
import { getCurrentIdentity } from "@/lib/session";
import { getActiveEventOwner } from "@/lib/event-access";
import {
  createTeamInvite,
  createTeamInviteForTeam,
  getTeamInvites
} from "@/lib/store";

export const dynamic = "force-dynamic";

function requireAdmin() {
  const identity = getCurrentIdentity();

  if (!isGitHubAuthConfigured()) return null;
  if (!identity) {
    return NextResponse.json(
      { error: "GitHubでログインしてください。" },
      { status: 401 }
    );
  }
  if (identity.role !== "admin") {
    return NextResponse.json(
      { error: "この操作は運営のみです。" },
      { status: 403 }
    );
  }
  return null;
}

export async function GET() {
  const denied = requireAdmin();
  if (denied) return denied;
  const access = await getActiveEventOwner();
  if (!access) {
    return NextResponse.json({ error: "このイベントを管理する権限がありません。" }, { status: 403 });
  }

  const invites = await getTeamInvites(access.event.id);
  return NextResponse.json({ invites });
}

export async function POST(request: Request) {
  const denied = requireAdmin();
  if (denied) return denied;
  const access = await getActiveEventOwner();
  if (!access) {
    return NextResponse.json({ error: "このイベントを管理する権限がありません。" }, { status: 403 });
  }

  const identity = getCurrentIdentity();

  const body = (await request.json().catch(() => ({}))) as {
    teamId?: string;
    teamName?: string;
    githubRepo?: string;
    invitedBy?: string;
  };

  if (!body.teamId && (!body.teamName || !body.githubRepo)) {
    return NextResponse.json(
      { error: "チームまたはチーム名とGitHubリポジトリを指定してください。" },
      { status: 400 }
    );
  }

  try {
    const invitedBy = identity?.displayName ?? body.invitedBy ?? "HackRadar 運営";
    const invite = body.teamId
      ? await createTeamInviteForTeam({ teamId: body.teamId, invitedBy })
      : await createTeamInvite({
          teamName: body.teamName as string,
          githubRepo: body.githubRepo as string,
          invitedBy,
          eventId: access.event.id
        });

    return NextResponse.json({ invite });
  } catch (error) {
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "招待コードの作成に失敗しました。" },
      { status: 500 }
    );
  }
}
