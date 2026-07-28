import { NextResponse } from "next/server";
import { createMentorSession } from "@/lib/store";

export const dynamic = "force-dynamic";

export async function POST(request: Request) {
  const body = (await request.json().catch(() => ({}))) as {
    displayName?: string;
    githubUsername?: string;
    specialty?: string;
  };

  if (!body.displayName || !body.specialty) {
    return NextResponse.json(
      { error: "displayName and specialty are required." },
      { status: 400 }
    );
  }

  try {
    const session = await createMentorSession({
      displayName: body.displayName,
      githubUsername: body.githubUsername,
      specialty: body.specialty
    });

    return NextResponse.json({ session });
  } catch (error) {
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "Mentor join failed." },
      { status: 500 }
    );
  }
}
