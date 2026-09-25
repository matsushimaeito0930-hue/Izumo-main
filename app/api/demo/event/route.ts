import { NextResponse } from "next/server";
import { isDemoModeEnabled } from "@/lib/env";
import { isGitHubAuthConfigured } from "@/lib/github-auth";
import { getCurrentIdentity } from "@/lib/session";
import { recordActivity } from "@/lib/store";
import type { ActivityType } from "@/lib/types";

export const dynamic = "force-dynamic";

const allowedTypes: ActivityType[] = [
  "push",
  "pull_request_opened",
  "pull_request_merged",
  "issue_closed"
];

function demoMetadata(type: ActivityType): Record<string, unknown> {
  if (type === "push") {
    return { commitCount: 1, source: "demo" };
  }

  if (type === "pull_request_opened") {
    return { number: Math.floor(Math.random() * 20) + 1, source: "demo" };
  }

  if (type === "pull_request_merged") {
    return { number: Math.floor(Math.random() * 20) + 1, source: "demo" };
  }

  return { number: Math.floor(Math.random() * 12) + 1, source: "demo" };
}

export async function POST(request: Request) {
  if (!isDemoModeEnabled()) {
    return NextResponse.json(
      { error: "Demo Mode is disabled." },
      { status: 403 }
    );
  }

  const identity = await getCurrentIdentity();
  if (isGitHubAuthConfigured() && identity?.role !== "admin") {
    return NextResponse.json(
      { error: "デモイベントを実行できるのは運営だけです。" },
      { status: 403 }
    );
  }

  const body = (await request.json().catch(() => ({}))) as {
    teamId?: string;
    type?: ActivityType;
  };

  if (!body.type || !allowedTypes.includes(body.type)) {
    return NextResponse.json(
      { error: "Unsupported demo event type." },
      { status: 400 }
    );
  }

  const activity = await recordActivity({
    type: body.type,
    teamId: body.teamId,
    metadata: demoMetadata(body.type)
  });

  if (!activity) {
    return NextResponse.json(
      { error: "チームが登録されていないため、デモイベントを作れませんでした。" },
      { status: 400 }
    );
  }

  return NextResponse.json({ activity });
}
