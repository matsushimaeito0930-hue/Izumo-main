import { GitCommitHorizontal, Trophy } from "lucide-react";
import type { ActivityView, Team } from "@/lib/types";

function barWidth(value: number, maximum: number) {
  if (value <= 0) return "0%";
  return `${Math.max(4, Math.round((value / maximum) * 100))}%`;
}

export function DevelopmentOverview({
  teams,
  activities,
  myTeamId = null
}: {
  teams: Team[];
  activities: ActivityView[];
  myTeamId?: string | null;
}) {
  const maxScore = Math.max(...teams.map((team) => team.score), 1);
  const totalCommits = teams.reduce((total, team) => total + team.commit_count, 0);
  const topTeam = teams[0];
  const latestByTeam = new Map<string, ActivityView>();

  for (const activity of activities) {
    if (!latestByTeam.has(activity.team_id)) {
      latestByTeam.set(activity.team_id, activity);
    }
  }

  return (
    <div className="space-y-5">
      <div className="grid gap-3 sm:grid-cols-2">
        <div className="rounded-2xl border border-line/70 bg-surface p-4 shadow-card">
          <div className="flex items-center gap-2">
            <span className="grid size-7 place-items-center rounded-xl bg-pulse/10 text-pulse shadow-soft">
              <GitCommitHorizontal className="size-4" />
            </span>
            <span className="text-xs font-medium text-muted">
              みんなの合計コミット数
            </span>
          </div>
          <p className="mt-3 flex items-baseline gap-1">
            <span className="text-3xl font-bold tracking-tight text-ink">
              {totalCommits}
            </span>
            <span className="text-sm text-muted">件</span>
          </p>
        </div>

        <div className="rounded-2xl border border-line/70 bg-surface p-4 shadow-card">
          <div className="flex items-center gap-2">
            <span className="grid size-7 place-items-center rounded-xl bg-sun/10 text-sun shadow-soft">
              <Trophy className="size-4" />
            </span>
            <span className="text-xs font-medium text-muted">いま1位のチーム</span>
          </div>
          <p className="mt-3 flex items-baseline gap-2">
            <span className="truncate text-3xl font-bold tracking-tight text-ink">
              {topTeam?.name ?? "-"}
            </span>
            <span className="font-mono text-sm text-muted">
              {topTeam?.score ?? 0} pt
            </span>
          </p>
        </div>
      </div>

      <section className="rounded-2xl border border-line/70 bg-surface shadow-card">
        <div className="border-b border-line px-5 py-4">
          <h2 className="text-base font-bold tracking-tight text-ink">チームの進み具合</h2>
          <p className="mt-1 text-xs leading-5 text-muted">
            スコアはコミットやプルリクエストの数から自動で計算されます。
          </p>
        </div>

        <ul className="divide-y divide-line">
          {teams.length === 0 ? (
            <li className="px-5 py-10 text-center">
              <p className="text-sm font-bold text-ink">まだチームがありません</p>
              <p className="mt-1 text-xs leading-5 text-muted">
                運営がチーム名とGitHubリポジトリを登録すると、ここに表示されます。
              </p>
            </li>
          ) : teams.map((team, index) => {
            const latestActivity = latestByTeam.get(team.id);
            const isMine = team.id === myTeamId;
            return (
              <li
                key={team.id}
                className={`px-5 py-4 transition-colors ${
                  isMine ? "bg-pulse/5" : "hover:bg-sand/70"
                }`}
              >
                <div className="flex flex-col gap-3 lg:grid lg:grid-cols-[minmax(11rem,0.9fr)_minmax(0,1.4fr)] lg:items-center lg:gap-6">
                  <div className="flex min-w-0 items-center gap-3">
                    <span
                      className={`grid size-8 shrink-0 place-items-center rounded-xl text-sm font-bold ${
                        index === 0
                          ? "bg-sun/15 text-sun shadow-soft"
                          : "bg-paper2 text-muted shadow-inset"
                      }`}
                    >
                      {index + 1}
                    </span>
                    <div className="min-w-0">
                      <p className="flex items-center gap-1.5 truncate text-sm font-bold text-ink">
                        {team.name}
                        {isMine && (
                          <span className="shrink-0 rounded-full bg-pulse/15 px-1.5 py-0.5 text-[10px] font-medium text-pulse">
                            自分のチーム
                          </span>
                        )}
                      </p>
                      <p className="truncate text-xs text-muted">
                        {latestActivity?.message ?? "まだ活動がありません"}
                      </p>
                    </div>
                  </div>

                  <div className="grid grid-cols-[minmax(0,1fr)_5.5rem] items-center gap-3">
                    <div className="h-2.5 overflow-hidden rounded-full bg-paper2 shadow-inset">
                      <div
                        className="h-full rounded-full bg-pulse transition-[width] duration-500"
                        style={{ width: barWidth(team.score, maxScore) }}
                      />
                    </div>
                    <span className="text-right text-sm text-muted">
                      <span className="font-mono font-bold text-ink">{team.score}</span> pt
                      <span className="ml-1.5 font-mono text-xs">
                        / {team.commit_count}c
                      </span>
                    </span>
                  </div>
                </div>
              </li>
            );
          })}
        </ul>
      </section>
    </div>
  );
}
