import { NextResponse } from "next/server";
import { getEvent } from "@/lib/store";
import { getCurrentIdentity } from "@/lib/session";
import { getWakaTimeDashboardSummary } from "@/lib/wakatime-store";
import { isWakaTimeConfigured } from "@/lib/wakatime";

export const dynamic = "force-dynamic";

export async function GET(request: Request) {
  if (!isWakaTimeConfigured()) {
    return NextResponse.json({ configured: false });
  }

  const identity = await getCurrentIdentity();
  if (!identity) {
    return NextResponse.json({ error: "Login is required." }, { status: 401 });
  }
  if (!identity.eventId) {
    return NextResponse.json({ error: "イベントを選択してください。" }, { status: 400 });
  }

  try {
    const event = await getEvent(identity.eventId);
    const summary = await getWakaTimeDashboardSummary({
      githubLogin: identity.login,
      eventId: identity.eventId,
      eventStartedAt: event?.created_at ?? null,
      includeDaily: new URL(request.url).searchParams.get("details") === "1"
    });
    return NextResponse.json({ configured: true, ...summary }, {
      headers: { "Cache-Control": "no-store, max-age=0" }
    });
  } catch (error) {
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "WakaTime summary is unavailable." },
      { status: 503 }
    );
  }
}

export async function DELETE() {
  const identity = await getCurrentIdentity();
  if (!identity) {
    return NextResponse.json({ error: "Login is required." }, { status: 401 });
  }

  try {
    const { removeWakaTimeConnection } = await import("@/lib/wakatime-store");
    await removeWakaTimeConnection(identity.login);
    return NextResponse.json({ ok: true });
  } catch (error) {
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "Could not disconnect WakaTime." },
      { status: 503 }
    );
  }
}
