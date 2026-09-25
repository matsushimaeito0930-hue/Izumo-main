"use client";

import { useCallback, useEffect, useState } from "react";
import { useSearchParams } from "next/navigation";
import {
  ChartNoAxesCombined,
  CheckCircle2,
  Clock3,
  Link2,
  LoaderCircle,
  Minus,
  RefreshCw,
  TrendingDown,
  TrendingUp,
  Unplug,
  Users
} from "lucide-react";

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
  dailyTotals?: Array<{ date: string; seconds: number }>;
};

function formatDuration(seconds: number): string {
  const rounded = Math.max(0, Math.round(seconds));
  const hours = Math.floor(rounded / 3600);
  const minutes = Math.floor((rounded % 3600) / 60);
  if (hours === 0 && minutes === 0) return "0分";
  if (hours === 0) return `${minutes}分`;
  return `${hours}時間${minutes > 0 ? `${minutes}分` : ""}`;
}

function formatDelta(seconds: number): string {
  if (seconds === 0) return "±0分";
  return `${seconds > 0 ? "+" : "-"}${formatDuration(Math.abs(seconds))}`;
}

function TrendChart({ points }: { points: Array<{ date: string; seconds: number }> }) {
  const [activeDate, setActiveDate] = useState<string | null>(null);
  const width = 560;
  const height = 160;
  const padding = { top: 18, right: 16, bottom: 28, left: 16 };
  const max = Math.max(...points.map((point) => point.seconds), 1);
  const innerWidth = width - padding.left - padding.right;
  const innerHeight = height - padding.top - padding.bottom;
  const coordinates = points.map((point, index) => ({
    ...point,
    x: padding.left + (points.length === 1 ? innerWidth / 2 : (index / (points.length - 1)) * innerWidth),
    y: padding.top + innerHeight - (point.seconds / max) * innerHeight
  }));
  const path = coordinates.map((point, index) => `${index === 0 ? "M" : "L"}${point.x} ${point.y}`).join(" ");
  const activePoint = coordinates.find((point) => point.date === activeDate) ?? null;
  const tooltipWidth = 150;
  const tooltipX = activePoint
    ? Math.min(Math.max(activePoint.x - tooltipWidth / 2, 4), width - tooltipWidth - 4)
    : 0;
  const tooltipY = activePoint ? Math.max(activePoint.y - 48, 4) : 0;

  return (
    <div className="mt-4 overflow-x-auto">
      <svg
        viewBox={`0 0 ${width} ${height}`}
        className="h-40 min-w-[22rem] w-full"
        role="img"
        aria-label="直近のチーム開発時間の推移"
      >
        <line x1={padding.left} x2={width - padding.right} y1={height - padding.bottom} y2={height - padding.bottom} stroke="currentColor" className="text-line" />
        <path d={path} fill="none" stroke="currentColor" strokeWidth="3" strokeLinecap="round" strokeLinejoin="round" className="text-pulse" />
        {coordinates.map((point) => (
          <g key={point.date}>
            <circle cx={point.x} cy={point.y} r="4" className="fill-surface stroke-pulse" strokeWidth="2" />
            <circle
              cx={point.x}
              cy={point.y}
              r="13"
              fill="transparent"
              tabIndex={0}
              aria-label={`${point.date}のチーム合計: ${formatDuration(point.seconds)}`}
              onMouseEnter={() => setActiveDate(point.date)}
              onMouseLeave={() => setActiveDate((current) => (current === point.date ? null : current))}
              onFocus={() => setActiveDate(point.date)}
              onBlur={() => setActiveDate((current) => (current === point.date ? null : current))}
            />
            <text x={point.x} y={height - 8} textAnchor="middle" className="fill-muted text-[11px]">
              {point.date.slice(5).replace("-", "/")}
            </text>
          </g>
        ))}
        {activePoint && (
          <g className="pointer-events-none" aria-live="polite">
            <rect x={tooltipX} y={tooltipY} width={tooltipWidth} height="38" rx="6" className="fill-ink" />
            <text x={tooltipX + 10} y={tooltipY + 16} className="fill-white text-[10px]">
              {activePoint.date}
            </text>
            <text x={tooltipX + 10} y={tooltipY + 30} className="fill-white text-[11px] font-bold">
              {`チーム合計 ${formatDuration(activePoint.seconds)}`}
            </text>
          </g>
        )}
      </svg>
    </div>
  );
}

export function WakaTimePanel({ viewerLogin }: { viewerLogin: string | null }) {
  const searchParams = useSearchParams();
  const [summary, setSummary] = useState<Summary | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [isDisconnecting, setIsDisconnecting] = useState(false);
  const [showDetails, setShowDetails] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const oauthError = searchParams.get("wakatime_error");
  const oauthErrorMessage =
    oauthError === "exchange_failed"
      ? "WakaTimeの認可は完了しましたが、連携情報の保存に失敗しました。運営はWAKATIME_CLIENT_SECRETの設定を確認してください。"
      : oauthError === "denied"
        ? "WakaTime連携がキャンセルされました。"
        : oauthError === "state_mismatch"
          ? "連携確認の有効期限が切れました。もう一度WakaTimeを連携してください。"
          : oauthError === "login_required"
            ? "連携するにはHackRadarへログインしてください。"
            : oauthError === "not_configured"
              ? "WakaTime連携はまだ設定されていません。"
              : null;

  const refresh = useCallback(async (includeDetails = false) => {
    setIsLoading(true);
    setError(null);
    try {
      const response = await fetch(`/api/wakatime/summary${includeDetails ? "?details=1" : ""}`, { cache: "no-store" });
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
    const initialRefresh = window.setTimeout(() => void refresh(), 0);
    return () => window.clearTimeout(initialRefresh);
  }, [refresh]);

  async function disconnect() {
    setIsDisconnecting(true);
    setError(null);
    try {
      const response = await fetch("/api/wakatime/summary", { method: "DELETE" });
      const payload = (await response.json().catch(() => ({}))) as { error?: string };
      if (!response.ok) throw new Error(payload.error ?? "連携を解除できませんでした。");
      await refresh(false);
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
  const dailyTotals = summary.dailyTotals ?? [];
  const latestDay = dailyTotals.at(-1) ?? null;
  const previousDay = dailyTotals.at(-2) ?? null;
  const dayDelta = latestDay && previousDay ? latestDay.seconds - previousDay.seconds : null;

  function toggleDetails() {
    const next = !showDetails;
    setShowDetails(next);
    if (next && !summary?.dailyTotals) void refresh(true);
  }

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
            onClick={() => void refresh(showDetails)}
            disabled={isLoading}
            className="grid size-9 place-items-center rounded-lg border border-line bg-paper text-muted transition-colors hover:text-ink disabled:opacity-50"
            aria-label="作業時間を更新"
          >
            <RefreshCw className={`size-4 ${isLoading ? "animate-spin" : ""}`} />
          </button>
          <button
            type="button"
            onClick={toggleDetails}
            aria-expanded={showDetails}
            className="flex h-9 items-center gap-1.5 rounded-lg border border-line bg-paper px-3 text-xs font-bold text-ink2 shadow-inset transition-colors hover:text-ink"
          >
            <ChartNoAxesCombined className="size-3.5" />
            {showDetails ? "詳細を閉じる" : "詳しく見る"}
          </button>
          {summary?.connected ? (
            <div className="flex items-center gap-2">
              <span className="flex h-9 items-center gap-1.5 rounded-lg border border-field/30 bg-field/10 px-3 text-xs font-bold text-field">
                <CheckCircle2 className="size-3.5" />
                WakaTime連携済み
              </span>
              <button
                type="button"
                onClick={() => void disconnect()}
                disabled={isDisconnecting}
                className="grid size-9 place-items-center rounded-lg border border-line bg-paper text-muted transition-colors hover:border-danger/30 hover:text-danger disabled:opacity-50"
                aria-label="WakaTime連携を解除"
                title="連携を解除"
              >
                {isDisconnecting ? <LoaderCircle className="size-3.5 animate-spin" /> : <Unplug className="size-3.5" />}
              </button>
            </div>
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

      {(error || oauthErrorMessage) && (
        <p className="mt-4 rounded-lg bg-hot/10 px-3 py-2 text-sm text-hot">
          {error ?? oauthErrorMessage}
        </p>
      )}

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

      {showDetails && (
        <section className="mt-4 rounded-xl border border-line bg-paper p-3 shadow-inset">
          <div className="flex flex-wrap items-start justify-between gap-3">
            <div>
              <h3 className="text-sm font-bold text-ink">チームの開発時間推移</h3>
              <p className="mt-0.5 text-xs leading-5 text-muted">直近7日間のWakaTime計測時間です。今日の値は途中時点です。</p>
            </div>
            {dayDelta === null ? (
              <span className="text-xs text-muted">前日の記録がないため比較できません</span>
            ) : (
              <span
                className={`flex items-center gap-1 rounded-full px-2.5 py-1 text-xs font-bold ${
                  dayDelta > 0
                    ? "bg-field/10 text-field"
                    : dayDelta < 0
                      ? "bg-hot/10 text-hot"
                      : "bg-sand text-muted"
                }`}
              >
                {dayDelta > 0 ? <TrendingUp className="size-3.5" /> : dayDelta < 0 ? <TrendingDown className="size-3.5" /> : <Minus className="size-3.5" />}
                昨日比 {formatDelta(dayDelta)}
              </span>
            )}
          </div>
          {isLoading && dailyTotals.length === 0 ? (
            <p className="mt-4 text-sm text-muted">日別の開発時間を読み込んでいます…</p>
          ) : dailyTotals.length > 0 ? (
            <TrendChart points={dailyTotals} />
          ) : (
            <p className="mt-4 text-sm text-muted">日別の開発時間はまだありません。</p>
          )}
        </section>
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
