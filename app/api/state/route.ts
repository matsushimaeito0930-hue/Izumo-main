import { NextResponse } from "next/server";
import { getCurrentIdentity } from "@/lib/session";
import { getSupabaseHackVerseState } from "@/lib/store";

export const dynamic = "force-dynamic";

export async function GET() {
  try {
    const state = await getSupabaseHackVerseState(getCurrentIdentity()?.eventId);
    return NextResponse.json(state, {
      headers: {
        "Cache-Control": "no-store, max-age=0"
      }
    });
  } catch (error) {
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "State is unavailable" },
      { status: 503 }
    );
  }
}
