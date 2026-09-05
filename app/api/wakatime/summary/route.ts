import { NextResponse } from "next/server";
import { getEvent } from "@/lib/store";
import { getCurrentIdentity } from "@/lib/session";
import { getWakaTimeDashboardSummary } from "@/lib/wakatime-store";
import { isWakaTimeConfigured } from "@/lib/wakatime";

export const dynamic = "force-dynamic";

export async function GET() {
  if (!isWakaTimeConfigured()) {
    return NextResponse.json({ configured: false });
  }

  const identity = getCurrentIdentity();
  if (!identity) {
    return NextResponse.json({ error: "Login is required." }, { status: 401 });
  }

  try {
    const event = await getEvent();
    const summary = await getWakaTimeDashboardSummary({
      githubLogin: identity.login,
      eventStartedAt: event?.created_at ?? null
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
  const identity = getCurrentIdentity();
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
