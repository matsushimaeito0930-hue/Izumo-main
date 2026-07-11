import { NextResponse } from "next/server";
import { createHelpPost } from "@/lib/store";

export const dynamic = "force-dynamic";

export async function POST(request: Request) {
  const body = (await request.json().catch(() => ({}))) as {
    teamId?: string;
    title?: string;
    body?: string;
    category?: string;
  };

  if (!body.teamId || !body.title || !body.body || !body.category) {
    return NextResponse.json(
      { error: "teamId, title, body, and category are required." },
      { status: 400 }
    );
  }

  const post = await createHelpPost({
    teamId: body.teamId,
    title: body.title,
    body: body.body,
    category: body.category
  });

  return NextResponse.json({ post });
}
