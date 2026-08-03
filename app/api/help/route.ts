import { NextResponse } from "next/server";
import { getCurrentIdentity } from "@/lib/session";
import { createHelpPost } from "@/lib/store";

export const dynamic = "force-dynamic";

export async function POST(request: Request) {
  const identity = getCurrentIdentity();

  const body = (await request.json().catch(() => ({}))) as {
    teamId?: string;
    title?: string;
    body?: string;
    category?: string;
  };

  if (!body.teamId || !body.title || !body.body || !body.category) {
    return NextResponse.json(
      { error: "チーム・タイトル・詳細・カテゴリを入力してください。" },
      { status: 400 }
    );
  }

  const post = await createHelpPost({
    teamId: body.teamId,
    title: body.title,
    body: body.body,
    category: body.category,
    authorName: identity?.displayName,
    authorGithub: identity?.login
  });

  return NextResponse.json({ post });
}
