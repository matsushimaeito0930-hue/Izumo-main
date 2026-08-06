import { CircleAlert, CircleCheck } from "lucide-react";

export type WebhookResult =
  | { status: "created"; url: string }
  | { status: "updated"; url: string }
  | { status: "skipped"; reason: string };

/**
 * Webhookの自動登録がどうなったかの表示。
 * 失敗しても参加自体は成立しているので、責める文言にせず手動手順だけを示す。
 */
export function WebhookNotice({
  result,
  githubRepo
}: {
  result: WebhookResult;
  githubRepo?: string;
}) {
  if (result.status !== "skipped") {
    return (
      <p className="flex items-start gap-2 rounded-xl border border-pulse/25 bg-pulse/5 px-3 py-2.5 text-xs leading-5 text-ink2">
        <CircleCheck className="mt-0.5 size-4 shrink-0 text-pulse" />
        <span>
          GitHubとの連携が完了しました。プッシュすると自動で反映されます。
        </span>
      </p>
    );
  }

  const settingsUrl = githubRepo
    ? `https://github.com/${githubRepo}/settings/hooks/new`
    : null;

  return (
    <div className="rounded-xl border border-sun/30 bg-sun/5 px-3 py-2.5">
      <p className="flex items-start gap-2 text-xs leading-5 text-ink2">
        <CircleAlert className="mt-0.5 size-4 shrink-0 text-sun" />
        <span>
          自動連携できませんでした（{result.reason}）。
          リポジトリの設定は保存されています。下の手順で1回だけ設定すると反映が始まります。
        </span>
      </p>
      <ol className="mt-2 list-decimal space-y-0.5 pl-8 text-xs leading-5 text-muted">
        <li>リポジトリの Settings → Webhooks → Add webhook を開く</li>
        <li>
          Payload URL に <code className="font-mono">/api/github/webhook</code>{" "}
          までのURLを入れる
        </li>
        <li>Content type を application/json にする</li>
        <li>Secret に運営から渡された文字列を入れる</li>
        <li>Push / Pull requests / Issues / Pull request reviews を選ぶ</li>
      </ol>
      {settingsUrl && (
        <a
          href={settingsUrl}
          target="_blank"
          rel="noreferrer"
          className="mt-2 inline-block pl-8 text-xs text-pulse underline underline-offset-2"
        >
          このリポジトリの設定画面を開く
        </a>
      )}
    </div>
  );
}
