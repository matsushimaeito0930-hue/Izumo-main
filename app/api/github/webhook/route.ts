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

  // Webhook登録直後にGitHubが送ってくる疎通確認。成功が分かるように明示的に返す。
  if (eventName === "ping") {
    return NextResponse.json({ ok: true, pong: true });
  }

  let payload: unknown;
  try {
    payload = JSON.parse(body);
  } catch {
    return NextResponse.json({ error: "Payload could not be parsed." }, { status: 400 });
  }

  const parsedActivity = parseGitHubWebhook(eventName, payload);

  if (!parsedActivity) {
    // 対象外のイベントは200で返す。エラーにするとGitHub側で配信失敗が並ぶため。
    return NextResponse.json({ ok: true, ignored: true, eventName });
  }

  try {
    const activity = await recordActivity(parsedActivity);
    return NextResponse.json({ ok: true, eventName, activity });
  } catch (error) {
    return NextResponse.json(
      {
        error: error instanceof Error ? error.message : "Activity could not be recorded."
      },
      { status: 500 }
    );
  }
}
