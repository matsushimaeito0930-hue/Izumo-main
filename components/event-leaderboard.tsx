"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { Clock3, RefreshCw, Trophy } from "lucide-react";
import { Panel } from "@/components/panel";
import type { Team } from "@/lib/types";

type TimeRank = {
  teamId: string;
  teamName: string;
  seconds: number;
  totalMembers: number;
  connectedMembers: number;
};

type LeaderboardResponse = {
  configured: boolean;
  teams?: TimeRank[];
  startDate?: string;
  endDate?: string;
  error?: string;
};

function formatDuration(seconds: number): string {
  const minutes = Math.round(Math.max(0, seconds) / 60);
  const hours = Math.floor(minutes / 60);
  return hours > 0 ? `${hours}時間${minutes % 60 ? `${minutes % 60}分` : ""}` : `${minutes}分`;
}

function RankList({
  items,
  myTeamId,
  value
}: {
  items: Array<{ teamId: string; teamName: string }>;
  myTeamId: string | null;
  value: (teamId: string) => React.ReactNode;
}) {
  return (
    <ol className="divide-y divide-line rounded-xl border border-line bg-paper px-3">
      {items.map((item, index) => (
        <li key={item.teamId} className="flex min-w-0 items-center gap-3 py-2.5 text-sm">
          <span className={`grid size-6 shrink-0 place-items-center rounded-lg text-xs font-bold ${index === 0 ? "bg-sun/15 text-sun" : "bg-paper2 text-muted"}`}>
            {index + 1}
          </span>
          <span className="min-w-0 flex-1 truncate font-medium text-ink">
            {item.teamName}
            {item.teamId === myTeamId && <span className="ml-1.5 rounded-full bg-pulse/10 px-1.5 py-0.5 text-[10px] text-pulse">自分</span>}
          </span>
          <span className="shrink-0 font-mono text-xs font-bold text-ink">{value(item.teamId)}</span>
        </li>
      ))}
    </ol>
  );
}

export function EventLeaderboard({ teams, myTeamId }: { teams: Team[]; myTeamId: string | null }) {
  const [timeRanks, setTimeRanks] = useState<TimeRank[]>([]);
  const [configured, setConfigured] = useState<boolean | null>(null);
  const [range, setRange] = useState<{ startDate?: string; endDate?: string }>({});
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");

  const scoreRanks = useMemo(
    () => [...teams].sort((left, right) => right.score - left.score || left.name.localeCompare(right.name)),
    [teams]
  );

  const load = useCallback(async (forceRefresh = false) => {
    setLoading(true);
    setError("");
    try {
      const response = await fetch(`/api/wakatime/leaderboard${forceRefresh ? "?refresh=1" : ""}`, { cache: "no-store" });
      const payload = (await response.json().catch(() => ({}))) as LeaderboardResponse;
      if (!response.ok) throw new Error(payload.error ?? "開発時間ランキングを取得できませんでした。");
      setConfigured(payload.configured);
      setTimeRanks(payload.teams ?? []);
      setRange({ startDate: payload.startDate, endDate: payload.endDate });
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : "開発時間ランキングを取得できませんでした。");
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    const timer = window.setTimeout(() => void load(), 0);
    return () => window.clearTimeout(timer);
  }, [load]);

  if (teams.length === 0) return null;

  return (
    <Panel
      title="イベントランキング"
      description="このイベントに参加しているチームの比較です。開発時間はチーム合計のみを表示します。"
      action={
        <button
          type="button"
          onClick={() => void load(true)}
          disabled={loading}
          className="grid size-9 place-items-center rounded-xl border border-line bg-paper text-muted shadow-inset transition-colors hover:text-ink disabled:opacity-50"
          aria-label="開発時間ランキングを更新"
          title="更新"
        >
          <RefreshCw className={`size-4 ${loading ? "animate-spin" : ""}`} />
        </button>
      }
    >
      <div className="grid gap-5 md:grid-cols-2">
        <section>
          <h3 className="mb-2 flex items-center gap-2 text-sm font-bold text-ink"><Trophy className="size-4 text-sun" />ポイント</h3>
          <RankList items={scoreRanks.map((team) => ({ teamId: team.id, teamName: team.name }))} myTeamId={myTeamId} value={(teamId) => `${scoreRanks.find((team) => team.id === teamId)?.score ?? 0} pt`} />
        </section>
        <section>
          <h3 className="mb-2 flex items-center gap-2 text-sm font-bold text-ink"><Clock3 className="size-4 text-pulse" />開発時間</h3>
          {loading ? (
            <p className="rounded-xl border border-line bg-paper px-3 py-5 text-center text-sm text-muted">開発時間を集計しています…</p>
          ) : !configured ? (
            <p className="rounded-xl border border-dashed border-lineStrong bg-sand/60 px-3 py-5 text-center text-sm text-muted">WakaTime連携が設定されると表示されます。</p>
          ) : error ? (
            <p className="rounded-xl bg-hot/10 px-3 py-4 text-sm text-hot">{error}</p>
          ) : (
            <>
              <RankList items={timeRanks} myTeamId={myTeamId} value={(teamId) => formatDuration(timeRanks.find((team) => team.teamId === teamId)?.seconds ?? 0)} />
              <p className="mt-2 text-xs leading-5 text-muted">{range.startDate ?? "-"} から {range.endDate ?? "-"} まで。連携数は各チームの開発時間カードで確認できます。</p>
            </>
          )}
        </section>
      </div>
    </Panel>
  );
}
