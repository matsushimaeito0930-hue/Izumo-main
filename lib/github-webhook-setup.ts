import { canManageWebhooks } from "@/lib/github-auth";

/**
 * 参加者が選んだリポジトリに、HackRadar宛のWebhookを自動で登録する。
 *
 * 参加者一人ひとりに Settings → Webhooks を手作業でやらせないための処理。
 * 失敗しても参加やリポジトリ設定は成立させ、理由だけを返して手動手順に案内する。
 */

/** アプリが受け取りたいGitHubイベント。 */
const WEBHOOK_EVENTS = ["push", "pull_request", "issues", "pull_request_review"];

export type WebhookSetupResult =
  | { status: "created"; url: string }
  | { status: "updated"; url: string }
  | { status: "skipped"; reason: string };

type GitHubHook = {
  id: number;
  config?: { url?: string };
};

function githubHeaders(accessToken: string) {
  return {
    accept: "application/vnd.github+json",
    authorization: `Bearer ${accessToken}`,
    "content-type": "application/json",
    "user-agent": "HackRadar",
    "x-github-api-version": "2022-11-28"
  };
}

/**
 * Webhookの宛先。`APP_BASE_URL` があればそれを使い、
 * 無ければリクエストのオリジンから組み立てる（localhostは登録できないので弾く）。
 */
export function resolveWebhookUrl(requestUrl?: string): string | null {
  const base = process.env.APP_BASE_URL?.trim() || process.env.NEXT_PUBLIC_APP_URL?.trim();

  const origin = base
    ? base.replace(/\/+$/, "")
    : requestUrl
      ? new URL(requestUrl).origin
      : null;

  if (!origin) return null;

  // GitHubからは到達できないので、ローカル開発では自動登録しない。
  if (/^https?:\/\/(localhost|127\.0\.0\.1|\[::1\])/i.test(origin)) return null;

  return `${origin}/api/github/webhook`;
}

/**
 * リポジトリにWebhookを登録する。すでに同じURLのものがあれば設定を上書きする。
 * 例外は投げず、必ず結果オブジェクトを返す（呼び出し元の処理を止めないため）。
 */
export async function ensureRepoWebhook({
  accessToken,
  scopes,
  githubRepo,
  requestUrl
}: {
  accessToken: string | undefined;
  scopes: string | undefined;
  githubRepo: string;
  requestUrl?: string;
}): Promise<WebhookSetupResult> {
  const secret = process.env.GITHUB_WEBHOOK_SECRET;

  if (!secret) {
    return { status: "skipped", reason: "GITHUB_WEBHOOK_SECRET が設定されていません。" };
  }

  if (!accessToken) {
    return {
      status: "skipped",
      reason: "GitHubと連携し直すと、Webhookを自動で設定できます。"
    };
  }

  if (!canManageWebhooks(scopes)) {
    return {
      status: "skipped",
      reason:
        "Webhookを設定する権限がありません。ログインし直すと自動で設定できるようになります。"
    };
  }

  const webhookUrl = resolveWebhookUrl(requestUrl);
  if (!webhookUrl) {
    return {
      status: "skipped",
      reason: "ローカル環境ではWebhookを自動登録できません。"
    };
  }

  const [owner, repo] = githubRepo.split("/");
  if (!owner || !repo) {
    return { status: "skipped", reason: "リポジトリ名の形式が正しくありません。" };
  }

  const hooksEndpoint = `https://api.github.com/repos/${encodeURIComponent(
    owner
  )}/${encodeURIComponent(repo)}/hooks`;

  const config = {
    url: webhookUrl,
    content_type: "json",
    secret,
    insecure_ssl: "0"
  };

  try {
    // 二重登録を避けるため、まず同じURLのhookを探す。
    const existingResponse = await fetch(`${hooksEndpoint}?per_page=100`, {
      headers: githubHeaders(accessToken),
      cache: "no-store"
    });

    if (existingResponse.status === 403 || existingResponse.status === 404) {
      return {
        status: "skipped",
        reason:
          "このリポジトリの管理者権限がないため、Webhookを自動設定できませんでした。"
      };
    }

    if (existingResponse.ok) {
      const hooks = (await existingResponse.json()) as GitHubHook[];
      const existing = hooks.find((hook) => hook.config?.url === webhookUrl);

      if (existing) {
        // secretやイベント一覧が古い可能性があるので貼り直す。
        const patched = await fetch(`${hooksEndpoint}/${existing.id}`, {
          method: "PATCH",
          headers: githubHeaders(accessToken),
          body: JSON.stringify({ active: true, events: WEBHOOK_EVENTS, config })
        });

        return patched.ok
          ? { status: "updated", url: webhookUrl }
          : { status: "skipped", reason: "既存のWebhookを更新できませんでした。" };
      }
    }

    const created = await fetch(hooksEndpoint, {
      method: "POST",
      headers: githubHeaders(accessToken),
      body: JSON.stringify({
        name: "web",
        active: true,
        events: WEBHOOK_EVENTS,
        config
      })
    });

    if (created.ok) {
      return { status: "created", url: webhookUrl };
    }

    const payload = (await created.json().catch(() => ({}))) as {
      message?: string;
      errors?: { message?: string }[];
    };

    return {
      status: "skipped",
      reason:
        payload.errors?.[0]?.message ??
        payload.message ??
        "GitHubがWebhookの登録を受け付けませんでした。"
    };
  } catch (error) {
    return {
      status: "skipped",
      reason:
        error instanceof Error ? error.message : "Webhookの登録中にエラーが発生しました。"
    };
  }
}
