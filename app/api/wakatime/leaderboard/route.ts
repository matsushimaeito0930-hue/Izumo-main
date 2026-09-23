import { NextResponse } from "next/server";
import { getEvent } from "@/lib/store";
import { getCurrentIdentity } from "@/lib/session";
import { getWakaTimeEventLeaderboard } from "@/lib/wakatime-store";
import { isWakaTimeConfigured } from "@/lib/wakatime";

export const dynamic = "force-dynamic";

/** 現在のイベントに参加しているチームの、集計済み開発時間だけを返す。 */
export async function GET(request: Request) {
  if (!isWakaTimeConfigured()) {
    return NextResponse.json({ configured: false, teams: [] });
  }

  const identity = await getCurrentIdentity();
  if (!identity?.eventId) {
    return NextResponse.json({ error: "イベントを選択してください。" }, { status: 401 });
  }

  try {
    const event = await getEvent(identity.eventId);
    const leaderboard = await getWakaTimeEventLeaderboard({
      eventId: identity.eventId,
      eventStartedAt: event?.created_at ?? null,
      forceRefresh: new URL(request.url).searchParams.get("refresh") === "1"
    });
    return NextResponse.json(
      { configured: true, ...leaderboard },
      { headers: { "Cache-Control": "private, max-age=300" } }
    );
  } catch (error) {
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "WakaTime leaderboard is unavailable." },
      { status: 503 }
    );
  }
}
