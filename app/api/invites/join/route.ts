import { NextResponse } from "next/server";
import { joinTeamWithInvite } from "@/lib/store";

export const dynamic = "force-dynamic";

export async function POST(request: Request) {
  const body = (await request.json().catch(() => ({}))) as {
    code?: string;
    displayName?: string;
    githubUsername?: string;
  };

  if (!body.code || !body.displayName) {
    return NextResponse.json(
      { error: "code and displayName are required." },
      { status: 400 }
    );
  }

  try {
    const session = await joinTeamWithInvite({
      code: body.code,
      displayName: body.displayName,
      githubUsername: body.githubUsername
    });

    return NextResponse.json({ session });
  } catch (error) {
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "Join failed." },
      { status: 400 }
    );
  }
}
