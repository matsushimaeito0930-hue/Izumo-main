import { cookies } from "next/headers";
import { NextResponse } from "next/server";
import { getCurrentIdentity } from "@/lib/session";
import { saveWakaTimeConnection } from "@/lib/wakatime-store";
import {
  WAKATIME_STATE_COOKIE,
  exchangeWakaTimeCode,
  getWakaTimeCallbackUrl,
  isWakaTimeConfigured
} from "@/lib/wakatime";

export const dynamic = "force-dynamic";

function redirect(request: Request, key: "wakatime" | "wakatime_error", value: string) {
  const destination = new URL("/dashboard", request.url);
  destination.searchParams.set(key, value);
  return NextResponse.redirect(destination);
}

export async function GET(request: Request) {
  if (!isWakaTimeConfigured()) {
    return redirect(request, "wakatime_error", "not_configured");
  }

  const identity = await getCurrentIdentity();
  if (!identity) {
    return redirect(request, "wakatime_error", "login_required");
  }

  const requestUrl = new URL(request.url);
  const code = requestUrl.searchParams.get("code");
  const state = requestUrl.searchParams.get("state");
  const expectedState = (await cookies()).get(WAKATIME_STATE_COOKIE)?.value;

  if (requestUrl.searchParams.get("error")) {
    return redirect(request, "wakatime_error", "denied");
  }

  if (!code || !state || !expectedState || state !== expectedState) {
    return redirect(request, "wakatime_error", "state_mismatch");
  }

  try {
    const tokens = await exchangeWakaTimeCode({
      code,
      callbackUrl: getWakaTimeCallbackUrl(request)
    });
    await saveWakaTimeConnection(identity.login, tokens);

    const response = redirect(request, "wakatime", "connected");
    response.cookies.delete(WAKATIME_STATE_COOKIE);
    return response;
  } catch {
    return redirect(request, "wakatime_error", "exchange_failed");
  }
}
