import { afterEach, beforeEach, describe, expect, it } from "vitest";
import {
  buildWakaTimeAuthorizeUrl,
  createWakaTimeState,
  getWakaTimeCallbackUrl,
  isWakaTimeConfigured
} from "@/lib/wakatime";

const originalEnv = { ...process.env };

beforeEach(() => {
  process.env.WAKATIME_CLIENT_ID = "waka-client";
  process.env.WAKATIME_CLIENT_SECRET = "waka-secret";
  delete process.env.WAKATIME_OAUTH_CALLBACK_URL;
});

afterEach(() => {
  process.env = { ...originalEnv };
});

describe("WakaTime OAuth", () => {
  it("requests only summary-reading access", () => {
    const url = new URL(
      buildWakaTimeAuthorizeUrl({
        state: "known-state",
        callbackUrl: "https://example.test/api/auth/wakatime/callback"
      })
    );

    expect(url.origin).toBe("https://wakatime.com");
    expect(url.pathname).toBe("/oauth/authorize");
    expect(url.searchParams.get("client_id")).toBe("waka-client");
    expect(url.searchParams.get("response_type")).toBe("code");
    expect(url.searchParams.get("scope")).toBe("read_summaries");
    expect(url.searchParams.get("state")).toBe("known-state");
  });

  it("uses the request origin unless a callback URL is configured", () => {
    expect(getWakaTimeCallbackUrl(new Request("https://radar.example/dashboard"))).toBe(
      "https://radar.example/api/auth/wakatime/callback"
    );

    process.env.WAKATIME_OAUTH_CALLBACK_URL = "https://app.example/callback";
    expect(getWakaTimeCallbackUrl(new Request("https://radar.example/dashboard"))).toBe(
      "https://app.example/callback"
    );

    // 環境変数をフォームから貼り付けた際の末尾改行で、OAuthの完全一致判定に失敗しないようにする。
    process.env.WAKATIME_OAUTH_CALLBACK_URL = "https://app.example/callback\n";
    expect(getWakaTimeCallbackUrl(new Request("https://radar.example/dashboard"))).toBe(
      "https://app.example/callback"
    );
  });

  it("requires both OAuth credentials and creates unpredictable state", () => {
    expect(isWakaTimeConfigured()).toBe(true);
    const state = createWakaTimeState();
    expect(state).toMatch(/^[a-f0-9]{48}$/);
    expect(createWakaTimeState()).not.toBe(state);

    delete process.env.WAKATIME_CLIENT_SECRET;
    expect(isWakaTimeConfigured()).toBe(false);
  });
});
