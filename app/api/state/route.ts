import { NextResponse } from "next/server";
import { isGitHubAuthConfigured } from "@/lib/github-auth";
import { getCurrentIdentity } from "@/lib/session";
import { getHackVerseState } from "@/lib/store";

export const dynamic = "force-dynamic";

export async function GET() {
  const identity = await getCurrentIdentity();
  if (isGitHubAuthConfigured() && (!identity || !identity.eventId)) {
    return NextResponse.json(
      { error: identity ? "イベントを選択してください。" : "GitHubでログインしてください。" },
      { status: identity ? 400 : 401 }
    );
  }

  try {
    const state = await getHackVerseState(
      identity?.eventId,
      identity
        ? { githubUsername: identity.login, role: identity.role }
        : undefined
    );
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
