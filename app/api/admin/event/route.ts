import { NextResponse } from "next/server";
import { isGitHubAuthConfigured } from "@/lib/github-auth";
import { getCurrentIdentity } from "@/lib/session";
import {
  createTeamByName,
  createTeamInviteForTeam,
  deleteEvent,
  getEvent,
  saveEvent
} from "@/lib/store";

export const dynamic = "force-dynamic";

function requireAdmin() {
  const identity = getCurrentIdentity();

  if (!isGitHubAuthConfigured()) return null; // ローカルデモは素通し

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

/** 現在のイベントと参加コードを返す。 */
export async function GET() {
  const denied = requireAdmin();
  if (denied) return denied;

  const event = await getEvent();
  return NextResponse.json({ event });
}

/** イベント名を登録・変更する。イベント名を変えると全体コードも更新する。 */
export async function POST(request: Request) {
  const denied = requireAdmin();
  if (denied) return denied;

  const body = (await request.json().catch(() => ({}))) as {
    name?: string;
    teamName?: string;
  };

  try {
    // チーム名だけを追加する用途にも同じ入口を使う。
    if (body.teamName) {
      const team = await createTeamByName({ name: body.teamName });
      const invite = await createTeamInviteForTeam({
        teamId: team.id,
        invitedBy: getCurrentIdentity()?.displayName ?? "HackRadar 運営"
      });
      return NextResponse.json({ team, invite });
    }

    if (!body.name) {
      return NextResponse.json(
        { error: "イベント名を入力してください。" },
        { status: 400 }
      );
    }

    const event = await saveEvent({ name: body.name });
    return NextResponse.json({ event });
  } catch (error) {
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "保存できませんでした。" },
      { status: 400 }
    );
  }
}

/**
 * イベントを削除する。
 *
 * 誤操作で全部消えるのを防ぐため、イベント名の一致を確認してから実行する。
 * 画面側でも確認しているが、APIを直接叩かれた場合にも同じ関門を通す。
 */
export async function DELETE(request: Request) {
  const denied = requireAdmin();
  if (denied) return denied;

  const body = (await request.json().catch(() => ({}))) as { confirmName?: string };
  const current = await getEvent();

  if (!current) {
    return NextResponse.json(
      { error: "削除するイベントがありません。" },
      { status: 404 }
    );
  }

  if (body.confirmName?.trim() !== current.name) {
    return NextResponse.json(
      { error: "確認のため、イベント名を正確に入力してください。" },
      { status: 400 }
    );
  }

  try {
    await deleteEvent();
    return NextResponse.json({ ok: true, deletedName: current.name });
  } catch (error) {
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "削除できませんでした。" },
      { status: 400 }
    );
  }
}
