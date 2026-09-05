"use client";

import { useCallback, useEffect, useState } from "react";
import { Clock3, Link2, LoaderCircle, RefreshCw, Unplug, Users } from "lucide-react";

type MemberSummary = {
  githubUsername: string;
  displayName: string;
  seconds: number;
  connected: boolean;
  unavailable: boolean;
};

type Summary = {
  configured: boolean;
  connected?: boolean;
  teamTotalSeconds?: number;
  totalMembers?: number;
  connectedMembers?: number;
  startDate?: string;
  endDate?: string;
  members?: MemberSummary[];
};

function formatDuration(seconds: number): string {
  const rounded = Math.max(0, Math.round(seconds));
  const hours = Math.floor(rounded / 3600);
  const minutes = Math.floor((rounded % 3600) / 60);
  if (hours === 0 && minutes === 0) return "0分";
  if (hours === 0) return `${minutes}分`;
  return `${hours}時間${minutes > 0 ? `${minutes}分` : ""}`;
}

export function WakaTimePanel({ viewerLogin }: { viewerLogin: string | null }) {
  const [summary, setSummary] = useState<Summary | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [isDisconnecting, setIsDisconnecting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const refresh = useCallback(async () => {
    setIsLoading(true);
    setError(null);
    try {
      const response = await fetch("/api/wakatime/summary", { cache: "no-store" });
      const payload = (await response.json().catch(() => ({}))) as Summary & { error?: string };
      if (!response.ok) throw new Error(payload.error ?? "作業時間を取得できませんでした。");
      setSummary(payload);
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : "作業時間を取得できませんでした。");
    } finally {
      setIsLoading(false);
    }
  }, []);

  useEffect(() => {
    void refresh();
  }, [refresh]);

  async function disconnect() {
    setIsDisconnecting(true);
    setError(null);
    try {
      const response = await fetch("/api/wakatime/summary", { method: "DELETE" });
      const payload = (await response.json().catch(() => ({}))) as { error?: string };
      if (!response.ok) throw new Error(payload.error ?? "連携を解除できませんでした。");
      await refresh();
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : "連携を解除できませんでした。");
    } finally {
      setIsDisconnecting(false);
    }
  }

  if (isLoading && !summary) {
    return (
      <section className="rounded-2xl border border-line bg-surface p-5 shadow-card sm:p-6">
        <p className="flex items-center gap-2 text-sm text-muted">
          <LoaderCircle className="size-4 animate-spin" />
          WakaTimeの作業時間を読み込んでいます…
        </p>
      </section>
    );
  }

  if (summary && !summary.configured) {
    return (
      <section className="rounded-2xl border border-line bg-surface p-5 shadow-card sm:p-6">
        <div className="flex items-start gap-3">
          <Clock3 className="mt-0.5 size-5 text-muted" />
          <div>
            <h2 className="font-bold text-ink">開発時間</h2>
            <p className="mt-1 text-sm leading-6 text-muted">
              WakaTime連携はまだ設定されていません。運営がOAuthの環境変数を設定すると、ここに個人とチームの作業時間が表示されます。
            </p>
          </div>
        </div>
      </section>
    );
  }

  if (!summary) {
    return (
      <section className="rounded-2xl border border-hot/25 bg-surface p-5 shadow-card sm:p-6">
        <h2 className="font-bold text-ink">開発時間</h2>
        <p className="mt-1 text-sm leading-6 text-muted">
          {error ?? "WakaTimeの作業時間を取得できませんでした。Supabaseスキーマと連携設定を確認してください。"}
        </p>
        <button
          type="button"
          onClick={() => void refresh()}
          className="mt-3 inline-flex h-9 items-center gap-1.5 rounded-lg border border-line bg-paper px-3 text-xs font-medium text-ink2 hover:text-ink"
        >
          <RefreshCw className="size-3.5" />
          再試行
        </button>
      </section>
    );
  }

  const members = summary?.members ?? [];
  const ownMember = summary?.connected
    ? members.find(
        (member) => member.githubUsername.toLowerCase() === viewerLogin?.toLowerCase()
      )
    : null;

  return (
    <section className="rounded-2xl border border-pulse/20 bg-surface p-5 shadow-card sm:p-6">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <div className="flex items-center gap-2">
            <Clock3 className="size-5 text-pulse" />
            <h2 className="font-bold text-ink">開発時間</h2>
          </div>
          <p className="mt-1 text-xs leading-5 text-muted">
            {summary?.startDate ?? "-"} から {summary?.endDate ?? "-"} までのWakaTime計測時間
          </p>
        </div>
        <div className="flex items-center gap-2">
          <button
            type="button"
            onClick={() => void refresh()}
            disabled={isLoading}
            className="grid size-9 place-items-center rounded-lg border border-line bg-paper text-muted transition-colors hover:text-ink disabled:opacity-50"
            aria-label="作業時間を更新"
          >
            <RefreshCw className={`size-4 ${isLoading ? "animate-spin" : ""}`} />
          </button>
          {summary?.connected ? (
            <button
              type="button"
              onClick={() => void disconnect()}
              disabled={isDisconnecting}
              className="flex h-9 items-center gap-1.5 rounded-lg border border-line bg-paper px-3 text-xs font-medium text-muted transition-colors hover:border-danger/30 hover:text-danger disabled:opacity-50"
            >
              {isDisconnecting ? <LoaderCircle className="size-3.5 animate-spin" /> : <Unplug className="size-3.5" />}
              連携解除
            </button>
          ) : (
            <a
              href="/api/auth/wakatime"
              className="flex h-9 items-center gap-1.5 rounded-lg bg-ink px-3 text-xs font-bold text-white shadow-btn transition-colors hover:bg-ink2"
            >
              <Link2 className="size-3.5" />
              WakaTimeを連携
            </a>
          )}
        </div>
      </div>

      {error && <p className="mt-4 rounded-lg bg-hot/10 px-3 py-2 text-sm text-hot">{error}</p>}

      <dl className="mt-5 grid grid-cols-2 gap-3">
        <div className="rounded-xl border border-line bg-paper p-3 shadow-inset">
          <dt className="text-xs text-muted">チーム合計</dt>
          <dd className="mt-1 font-mono text-xl font-bold tracking-tight text-ink">
            {formatDuration(summary?.teamTotalSeconds ?? 0)}
          </dd>
        </div>
        <div className="rounded-xl border border-line bg-paper p-3 shadow-inset">
          <dt className="flex items-center gap-1.5 text-xs text-muted">
            <Users className="size-3.5" />
            連携メンバー
          </dt>
          <dd className="mt-1 font-mono text-xl font-bold tracking-tight text-ink">
            {summary?.connectedMembers ?? 0}
            <span className="ml-1 font-sans text-sm font-normal text-muted">/ {summary?.totalMembers ?? 0}人</span>
          </dd>
        </div>
      </dl>

      {summary?.connected && ownMember && (
        <p className="mt-4 rounded-xl bg-pulse/8 px-3 py-2 text-sm text-ink2">
          あなたの計測時間: <span className="font-mono font-bold text-ink">{formatDuration(ownMember.seconds)}</span>
        </p>
      )}

      {members.length > 0 && (
        <ul className="mt-4 divide-y divide-line rounded-xl border border-line bg-paper px-3">
          {members.map((member) => (
            <li key={member.githubUsername} className="flex items-center justify-between gap-3 py-2.5 text-sm">
              <span className="min-w-0 truncate text-ink2">
                {member.displayName} <span className="font-mono text-xs text-muted">@{member.githubUsername}</span>
              </span>
              <span className="shrink-0 font-mono font-bold text-ink">
                {member.connected
                  ? member.unavailable
                    ? "再連携が必要"
                    : formatDuration(member.seconds)
                  : "未連携"}
              </span>
            </li>
          ))}
        </ul>
      )}
    </section>
  );
}
