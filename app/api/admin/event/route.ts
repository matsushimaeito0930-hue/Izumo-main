import { NextResponse } from "next/server";
import { isGitHubAuthConfigured } from "@/lib/github-auth";
import { getCurrentIdentity } from "@/lib/session";
import { createTeamByName, getEvent, saveEvent } from "@/lib/store";

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

  if (process.env.ADMIN_GITHUB_LOGINS && identity.role !== "admin") {
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

/** イベント名を登録・変更する。参加コードは初回に発行され、以降は変わらない。 */
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
      return NextResponse.json({ team });
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
