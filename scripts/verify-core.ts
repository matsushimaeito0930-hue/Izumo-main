/**
 * 依存パッケージ無しで動く中核ロジックの検証。
 * node_modules を入れていなくても実行できるので、環境構築前の動作確認に使えます。
 *
 *   npm run verify:core
 *   （中身: node --experimental-strip-types scripts/verify-core.ts）
 */
import { createHmac } from "node:crypto";
import {
  DEFAULT_SCORE_BY_ACTIVITY,
  normalizeScoreConfig
} from "../lib/constants.ts";
import { parseGitHubWebhook, verifyGitHubSignature } from "../lib/github.ts";
import {
  SESSION_MAX_AGE,
  buildAuthorizeUrl,
  canListPrivateRepos,
  canManageWebhooks,
  isGitHubAuthConfigured,
  parseIdentity,
  resolveRole,
  serializeIdentity
} from "../lib/github-auth.ts";

let pass = 0;
let fail = 0;

function check(name: string, actual: unknown, expected: unknown) {
  const a = JSON.stringify(actual);
  const e = JSON.stringify(expected);
  if (a === e) {
    pass++;
    console.log(`  OK   ${name}`);
  } else {
    fail++;
    console.log(`  FAIL ${name}\n         期待: ${e}\n         実際: ${a}`);
  }
}

const SECRET = "hackverse-webhook-secret";
const sign = (body: string) =>
  `sha256=${createHmac("sha256", SECRET).update(body).digest("hex")}`;

console.log("\n[1] Webhook署名の検証");
{
  const body = JSON.stringify({ ref: "refs/heads/main", commits: [{ id: "a" }] });
  check(
    "正しい署名を受け入れる",
    verifyGitHubSignature({ body, signature: sign(body), secret: SECRET }),
    true
  );
  check(
    "本文を1文字変えたら拒否する",
    verifyGitHubSignature({ body: body + " ", signature: sign(body), secret: SECRET }),
    false
  );
  check(
    "secretが違えば拒否する",
    verifyGitHubSignature({ body, signature: sign(body), secret: "wrong-secret" }),
    false
  );
  check(
    "署名ヘッダが無ければ拒否する",
    verifyGitHubSignature({ body, signature: null, secret: SECRET }),
    false
  );
  check(
    "sha1形式は拒否する",
    verifyGitHubSignature({ body, signature: "sha1=abc", secret: SECRET }),
    false
  );
  check(
    "長さが違う署名で例外を投げない",
    verifyGitHubSignature({ body, signature: "sha256=short", secret: SECRET }),
    false
  );
}

console.log("\n[2] GitHubイベントの解析");
{
  const repository = { full_name: "matsu/izumo-main", name: "izumo-main" };

  check(
    "push（3コミット）",
    parseGitHubWebhook("push", { repository, commits: [1, 2, 3] }),
    {
      type: "push",
      githubRepo: "matsu/izumo-main",
      fallbackTeamName: "Izumo Main",
      metadata: { commitCount: 3 }
    }
  );
  check(
    "push（0コミット）は無視",
    parseGitHubWebhook("push", { repository, commits: [] }),
    null
  );
  check(
    "PR作成",
    parseGitHubWebhook("pull_request", {
      action: "opened",
      repository,
      pull_request: { number: 7 }
    }),
    {
      type: "pull_request_opened",
      githubRepo: "matsu/izumo-main",
      fallbackTeamName: "Izumo Main",
      metadata: { number: 7 }
    }
  );
  check(
    "PRマージ",
    parseGitHubWebhook("pull_request", {
      action: "closed",
      repository,
      pull_request: { number: 12, merged: true }
    }),
    {
      type: "pull_request_merged",
      githubRepo: "matsu/izumo-main",
      fallbackTeamName: "Izumo Main",
      metadata: { number: 12 }
    }
  );
  check(
    "マージせず閉じたPRは無視",
    parseGitHubWebhook("pull_request", {
      action: "closed",
      repository,
      pull_request: { number: 12, merged: false }
    }),
    null
  );
  check(
    "Issueクローズ",
    parseGitHubWebhook("issues", {
      action: "closed",
      repository,
      issue: { number: 4 }
    }),
    {
      type: "issue_closed",
      githubRepo: "matsu/izumo-main",
      fallbackTeamName: "Izumo Main",
      metadata: { number: 4 }
    }
  );
  check(
    "Issue作成は無視",
    parseGitHubWebhook("issues", { action: "opened", repository, issue: { number: 4 } }),
    null
  );
  check(
    "レビュー送信",
    parseGitHubWebhook("pull_request_review", {
      action: "submitted",
      repository,
      pull_request: { number: 9 }
    }),
    {
      type: "review",
      githubRepo: "matsu/izumo-main",
      fallbackTeamName: "Izumo Main",
      metadata: { number: 9 }
    }
  );
  check("pingは無視", parseGitHubWebhook("ping", { repository, zen: "..." }), null);
  check("starは無視", parseGitHubWebhook("star", { repository }), null);
}

console.log("\n[3] ログインセッション（JWT / HS256）");
{
  process.env.AUTH_SECRET = "test-auth-secret";
  process.env.GITHUB_CLIENT_ID = "test-client-id";
  process.env.GITHUB_CLIENT_SECRET = "test-client-secret";

  const identity = {
    githubId: 12345,
    login: "matsu",
    displayName: "まつ",
    avatarUrl: "https://avatars.githubusercontent.com/u/12345",
    role: "participant" as const,
    issuedAt: Math.floor(Date.now() / 1000)
  };

  const token = serializeIdentity(identity);
  check("署名して復元できる", parseIdentity(token), identity);

  const b64url = (value: string) =>
    Buffer.from(value)
      .toString("base64")
      .replace(/\+/g, "-")
      .replace(/\//g, "_")
      .replace(/=+$/, "");

  const [header, payloadPart, signaturePart] = token.split(".");

  check("JWTの形式（3パート）である", token.split(".").length, 3);
  check(
    "ヘッダが HS256 である",
    JSON.parse(Buffer.from(header, "base64url").toString("utf8")),
    { alg: "HS256", typ: "JWT" }
  );
  const claims = JSON.parse(Buffer.from(payloadPart, "base64url").toString("utf8"));
  check("subにGitHubのIDが入る", claims.sub, "12345");
  check("expがiat+12時間になっている", claims.exp - claims.iat, SESSION_MAX_AGE);

  const forgedPayload = b64url(JSON.stringify({ ...claims, role: "admin" }));
  check(
    "roleをadminに書き換えたトークンを拒否する",
    parseIdentity(`${header}.${forgedPayload}.${signaturePart}`),
    null
  );

  const noneHeader = b64url(JSON.stringify({ alg: "none", typ: "JWT" }));
  check(
    "alg:none に差し替えたトークンを拒否する",
    parseIdentity(`${noneHeader}.${payloadPart}.`),
    null
  );
  check(
    "alg を書き換えたトークンを拒否する",
    parseIdentity(
      `${b64url(JSON.stringify({ alg: "HS512", typ: "JWT" }))}.${payloadPart}.${signaturePart}`
    ),
    null
  );
  check("署名を落としたトークンを拒否する", parseIdentity(`${header}.${payloadPart}`), null);

  check("壊れた形式を拒否する", parseIdentity("no-dot"), null);
  check("空を拒否する", parseIdentity(""), null);
  check("undefinedを拒否する", parseIdentity(undefined), null);

  const withToken = serializeIdentity({ ...identity, accessToken: "gho_dummy" });
  check(
    "アクセストークンを載せて復元できる",
    parseIdentity(withToken)?.accessToken,
    "gho_dummy"
  );
  check(
    "トークン無しのセッションも扱える",
    parseIdentity(serializeIdentity(identity))?.accessToken,
    undefined
  );

  const expired = serializeIdentity({
    ...identity,
    issuedAt: Math.floor(Date.now() / 1000) - SESSION_MAX_AGE - 60
  });
  check("期限切れを拒否する", parseIdentity(expired), null);

  process.env.AUTH_SECRET = "rotated-secret";
  check("鍵を変えたら以前のトークンを拒否する", parseIdentity(token), null);
  process.env.AUTH_SECRET = "test-auth-secret";
}

console.log("\n[4] 役割のallowlist");
{
  delete process.env.ADMIN_GITHUB_LOGINS;
  check("既定は参加者", resolveRole("matsu"), "participant");

  process.env.ADMIN_GITHUB_LOGINS = "alice, bob";
  check("運営判定", resolveRole("alice"), "admin");
  check("空白入りでも判定できる", resolveRole("bob"), "admin");
  check("該当なしは参加者", resolveRole("matsu"), "participant");
  check("大文字小文字を無視する", resolveRole("ALICE"), "admin");
}

console.log("\n[5] 認可URLの組み立て");
{
  process.env.GITHUB_CLIENT_ID = "test-client-id";
  const url = new URL(
    buildAuthorizeUrl({
      state: "abc123",
      callbackUrl: "http://localhost:3000/api/auth/github/callback"
    })
  );
  check("認可先", url.origin + url.pathname, "https://github.com/login/oauth/authorize");
  check("client_id", url.searchParams.get("client_id"), "test-client-id");
  check("state", url.searchParams.get("state"), "abc123");
  check(
    "redirect_uri",
    url.searchParams.get("redirect_uri"),
    "http://localhost:3000/api/auth/github/callback"
  );
  check(
    "既定scopeにadmin:repo_hookを含む",
    url.searchParams.get("scope"),
    "read:user admin:repo_hook"
  );

  const privateUrl = new URL(
    buildAuthorizeUrl({
      state: "abc123",
      callbackUrl: "http://localhost:3000/api/auth/github/callback",
      includePrivate: true
    })
  );
  check(
    "private=1ならrepoを追加",
    privateUrl.searchParams.get("scope"),
    "read:user admin:repo_hook repo"
  );
  check("repo付与でプライベート可", canListPrivateRepos("read:user, repo"), true);
  check("read:userのみは不可", canListPrivateRepos("read:user"), false);
  check("スコープ未設定は不可", canListPrivateRepos(undefined), false);
  check("hook権限あり", canManageWebhooks("read:user, admin:repo_hook"), true);
  check("repoはhook権限を含む", canManageWebhooks("read:user, repo"), true);
  check("read:userのみはhook不可", canManageWebhooks("read:user"), false);
  check("未設定はhook不可", canManageWebhooks(undefined), false);
  check("設定ありと判定", isGitHubAuthConfigured(), true);
  delete process.env.GITHUB_CLIENT_SECRET;
  check("secretが無ければ無効", isGitHubAuthConfigured(), false);
}

console.log("\n[5] 実行者の取り出し");
{
  const sender = { login: "hanako", avatar_url: "https://example.com/a.png" };

  const push = parseGitHubWebhook("push", {
    repository: { full_name: "team/repo", name: "repo" },
    commits: [{ id: "a" }, { id: "b" }],
    after: "sha-1",
    sender
  });
  check("pushの実行者", push?.actorLogin, "hanako");
  check("pushのアイコン", push?.actorAvatarUrl, "https://example.com/a.png");

  const noSender = parseGitHubWebhook("push", {
    repository: { full_name: "team/repo", name: "repo" },
    commits: [{ id: "a" }],
    head_commit: { id: "a", author: { username: "taro" } }
  });
  check("senderが無ければコミット著者で補う", noSender?.actorLogin, "taro");

  const merged = parseGitHubWebhook("pull_request", {
    action: "closed",
    repository: { full_name: "team/repo", name: "repo" },
    pull_request: { merged: true, number: 7, title: "ログイン画面を追加" },
    sender: { login: "reviewer" }
  });
  check("マージは押した人を記録する", merged?.actorLogin, "reviewer");
  check("PRタイトルを残す", merged?.metadata.title, "ログイン画面を追加");

  const anonymous = parseGitHubWebhook("issues", {
    action: "closed",
    repository: { full_name: "team/repo", name: "repo" },
    issue: { number: 3 }
  });
  check("実行者が取れなければ未設定", anonymous?.actorLogin, undefined);
}

console.log("\n[6] 配点の正規化");
{
  check("未設定は既定値", normalizeScoreConfig(undefined), DEFAULT_SCORE_BY_ACTIVITY);
  check("指定した種別だけ上書き", normalizeScoreConfig({ push: 3 }).push, 3);
  check("他の種別は既定のまま", normalizeScoreConfig({ push: 3 }).review, 3);
  check("文字列の数値も受ける", normalizeScoreConfig({ push: "5" }).push, 5);
  check("小数は四捨五入", normalizeScoreConfig({ push: 2.6 }).push, 3);
  check("負の値は拒否して既定に戻す", normalizeScoreConfig({ push: -1 }).push, 1);
  check("上限超えは拒否", normalizeScoreConfig({ push: 99999 }).push, 1);
  check("数値でなければ拒否", normalizeScoreConfig({ push: "abc" }).push, 1);
  check("知らないキーは無視", "extra" in normalizeScoreConfig({ extra: 5 }), false);
}

console.log(`\n結果: ${pass} 件成功 / ${fail} 件失敗\n`);
process.exit(fail === 0 ? 0 : 1);
