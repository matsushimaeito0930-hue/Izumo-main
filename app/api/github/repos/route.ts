import { NextResponse } from "next/server";
import { fetchGitHubRepos } from "@/lib/github-auth";
import { getCurrentIdentity } from "@/lib/session";

export const dynamic = "force-dynamic";

/**
 * チーム登録でリポジトリを選ぶための一覧。
 * アクセストークンはcookieの中だけで使い、クライアントには返さない。
 */
export async function GET() {
  const identity = getCurrentIdentity();

  if (!identity) {
    return NextResponse.json(
      { error: "GitHubでログインしてください。" },
      { status: 401 }
    );
  }

  if (!identity.accessToken) {
    // JWTにトークンが入る前のセッション。ログインし直すと入る。
    return NextResponse.json(
      {
        error: "リポジトリ一覧を取得するには、一度ログインし直してください。",
        needsReauth: true
      },
      { status: 409 }
    );
  }

  try {
    const repos = await fetchGitHubRepos(identity.accessToken);
    return NextResponse.json({ repos });
  } catch (error) {
    return NextResponse.json(
      {
        error:
          error instanceof Error ? error.message : "リポジトリ一覧を取得できませんでした。"
      },
      { status: 502 }
    );
  }
}
