import { NextResponse } from "next/server";
import { isGitHubAuthConfigured } from "@/lib/github-auth";
import { getCurrentIdentity } from "@/lib/session";
import { updateTeam } from "@/lib/store";

export const dynamic = "force-dynamic";

function requireAdmin() {
  const identity = getCurrentIdentity();

  if (!isGitHubAuthConfigured()) return null;
  if (!identity) {
    return NextResponse.json({ error: "GitHubでログインしてください。" }, { status: 401 });
  }
  if (process.env.ADMIN_GITHUB_LOGINS && identity.role !== "admin") {
    return NextResponse.json({ error: "この操作は運営のみです。" }, { status: 403 });
  }
  return null;
}

export async function PATCH(
  request: Request,
  { params }: { params: { id: string } }
) {
  const denied = requireAdmin();
  if (denied) return denied;

  const body = (await request.json().catch(() => ({}))) as {
    name?: string;
    githubRepo?: string | null;
  };

  try {
    const team = await updateTeam({
      teamId: params.id,
      name: body.name ?? "",
      githubRepo: body.githubRepo
    });
    return NextResponse.json({ team });
  } catch (error) {
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "チームを更新できませんでした。" },
      { status: 400 }
    );
  }
}
