import { NextResponse } from "next/server";
import { isGitHubAuthConfigured } from "@/lib/github-auth";
import { getCurrentIdentity } from "@/lib/session";
import { getScoreConfig, saveScoreConfig } from "@/lib/store";

export const dynamic = "force-dynamic";

function requireAdmin() {
  const identity = getCurrentIdentity();

  if (!isGitHubAuthConfigured()) return null; // ローカルデモは素通し

  if (!identity) {
    return NextResponse.json({ error: "GitHubでログインしてください。" }, { status: 401 });
  }

  if (identity.role !== "admin") {
    return NextResponse.json({ error: "この操作は運営のみです。" }, { status: 403 });
  }

  return null;
}

/** いまの配点を返す。 */
export async function GET() {
  const denied = requireAdmin();
  if (denied) return denied;

  return NextResponse.json({ config: await getScoreConfig() });
}

/**
 * 配点を保存する。
 *
 * 保存と同時に、記録済みの活動もすべて新しい配点で計算し直す。
 * そうしないと、変更前の活動と変更後の活動が混ざって順位の意味が壊れる。
 */
export async function POST(request: Request) {
  const denied = requireAdmin();
  if (denied) return denied;

  const body = (await request.json().catch(() => ({}))) as { config?: unknown };

  try {
    const result = await saveScoreConfig(body.config);
    return NextResponse.json(result);
  } catch (error) {
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "保存できませんでした。" },
      { status: 400 }
    );
  }
}
