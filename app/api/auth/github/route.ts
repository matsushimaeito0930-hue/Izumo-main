import { NextResponse } from "next/server";
import {
  STATE_COOKIE,
  buildAuthorizeUrl,
  createOAuthState,
  getCallbackUrl,
  isGitHubAuthConfigured
} from "@/lib/github-auth";

export const dynamic = "force-dynamic";

export async function GET(request: Request) {
  const requestUrl = new URL(request.url);
  const origin = requestUrl.origin;

  if (!isGitHubAuthConfigured()) {
    const failed = new URL("/", origin);
    failed.searchParams.set("auth_error", "not_configured");
    return NextResponse.redirect(failed);
  }

  const state = createOAuthState();
  const callbackUrl = getCallbackUrl(request);
  // ?private=1 のときだけ repo スコープを足して、プライベートも一覧に出せるようにする。
  const includePrivate = requestUrl.searchParams.get("private") === "1";
  const response = NextResponse.redirect(
    buildAuthorizeUrl({ state, callbackUrl, includePrivate })
  );

  response.cookies.set(STATE_COOKIE, state, {
    httpOnly: true,
    sameSite: "lax",
    secure: process.env.NODE_ENV === "production",
    path: "/",
    maxAge: 600
  });

  return response;
}
