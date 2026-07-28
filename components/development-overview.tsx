import { Activity, ArrowUpRight, BarChart3, GitCommitHorizontal, Gauge } from "lucide-react";
import { Panel } from "@/components/panel";
import type { ActivityView, Team } from "@/lib/types";

function barWidth(value: number, maximum: number) {
  if (value <= 0) return "0%";
  return `${Math.max(8, Math.round((value / maximum) * 100))}%`;
}

export function DevelopmentOverview({
  teams,
  activities
}: {
  teams: Team[];
  activities: ActivityView[];
}) {
  const maxCommits = Math.max(...teams.map((team) => team.commit_count), 1);
  const maxScore = Math.max(...teams.map((team) => team.score), 1);
  const totalCommits = teams.reduce((total, team) => total + team.commit_count, 0);
  const teamsWithEvents = new Set(activities.map((activity) => activity.team_id)).size;
  const topTeam = teams[0];
  const latestByTeam = new Map<string, ActivityView>();

  for (const activity of activities) {
    if (!latestByTeam.has(activity.team_id)) {
      latestByTeam.set(activity.team_id, activity);
    }
  }

  return (
    <section className="rounded-lg border border-pulse/20 bg-panel/80 p-5 shadow-neon sm:p-6">
      <div className="flex flex-col gap-4 border-b border-white/10 pb-5 sm:flex-row sm:items-end sm:justify-between">
        <div className="min-w-0">
          <div className="flex items-center gap-2 text-pulse">
            <BarChart3 className="size-4" />
            <p className="text-xs font-black uppercase tracking-[0.18em]">
              Development Overview
            </p>
          </div>
          <h2 className="mt-2 text-2xl font-black tracking-tight text-white sm:text-3xl">
            チームの進捗を比較する
          </h2>
          <p className="mt-2 max-w-2xl text-sm leading-6 text-white/55">
            コミット数とMomentum Scoreを同じ視界に並べ、開発の差分をすぐに把握できます。
          </p>
        </div>
        <div className="flex shrink-0 items-center gap-2 text-xs font-bold text-field">
          <span className="size-2 rounded-full bg-field shadow-[0_0_12px_rgba(110,231,183,0.8)]" />
          Live data
        </div>
      </div>

      <div className="mt-5 grid gap-3 sm:grid-cols-3">
        <div className="rounded-md border border-white/10 bg-void/55 p-4">
          <div className="flex items-center justify-between text-white/45">
            <span className="text-xs font-bold uppercase tracking-[0.12em]">All commits</span>
            <GitCommitHorizontal className="size-4 text-pulse" />
          </div>
          <p className="mt-3 font-mono text-3xl font-black text-white">{totalCommits}</p>
          <p className="mt-1 text-xs text-white/45">across {teams.length} teams</p>
        </div>
        <div className="rounded-md border border-white/10 bg-void/55 p-4">
          <div className="flex items-center justify-between text-white/45">
            <span className="text-xs font-bold uppercase tracking-[0.12em]">Leading team</span>
            <ArrowUpRight className="size-4 text-sun" />
          </div>
          <p className="mt-3 truncate text-2xl font-black text-white">{topTeam?.name ?? "-"}</p>
          <p className="mt-1 font-mono text-xs text-sun">{topTeam?.score ?? 0} score</p>
        </div>
        <div className="rounded-md border border-white/10 bg-void/55 p-4">
          <div className="flex items-center justify-between text-white/45">
            <span className="text-xs font-bold uppercase tracking-[0.12em]">Teams with events</span>
            <Activity className="size-4 text-hot" />
          </div>
          <p className="mt-3 font-mono text-3xl font-black text-white">{teamsWithEvents}</p>
          <p className="mt-1 text-xs text-white/45">based on current activity feed</p>
        </div>
      </div>

      <div className="mt-6 flex flex-wrap items-center gap-x-5 gap-y-2 border-b border-white/10 pb-3 text-xs font-bold uppercase tracking-[0.12em] text-white/45">
        <span className="flex items-center gap-2"><span className="size-2 rounded-full bg-pulse" /> Commits</span>
        <span className="flex items-center gap-2"><span className="size-2 rounded-full bg-hot" /> Momentum Score</span>
        <span className="ml-auto flex items-center gap-2"><Gauge className="size-3.5" /> Higher bar = higher value</span>
      </div>

      <div className="mt-4 space-y-3">
        {teams.map((team, index) => {
          const latestActivity = latestByTeam.get(team.id);
          return (
            <div
              key={team.id}
              className="rounded-md border border-white/10 bg-white/[0.035] p-4 transition-colors hover:border-pulse/30 hover:bg-white/[0.055]"
            >
              <div className="flex flex-col gap-4 lg:grid lg:grid-cols-[minmax(10rem,0.8fr)_minmax(0,1.35fr)_minmax(10rem,0.7fr)] lg:items-center lg:gap-6">
                <div className="flex min-w-0 items-center gap-3">
                  <span className="grid size-9 shrink-0 place-items-center rounded-md bg-sun/10 font-mono text-sm font-black text-sun">
                    {index + 1}
                  </span>
                  <div className="min-w-0">
                    <p className="truncate text-base font-black text-white">{team.name}</p>
                    <p className="truncate font-mono text-[11px] text-white/35">{team.github_repo}</p>
                  </div>
                </div>

                <div className="space-y-3">
                  <div className="grid grid-cols-[5.5rem_minmax(0,1fr)_2.5rem] items-center gap-3">
                    <span className="text-xs font-bold uppercase tracking-[0.1em] text-white/45">Commits</span>
                    <div className="h-2 overflow-hidden rounded-full bg-white/10">
                      <div className="h-full rounded-full bg-pulse shadow-[0_0_14px_rgba(51,242,209,0.55)] transition-[width] duration-500" style={{ width: barWidth(team.commit_count, maxCommits) }} />
                    </div>
                    <span className="text-right font-mono text-sm font-black text-pulse">{team.commit_count}</span>
                  </div>
                  <div className="grid grid-cols-[5.5rem_minmax(0,1fr)_2.5rem] items-center gap-3">
                    <span className="text-xs font-bold uppercase tracking-[0.1em] text-white/45">Score</span>
                    <div className="h-2 overflow-hidden rounded-full bg-white/10">
                      <div className="h-full rounded-full bg-hot shadow-[0_0_14px_rgba(255,79,139,0.45)] transition-[width] duration-500" style={{ width: barWidth(team.score, maxScore) }} />
                    </div>
                    <span className="text-right font-mono text-sm font-black text-hot">{team.score}</span>
                  </div>
                </div>

                <div className="min-w-0 border-t border-white/10 pt-3 lg:border-l lg:border-t-0 lg:pl-5 lg:pt-0">
                  <p className="text-[11px] font-bold uppercase tracking-[0.12em] text-white/35">Latest event</p>
                  <p className="mt-1 truncate text-sm font-semibold text-white/75">
                    {latestActivity?.message ?? "No activity yet"}
                  </p>
                  <p className="mt-1 text-xs text-white/35">
                    {latestActivity ? new Date(latestActivity.created_at).toLocaleTimeString() : "Waiting for GitHub"}
                  </p>
                </div>
              </div>
            </div>
          );
        })}
      </div>
    </section>
  );
}
