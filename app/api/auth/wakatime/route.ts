import { NextResponse } from "next/server";
import { getCurrentIdentity } from "@/lib/session";
import {
  WAKATIME_STATE_COOKIE,
  buildWakaTimeAuthorizeUrl,
  createWakaTimeState,
  getWakaTimeCallbackUrl,
  isWakaTimeConfigured
} from "@/lib/wakatime";

export const dynamic = "force-dynamic";

export async function GET(request: Request) {
  const requestUrl = new URL(request.url);
  const failure = new URL("/dashboard", requestUrl.origin);

  if (!isWakaTimeConfigured()) {
    failure.searchParams.set("wakatime_error", "not_configured");
    return NextResponse.redirect(failure);
  }

  if (!getCurrentIdentity()) {
    failure.searchParams.set("wakatime_error", "login_required");
    return NextResponse.redirect(failure);
  }

  const state = createWakaTimeState();
  const response = NextResponse.redirect(
    buildWakaTimeAuthorizeUrl({ state, callbackUrl: getWakaTimeCallbackUrl(request) })
  );

  response.cookies.set(WAKATIME_STATE_COOKIE, state, {
    httpOnly: true,
    sameSite: "lax",
    secure: process.env.NODE_ENV === "production",
    path: "/",
    maxAge: 600
  });

  return response;
}
