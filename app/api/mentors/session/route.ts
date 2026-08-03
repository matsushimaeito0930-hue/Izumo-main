import { NextResponse } from "next/server";
import { isGitHubAuthConfigured } from "@/lib/github-auth";
import { getCurrentIdentity } from "@/lib/session";
import { createMentorSession } from "@/lib/store";

export const dynamic = "force-dynamic";

export async function POST(request: Request) {
  const identity = getCurrentIdentity();
  const authRequired = isGitHubAuthConfigured();

  if (authRequired) {
    if (!identity) {
      return NextResponse.json(
        { error: "GitHubでログインしてから登録してください。" },
        { status: 401 }
      );
    }

    if (identity.role !== "mentor" && identity.role !== "admin") {
      return NextResponse.json(
        {
          error:
            "メンター権限がありません。運営に MENTOR_GITHUB_LOGINS への追加を依頼してください。"
        },
        { status: 403 }
      );
    }
  }

  const body = (await request.json().catch(() => ({}))) as {
    specialty?: string;
    displayName?: string;
    githubUsername?: string;
  };

  const displayName = identity?.displayName ?? body.displayName?.trim();

  if (!body.specialty || !displayName) {
    return NextResponse.json(
      { error: "表示名と得意分野を入力してください。" },
      { status: 400 }
    );
  }

  try {
    const session = await createMentorSession({
      displayName,
      githubUsername: identity?.login ?? body.githubUsername?.trim(),
      specialty: body.specialty
    });

    return NextResponse.json({ session });
  } catch (error) {
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "メンター登録に失敗しました。" },
      { status: 500 }
    );
  }
}
