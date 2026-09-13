import { NextResponse } from "next/server";
import { isGitHubAuthConfigured } from "@/lib/github-auth";
import { getCurrentIdentity } from "@/lib/session";
import { getHackVerseState } from "@/lib/store";

export const dynamic = "force-dynamic";

/**
 * ナビの未読バッジ用。
 *
 * 本文まではバッジに要らないので、idと時刻だけを返す。
 * 未読の判定はブラウザ側（最後に開いた時刻との比較）で行う。
 */
export async function GET() {
  const identity = await getCurrentIdentity();
  if (isGitHubAuthConfigured() && (!identity || !identity.eventId)) {
    return NextResponse.json({ items: [] }, { status: identity ? 400 : 401 });
  }

  try {
    const state = await getHackVerseState(identity?.eventId);

    // team_id が null のものが「全チームへのお知らせ」。
    const items = state.messages
      .filter((message) => message.channel === "staff" && message.team_id === null)
      .map((message) => ({ id: message.id, created_at: message.created_at }));

    return NextResponse.json(
      { items },
      { headers: { "Cache-Control": "no-store, max-age=0" } }
    );
  } catch {
    // バッジはおまけの機能。取れなくても画面は普通に使える。
    return NextResponse.json({ items: [] }, { status: 200 });
  }
}
