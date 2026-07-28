import { NextResponse } from "next/server";
import { createTeamInvite, getTeamInvites } from "@/lib/store";

export const dynamic = "force-dynamic";

export async function GET() {
  const invites = await getTeamInvites();
  return NextResponse.json({ invites });
}

export async function POST(request: Request) {
  const body = (await request.json().catch(() => ({}))) as {
    teamName?: string;
    githubRepo?: string;
    invitedBy?: string;
  };

  if (!body.teamName || !body.githubRepo) {
    return NextResponse.json(
      { error: "teamName and githubRepo are required." },
      { status: 400 }
    );
  }

  try {
    const invite = await createTeamInvite({
      teamName: body.teamName,
      githubRepo: body.githubRepo,
      invitedBy: body.invitedBy ?? "HackVerse Admin"
    });

    return NextResponse.json({ invite });
  } catch (error) {
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "Invite creation failed." },
      { status: 500 }
    );
  }
}
