import { afterEach, beforeEach, describe, expect, it } from "vitest";
import {
  SESSION_MAX_AGE,
  buildAuthorizeUrl,
  canListPrivateRepos,
  isGitHubAuthConfigured,
  parseIdentity,
  resolveRole,
  serializeIdentity,
  type GitHubIdentity
} from "@/lib/github-auth";

const baseIdentity: GitHubIdentity = {
  githubId: 12345,
  login: "matsu",
  displayName: "まつ",
  avatarUrl: "https://avatars.githubusercontent.com/u/12345",
  role: "participant",
  issuedAt: Math.floor(Date.now() / 1000)
};

const originalEnv = { ...process.env };

beforeEach(() => {
  process.env.AUTH_SECRET = "test-auth-secret";
  process.env.GITHUB_CLIENT_ID = "test-client-id";
  process.env.GITHUB_CLIENT_SECRET = "test-client-secret";
  delete process.env.ADMIN_GITHUB_LOGINS;
});

afterEach(() => {
  process.env = { ...originalEnv };
});

function b64url(value: string) {
  return Buffer.from(value)
    .toString("base64")
    .replace(/\+/g, "-")
    .replace(/\//g, "_")
    .replace(/=+$/, "");
}

describe("セッションJWT（HS256）", () => {
  it("署名したものを復元できる", () => {
    const token = serializeIdentity(baseIdentity);
    expect(parseIdentity(token)).toEqual(baseIdentity);
  });

  it("JWTの形とクレームが正しい", () => {
    const [header, payload] = serializeIdentity(baseIdentity).split(".");

    expect(serializeIdentity(baseIdentity).split(".")).toHaveLength(3);
    expect(JSON.parse(Buffer.from(header, "base64url").toString("utf8"))).toEqual({
      alg: "HS256",
      typ: "JWT"
    });

    const claims = JSON.parse(Buffer.from(payload, "base64url").toString("utf8"));
    expect(claims.sub).toBe("12345");
    expect(claims.login).toBe("matsu");
    expect(claims.exp - claims.iat).toBe(SESSION_MAX_AGE);
  });

  it("本文を書き換えたトークンは拒否する", () => {
    const [header, payload, signature] = serializeIdentity(baseIdentity).split(".");
    const claims = JSON.parse(Buffer.from(payload, "base64url").toString("utf8"));
    const forged = b64url(JSON.stringify({ ...claims, role: "admin" }));

    expect(parseIdentity(`${header}.${forged}.${signature}`)).toBeNull();
  });

  it("alg:none への差し替えを拒否する", () => {
    const [, payload] = serializeIdentity(baseIdentity).split(".");
    const noneHeader = b64url(JSON.stringify({ alg: "none", typ: "JWT" }));

    expect(parseIdentity(`${noneHeader}.${payload}.`)).toBeNull();
  });

  it("algを別のものに変えたトークンを拒否する", () => {
    const [, payload, signature] = serializeIdentity(baseIdentity).split(".");
    const header = b64url(JSON.stringify({ alg: "HS512", typ: "JWT" }));

    expect(parseIdentity(`${header}.${payload}.${signature}`)).toBeNull();
  });

  it("鍵が違えば拒否する", () => {
    const token = serializeIdentity(baseIdentity);
    process.env.AUTH_SECRET = "another-secret";
    expect(parseIdentity(token)).toBeNull();
  });

  it("形式が壊れていれば拒否する", () => {
    expect(parseIdentity(undefined)).toBeNull();
    expect(parseIdentity("")).toBeNull();
    expect(parseIdentity("no-dot")).toBeNull();
    expect(parseIdentity("a.b")).toBeNull();
    expect(parseIdentity("a.b.c.d")).toBeNull();
  });

  it("アクセストークンをJWTに載せて復元できる", () => {
    const token = serializeIdentity({ ...baseIdentity, accessToken: "gho_dummy" });
    expect(parseIdentity(token)?.accessToken).toBe("gho_dummy");
  });

  it("有効期限を過ぎたものは拒否する", () => {
    const expired = serializeIdentity({
      ...baseIdentity,
      issuedAt: Math.floor(Date.now() / 1000) - SESSION_MAX_AGE - 60
    });

    expect(parseIdentity(expired)).toBeNull();
  });
});

describe("allowlistによる役割の判定", () => {
  it("設定がなければ参加者になる", () => {
    expect(resolveRole("matsu")).toBe("participant");
  });

  it("運営を判定する", () => {
    process.env.ADMIN_GITHUB_LOGINS = "alice, bob";

    expect(resolveRole("alice")).toBe("admin");
    expect(resolveRole("bob")).toBe("admin");
    expect(resolveRole("matsu")).toBe("participant");
  });

  it("大文字小文字を区別しない", () => {
    process.env.ADMIN_GITHUB_LOGINS = "Alice";
    expect(resolveRole("alice")).toBe("admin");
    expect(resolveRole("ALICE")).toBe("admin");
  });

});

describe("認可URLの組み立て", () => {
  it("必要なパラメータが揃っている", () => {
    const url = new URL(
      buildAuthorizeUrl({
        state: "abc123",
        callbackUrl: "http://localhost:3000/api/auth/github/callback"
      })
    );

    expect(url.origin + url.pathname).toBe("https://github.com/login/oauth/authorize");
    expect(url.searchParams.get("client_id")).toBe("test-client-id");
    expect(url.searchParams.get("state")).toBe("abc123");
    expect(url.searchParams.get("redirect_uri")).toBe(
      "http://localhost:3000/api/auth/github/callback"
    );
    // 既定ではリポジトリへのアクセス権限を要求しない。
    expect(url.searchParams.get("scope")).toBe("read:user");
  });

  it("プライベートを見たいときだけrepoスコープを足す", () => {
    process.env.GITHUB_CLIENT_ID = "test-client-id";

    const url = new URL(
      buildAuthorizeUrl({
        state: "abc123",
        callbackUrl: "http://localhost:3000/api/auth/github/callback",
        includePrivate: true
      })
    );

    expect(url.searchParams.get("scope")).toBe("read:user repo");
  });

  it("付与スコープからプライベート表示の可否を判定する", () => {
    expect(canListPrivateRepos("read:user, repo")).toBe(true);
    expect(canListPrivateRepos("read:user")).toBe(false);
    expect(canListPrivateRepos("")).toBe(false);
    expect(canListPrivateRepos(undefined)).toBe(false);
  });
});

describe("設定の有無", () => {
  it("client idとsecretが揃っているときだけ有効", () => {
    expect(isGitHubAuthConfigured()).toBe(true);

    delete process.env.GITHUB_CLIENT_SECRET;
    expect(isGitHubAuthConfigured()).toBe(false);
  });
});
