import { createHmac, randomBytes, timingSafeEqual } from "node:crypto";
import type { UserRole } from "@/lib/types";

/**
 * GitHub OAuth（自前実装）。
 * セッションはHMAC署名付きのhttpOnly cookieに入れる。DBを必須にしないので、
 * Supabase未設定でもログインしてデモできる状態を保てる。
 */

export const SESSION_COOKIE = "hackverse-auth";
export const STATE_COOKIE = "hackverse-oauth-state";
export const SESSION_MAX_AGE = 60 * 60 * 12; // 12時間

export type GitHubIdentity = {
  githubId: number;
  login: string;
  displayName: string;
  avatarUrl: string | null;
  role: UserRole;
  issuedAt: number;
};

export function isGitHubAuthConfigured(): boolean {
  return Boolean(process.env.GITHUB_CLIENT_ID && process.env.GITHUB_CLIENT_SECRET);
}

function getAuthSecret(): string {
  const secret = process.env.AUTH_SECRET || process.env.GITHUB_CLIENT_SECRET;
  if (!secret) {
    throw new Error("AUTH_SECRET is not configured.");
  }
  return secret;
}

function parseLogins(value: string | undefined): string[] {
  if (!value) return [];
  return value
    .split(",")
    .map((entry) => entry.trim().toLowerCase())
    .filter(Boolean);
}

/** 環境変数のallowlistでロールを決める。該当しなければ参加者。 */
export function resolveRole(login: string): UserRole {
  const normalized = login.toLowerCase();

  if (parseLogins(process.env.ADMIN_GITHUB_LOGINS).includes(normalized)) {
    return "admin";
  }

  if (parseLogins(process.env.MENTOR_GITHUB_LOGINS).includes(normalized)) {
    return "mentor";
  }

  return "participant";
}

function base64url(input: Buffer | string): string {
  return Buffer.from(input)
    .toString("base64")
    .replace(/\+/g, "-")
    .replace(/\//g, "_")
    .replace(/=+$/, "");
}

function fromBase64url(input: string): Buffer {
  return Buffer.from(input.replace(/-/g, "+").replace(/_/g, "/"), "base64");
}

function sign(payload: string): string {
  return base64url(createHmac("sha256", getAuthSecret()).update(payload).digest());
}

export function serializeIdentity(identity: GitHubIdentity): string {
  const payload = base64url(JSON.stringify(identity));
  return `${payload}.${sign(payload)}`;
}

export function parseIdentity(token: string | undefined): GitHubIdentity | null {
  if (!token) return null;

  const [payload, signature] = token.split(".");
  if (!payload || !signature) return null;

  let expected: string;
  try {
    expected = sign(payload);
  } catch {
    return null;
  }

  const given = Buffer.from(signature);
  const want = Buffer.from(expected);
  if (given.length !== want.length || !timingSafeEqual(given, want)) {
    return null;
  }

  try {
    const identity = JSON.parse(fromBase64url(payload).toString("utf8")) as GitHubIdentity;
    if (Date.now() / 1000 - identity.issuedAt > SESSION_MAX_AGE) {
      return null;
    }
    return identity;
  } catch {
    return null;
  }
}

export function createOAuthState(): string {
  return randomBytes(16).toString("hex");
}

export function getCallbackUrl(request: Request): string {
  if (process.env.GITHUB_OAUTH_CALLBACK_URL) {
    return process.env.GITHUB_OAUTH_CALLBACK_URL;
  }
  return new URL("/api/auth/github/callback", new URL(request.url).origin).toString();
}

export function buildAuthorizeUrl({
  state,
  callbackUrl
}: {
  state: string;
  callbackUrl: string;
}): string {
  const url = new URL("https://github.com/login/oauth/authorize");
  url.searchParams.set("client_id", process.env.GITHUB_CLIENT_ID ?? "");
  url.searchParams.set("redirect_uri", callbackUrl);
  url.searchParams.set("scope", "read:user");
  url.searchParams.set("state", state);
  return url.toString();
}

export async function exchangeCodeForToken({
  code,
  callbackUrl
}: {
  code: string;
  callbackUrl: string;
}): Promise<string> {
  const response = await fetch("https://github.com/login/oauth/access_token", {
    method: "POST",
    headers: {
      accept: "application/json",
      "content-type": "application/json"
    },
    body: JSON.stringify({
      client_id: process.env.GITHUB_CLIENT_ID,
      client_secret: process.env.GITHUB_CLIENT_SECRET,
      code,
      redirect_uri: callbackUrl
    })
  });

  const payload = (await response.json().catch(() => ({}))) as {
    access_token?: string;
    error_description?: string;
    error?: string;
  };

  if (!response.ok || !payload.access_token) {
    throw new Error(
      payload.error_description ?? payload.error ?? "GitHubのトークン取得に失敗しました。"
    );
  }

  return payload.access_token;
}

export async function fetchGitHubUser(accessToken: string): Promise<GitHubIdentity> {
  const response = await fetch("https://api.github.com/user", {
    headers: {
      accept: "application/vnd.github+json",
      authorization: `Bearer ${accessToken}`,
      "user-agent": "HackVerse"
    }
  });

  if (!response.ok) {
    throw new Error("GitHubのユーザー情報を取得できませんでした。");
  }

  const user = (await response.json()) as {
    id: number;
    login: string;
    name: string | null;
    avatar_url: string | null;
  };

  return {
    githubId: user.id,
    login: user.login,
    displayName: user.name?.trim() || user.login,
    avatarUrl: user.avatar_url,
    role: resolveRole(user.login),
    issuedAt: Math.floor(Date.now() / 1000)
  };
}
