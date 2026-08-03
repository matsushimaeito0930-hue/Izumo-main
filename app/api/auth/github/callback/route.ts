import { cookies } from "next/headers";
import { NextResponse } from "next/server";
import {
  SESSION_COOKIE,
  SESSION_MAX_AGE,
  STATE_COOKIE,
  exchangeCodeForToken,
  fetchGitHubUser,
  getCallbackUrl,
  isGitHubAuthConfigured,
  serializeIdentity
} from "@/lib/github-auth";

export const dynamic = "force-dynamic";

function redirectWithError(origin: string, reason: string) {
  const url = new URL("/", origin);
  url.searchParams.set("auth_error", reason);
  return NextResponse.redirect(url);
}

export async function GET(request: Request) {
  const requestUrl = new URL(request.url);
  const origin = requestUrl.origin;

  if (!isGitHubAuthConfigured()) {
    return redirectWithError(origin, "not_configured");
  }

  if (requestUrl.searchParams.get("error")) {
    return redirectWithError(origin, "denied");
  }

  const code = requestUrl.searchParams.get("code");
  const state = requestUrl.searchParams.get("state");
  const expectedState = cookies().get(STATE_COOKIE)?.value;

  if (!code || !state || !expectedState || state !== expectedState) {
    return redirectWithError(origin, "state_mismatch");
  }

  try {
    const accessToken = await exchangeCodeForToken({
      code,
      callbackUrl: getCallbackUrl(request)
    });
    const identity = await fetchGitHubUser(accessToken);

    const destination = new URL("/", origin);
    destination.searchParams.set("logged_in", "1");
    const response = NextResponse.redirect(destination);

    response.cookies.set(SESSION_COOKIE, serializeIdentity(identity), {
      httpOnly: true,
      sameSite: "lax",
      secure: process.env.NODE_ENV === "production",
      path: "/",
      maxAge: SESSION_MAX_AGE
    });
    response.cookies.delete(STATE_COOKIE);

    return response;
  } catch {
    return redirectWithError(origin, "exchange_failed");
  }
}
