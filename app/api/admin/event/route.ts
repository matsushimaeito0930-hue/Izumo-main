import { NextResponse } from "next/server";
import { isGitHubAuthConfigured } from "@/lib/github-auth";
import { getCurrentIdentity } from "@/lib/session";
import {
  createTeamByName,
  createTeamInviteForTeam,
  deleteEvent,
  getEvent,
  isEventOwner,
  saveEvent
} from "@/lib/store";

export const dynamic = "force-dynamic";

async function requireEventOwner() {
  const identity = await getCurrentIdentity();

  if (!isGitHubAuthConfigured()) return null; // ローカルデモは素通し

  if (!identity) {
    return NextResponse.json(
      { error: "GitHubでログインしてください。" },
      { status: 401 }
    );
  }

  if (
    identity.role !== "admin" ||
    !(await isEventOwner({ eventId: identity.eventId, githubUsername: identity.login }))
  ) {
    return NextResponse.json(
      { error: "この操作は運営のみです。" },
      { status: 403 }
    );
  }

  const event = await getEvent(identity.eventId);
  if (!event) {
    return NextResponse.json({ error: "開くイベントを選択してください。" }, { status: 400 });
  }

  return { identity, event };
}

/** 現在のイベントと参加コードを返す。 */
export async function GET() {
  const access = await requireEventOwner();
  if (!access || access instanceof NextResponse) {
    return access ?? NextResponse.json({ error: "ログインが必要です。" }, { status: 401 });
  }

  return NextResponse.json({ event: access.event });
}

/** イベント名を登録・変更する。イベント名を変えると全体コードも更新する。 */
export async function POST(request: Request) {
  const access = await requireEventOwner();
  if (!access || access instanceof NextResponse) {
    return access ?? NextResponse.json({ error: "ログインが必要です。" }, { status: 401 });
  }

  const body = (await request.json().catch(() => ({}))) as {
    name?: string;
    teamName?: string;
  };

  try {
    // チーム名だけを追加する用途にも同じ入口を使う。
    if (body.teamName) {
      const team = await createTeamByName({ name: body.teamName, eventId: access.event.id });
      const invite = await createTeamInviteForTeam({
        teamId: team.id,
        invitedBy: access.identity.displayName ?? "HackRadar 運営"
      });
      return NextResponse.json({ team, invite });
    }

    if (!body.name) {
      return NextResponse.json(
        { error: "イベント名を入力してください。" },
        { status: 400 }
      );
    }

    const event = await saveEvent({ name: body.name, eventId: access.event.id });
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
 * 誤操作で全部消えるのを防ぐため、招待コードの一致を確認してから実行する。
 * 画面側でも確認しているが、APIを直接叩かれた場合にも同じ関門を通す。
 */
export async function DELETE(request: Request) {
  const access = await requireEventOwner();
  if (!access || access instanceof NextResponse) {
    return access ?? NextResponse.json({ error: "ログインが必要です。" }, { status: 401 });
  }

  const body = (await request.json().catch(() => ({}))) as { confirmCode?: string };
  const current = access.event;

  if (!current) {
    return NextResponse.json(
      { error: "削除するイベントがありません。" },
      { status: 404 }
    );
  }

  // 大文字小文字は問わない。コードは読み上げて共有されることがあるため。
  const given = (body.confirmCode ?? "").trim().toUpperCase();
  if (given !== current.join_code.toUpperCase()) {
    return NextResponse.json(
      { error: "確認のため、このイベントの招待コードを正確に入力してください。" },
      { status: 400 }
    );
  }

  try {
    await deleteEvent(access.event.id);
    return NextResponse.json({ ok: true, deletedName: current.name });
  } catch (error) {
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "削除できませんでした。" },
      { status: 400 }
    );
  }
}
