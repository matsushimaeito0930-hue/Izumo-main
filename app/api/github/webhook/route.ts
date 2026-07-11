import { NextResponse } from "next/server";
import { parseGitHubWebhook, verifyGitHubSignature } from "@/lib/github";
import { recordActivity } from "@/lib/store";

export const dynamic = "force-dynamic";

export async function POST(request: Request) {
  const secret = process.env.GITHUB_WEBHOOK_SECRET;
  if (!secret) {
    return NextResponse.json(
      { error: "GITHUB_WEBHOOK_SECRET is not configured." },
      { status: 500 }
    );
  }

  const body = await request.text();
  const signature = request.headers.get("x-hub-signature-256");
  const isValid = verifyGitHubSignature({ body, signature, secret });

  if (!isValid) {
    return NextResponse.json({ error: "Invalid signature." }, { status: 401 });
  }

  const eventName = request.headers.get("x-github-event") ?? "";
  const payload = JSON.parse(body) as unknown;
  const parsedActivity = parseGitHubWebhook(eventName, payload);

  if (!parsedActivity) {
    return NextResponse.json({
      ok: true,
      ignored: true,
      eventName
    });
  }

  const activity = await recordActivity(parsedActivity);

  return NextResponse.json({
    ok: true,
    eventName,
    activity
  });
}
