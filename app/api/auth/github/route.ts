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
  const origin = new URL(request.url).origin;

  if (!isGitHubAuthConfigured()) {
    const failed = new URL("/", origin);
    failed.searchParams.set("auth_error", "not_configured");
    return NextResponse.redirect(failed);
  }

  const state = createOAuthState();
  const callbackUrl = getCallbackUrl(request);
  const response = NextResponse.redirect(buildAuthorizeUrl({ state, callbackUrl }));

  response.cookies.set(STATE_COOKIE, state, {
    httpOnly: true,
    sameSite: "lax",
    secure: process.env.NODE_ENV === "production",
    path: "/",
    maxAge: 600
  });

  return response;
}
