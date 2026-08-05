import { createHmac, randomBytes, timingSafeEqual } from "node:crypto";
import type { UserRole } from "@/lib/types";

/**
 * GitHub OAuth（自前実装）。
 * セッションは HS256 で署名したJWTを httpOnly cookie に入れる。DBを必須にしないので、
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
  /**
   * リポジトリ一覧の取得に使うGitHubのアクセストークン。
   * httpOnly cookieの中にしか置かず、クライアントへは一切返さない。
   */
  accessToken?: string;
  /** GitHubから実際に付与されたスコープ。プライベート表示の可否判定に使う。 */
  scopes?: string;
};

export type GitHubRepo = {
  fullName: string;
  private: boolean;
  updatedAt: string;
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

const JWT_HEADER = { alg: "HS256", typ: "JWT" } as const;

/** JWTのペイロード。sub / iat / exp は標準クレーム。 */
type SessionClaims = {
  sub: string;
  iat: number;
  exp: number;
  login: string;
  name: string;
  avatar: string | null;
  role: UserRole;
  gh?: string;
  scp?: string;
};

function sign(signingInput: string): string {
  return base64url(createHmac("sha256", getAuthSecret()).update(signingInput).digest());
}

/**
 * セッションcookieの中身を HS256 のJWTとして発行する。
 * 外部ライブラリは使わず node:crypto だけで組み立てている。
 */
export function serializeIdentity(identity: GitHubIdentity): string {
  const claims: SessionClaims = {
    sub: String(identity.githubId),
    iat: identity.issuedAt,
    exp: identity.issuedAt + SESSION_MAX_AGE,
    login: identity.login,
    name: identity.displayName,
    avatar: identity.avatarUrl,
    role: identity.role,
    gh: identity.accessToken,
    scp: identity.scopes
  };

  const header = base64url(JSON.stringify(JWT_HEADER));
  const payload = base64url(JSON.stringify(claims));
  const signingInput = `${header}.${payload}`;

  return `${signingInput}.${sign(signingInput)}`;
}

/**
 * JWTを検証して本人情報に戻す。壊れていれば null。
 * alg を検証しているので "alg: none" への差し替えは通らない。
 */
export function parseIdentity(token: string | undefined): GitHubIdentity | null {
  if (!token) return null;

  const parts = token.split(".");
  if (parts.length !== 3) return null;

  const [header, payload, signature] = parts;
  if (!header || !payload || !signature) return null;

  // 署名アルゴリズムの差し替えを拒否する。
  try {
    const decodedHeader = JSON.parse(fromBase64url(header).toString("utf8")) as {
      alg?: string;
      typ?: string;
    };
    if (decodedHeader.alg !== JWT_HEADER.alg) return null;
  } catch {
    return null;
  }

  let expected: string;
  try {
    expected = sign(`${header}.${payload}`);
  } catch {
    return null;
  }

  const given = Buffer.from(signature);
  const want = Buffer.from(expected);
  if (given.length !== want.length || !timingSafeEqual(given, want)) {
    return null;
  }

  try {
    const claims = JSON.parse(fromBase64url(payload).toString("utf8")) as SessionClaims;
    const now = Math.floor(Date.now() / 1000);

    if (typeof claims.exp !== "number" || claims.exp <= now) return null;
    if (typeof claims.iat !== "number" || claims.iat - 60 > now) return null;
    if (!claims.login || !claims.role) return null;

    return {
      githubId: Number(claims.sub),
      login: claims.login,
      displayName: claims.name,
      avatarUrl: claims.avatar,
      role: claims.role,
      issuedAt: claims.iat,
      accessToken: claims.gh,
      scopes: claims.scp
    };
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

/**
 * 既定は `read:user` のみ。プライベートリポジトリも一覧に出したい人だけ
 * includePrivate で `repo` を追加する（許可画面が重くなるため既定では要求しない）。
 */
export function buildAuthorizeUrl({
  state,
  callbackUrl,
  includePrivate = false
}: {
  state: string;
  callbackUrl: string;
  includePrivate?: boolean;
}): string {
  const url = new URL("https://github.com/login/oauth/authorize");
  url.searchParams.set("client_id", process.env.GITHUB_CLIENT_ID ?? "");
  url.searchParams.set("redirect_uri", callbackUrl);
  url.searchParams.set("scope", includePrivate ? "read:user repo" : "read:user");
  url.searchParams.set("state", state);
  return url.toString();
}

/** 付与されたスコープにプライベート閲覧が含まれるか。 */
export function canListPrivateRepos(scopes: string | undefined): boolean {
  return (scopes ?? "")
    .split(",")
    .map((scope) => scope.trim())
    .includes("repo");
}

export async function exchangeCodeForToken({
  code,
  callbackUrl
}: {
  code: string;
  callbackUrl: string;
}): Promise<{ accessToken: string; scopes: string }> {
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
    scope?: string;
    error_description?: string;
    error?: string;
  };

  if (!response.ok || !payload.access_token) {
    throw new Error(
      payload.error_description ?? payload.error ?? "GitHubのトークン取得に失敗しました。"
    );
  }

  return { accessToken: payload.access_token, scopes: payload.scope ?? "" };
}

export async function fetchGitHubUser(
  accessToken: string,
  scopes = ""
): Promise<GitHubIdentity> {
  const response = await fetch("https://api.github.com/user", {
    headers: {
      accept: "application/vnd.github+json",
      authorization: `Bearer ${accessToken}`,
      "user-agent": "HackRadar"
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
    issuedAt: Math.floor(Date.now() / 1000),
    accessToken,
    scopes
  };
}

/**
 * ログイン中のユーザーが触れるリポジトリの一覧。
 * 追加のスコープは要求していないため、返るのはパブリックリポジトリのみ。
 * プライベートも選ばせたい場合は認可時のscopeに `repo` を足す必要がある。
 */
export async function fetchGitHubRepos(accessToken: string): Promise<GitHubRepo[]> {
  const url = new URL("https://api.github.com/user/repos");
  url.searchParams.set("per_page", "100");
  url.searchParams.set("sort", "updated");
  url.searchParams.set("affiliation", "owner,collaborator,organization_member");
  url.searchParams.set("visibility", "all");

  const response = await fetch(url, {
    headers: {
      accept: "application/vnd.github+json",
      authorization: `Bearer ${accessToken}`,
      "user-agent": "HackRadar"
    }
  });

  if (!response.ok) {
    throw new Error("リポジトリ一覧を取得できませんでした。");
  }

  const repos = (await response.json()) as Array<{
    full_name?: string;
    private?: boolean;
    updated_at?: string;
  }>;

  return repos
    .filter((repo): repo is { full_name: string; private?: boolean; updated_at?: string } =>
      Boolean(repo.full_name)
    )
    .map((repo) => ({
      fullName: repo.full_name,
      private: Boolean(repo.private),
      updatedAt: repo.updated_at ?? ""
    }));
}
