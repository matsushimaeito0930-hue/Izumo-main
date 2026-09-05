import { randomBytes } from "node:crypto";

const WAKATIME_AUTHORIZE_URL = "https://wakatime.com/oauth/authorize";
const WAKATIME_TOKEN_URL = "https://wakatime.com/oauth/token";
const WAKATIME_API_URL = "https://wakatime.com/api/v1/users/current/summaries";

export const WAKATIME_STATE_COOKIE = "hackradar-wakatime-state";

export type WakaTimeTokens = {
  accessToken: string;
  refreshToken: string | null;
  expiresAt: string | null;
};

export function isWakaTimeConfigured(): boolean {
  return Boolean(process.env.WAKATIME_CLIENT_ID && process.env.WAKATIME_CLIENT_SECRET);
}

export function createWakaTimeState(): string {
  return randomBytes(24).toString("hex");
}

export function getWakaTimeCallbackUrl(request: Request): string {
  if (process.env.WAKATIME_OAUTH_CALLBACK_URL) {
    return process.env.WAKATIME_OAUTH_CALLBACK_URL;
  }

  return new URL("/api/auth/wakatime/callback", new URL(request.url).origin).toString();
}

export function buildWakaTimeAuthorizeUrl({
  state,
  callbackUrl
}: {
  state: string;
  callbackUrl: string;
}): string {
  const url = new URL(WAKATIME_AUTHORIZE_URL);
  url.searchParams.set("client_id", process.env.WAKATIME_CLIENT_ID ?? "");
  url.searchParams.set("response_type", "code");
  url.searchParams.set("redirect_uri", callbackUrl);
  url.searchParams.set("scope", "read_summaries");
  url.searchParams.set("state", state);
  return url.toString();
}

function tokensFromPayload(payload: {
  access_token?: string;
  refresh_token?: string;
  expires_in?: number;
}): WakaTimeTokens {
  if (!payload.access_token) {
    throw new Error("WakaTime did not return an access token.");
  }

  return {
    accessToken: payload.access_token,
    refreshToken: payload.refresh_token ?? null,
    expiresAt:
      typeof payload.expires_in === "number"
        ? new Date(Date.now() + payload.expires_in * 1000).toISOString()
        : null
  };
}

async function requestToken(parameters: URLSearchParams): Promise<WakaTimeTokens> {
  const response = await fetch(WAKATIME_TOKEN_URL, {
    method: "POST",
    headers: {
      accept: "application/json",
      "content-type": "application/x-www-form-urlencoded"
    },
    body: parameters.toString(),
    cache: "no-store"
  });

  const payload = (await response.json().catch(() => ({}))) as {
    access_token?: string;
    refresh_token?: string;
    expires_in?: number;
    error?: string;
    error_description?: string;
  };

  if (!response.ok) {
    throw new Error(payload.error_description ?? payload.error ?? "WakaTime authorization failed.");
  }

  return tokensFromPayload(payload);
}

export async function exchangeWakaTimeCode({
  code,
  callbackUrl
}: {
  code: string;
  callbackUrl: string;
}): Promise<WakaTimeTokens> {
  const parameters = new URLSearchParams({
    client_id: process.env.WAKATIME_CLIENT_ID ?? "",
    client_secret: process.env.WAKATIME_CLIENT_SECRET ?? "",
    code,
    redirect_uri: callbackUrl,
    grant_type: "authorization_code"
  });

  return requestToken(parameters);
}

export async function refreshWakaTimeToken(refreshToken: string): Promise<WakaTimeTokens> {
  const parameters = new URLSearchParams({
    client_id: process.env.WAKATIME_CLIENT_ID ?? "",
    client_secret: process.env.WAKATIME_CLIENT_SECRET ?? "",
    refresh_token: refreshToken,
    grant_type: "refresh_token"
  });

  return requestToken(parameters);
}

export async function fetchWakaTimeSeconds({
  accessToken,
  start,
  end
}: {
  accessToken: string;
  start: string;
  end: string;
}): Promise<number> {
  const url = new URL(WAKATIME_API_URL);
  url.searchParams.set("start", start);
  url.searchParams.set("end", end);

  const response = await fetch(url, {
    headers: {
      accept: "application/json",
      authorization: `Bearer ${accessToken}`
    },
    cache: "no-store"
  });

  if (response.status === 401) {
    const error = new Error("WakaTime authorization has expired.");
    error.name = "WakaTimeUnauthorizedError";
    throw error;
  }

  const payload = (await response.json().catch(() => ({}))) as {
    data?: Array<{ grand_total?: { total_seconds?: number } }>;
    error?: string;
  };

  if (!response.ok) {
    throw new Error(payload.error ?? "Could not retrieve WakaTime summaries.");
  }

  return (payload.data ?? []).reduce(
    (total, day) => total + (day.grand_total?.total_seconds ?? 0),
    0
  );
}
