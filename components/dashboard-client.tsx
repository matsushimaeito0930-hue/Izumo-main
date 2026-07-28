"use client";

import { ActivityFeed } from "@/components/activity-feed";
import { DemoControls } from "@/components/demo-controls";
import { DevelopmentOverview } from "@/components/development-overview";
import { HelpBoard } from "@/components/help-board";
import { HelpComposer } from "@/components/help-composer";
import { MentorList } from "@/components/mentor-list";
import { RankingPanel } from "@/components/ranking-panel";
import { RealtimeStatusBadge } from "@/components/realtime-status-badge";
import { TeamHouseCard } from "@/components/team-house-card";
import { useHackVerseState } from "@/components/use-hackverse-state";
import type { HackVerseState } from "@/lib/types";

type ViewMode = "lobby" | "home" | "help" | "ranking";

export function DashboardClient({
  initialState,
  view
}: {
  initialState: HackVerseState;
  view: ViewMode;
}) {
  const {
    state,
    isRefreshing,
    realtimeStatus,
    lastActivityId,
    triggerDemoEvent,
    createHelp
  } = useHackVerseState(initialState);
  const currentTeam = state.teams.find((team) => team.name === "Team A") ?? state.teams[0];

  if (view === "home") {
    return (
      <div className="grid gap-5 lg:grid-cols-[minmax(0,1fr)_24rem]">
        <div className="space-y-5">
          <TeamHouseCard team={currentTeam} />
          <ActivityFeed
            activities={state.activities.filter(
              (activity) => activity.team_id === currentTeam.id
            )}
            highlightId={lastActivityId}
          />
        </div>
        <div className="space-y-5">
          <DemoControls teams={state.teams} onTrigger={triggerDemoEvent} />
          <RankingPanel teams={state.teams} />
        </div>
      </div>
    );
  }

  if (view === "help") {
    return (
      <div className="grid gap-5 lg:grid-cols-[minmax(0,1fr)_24rem]">
        <div className="space-y-5">
          <HelpComposer teams={state.teams} onSubmit={createHelp} />
          <HelpBoard posts={state.helpPosts} />
        </div>
        <div className="space-y-5">
          <MentorList mentors={state.mentors} />
          <ActivityFeed activities={state.activities} highlightId={lastActivityId} />
        </div>
      </div>
    );
  }

  if (view === "ranking") {
    return (
      <div className="grid gap-5 lg:grid-cols-[minmax(0,1fr)_24rem]">
        <RankingPanel teams={state.teams} />
        <div className="space-y-5">
          <DemoControls teams={state.teams} onTrigger={triggerDemoEvent} />
          <ActivityFeed activities={state.activities} highlightId={lastActivityId} />
        </div>
      </div>
    );
  }

  return (
    <div className="space-y-5">
      <section className="rounded-lg border border-pulse/20 bg-panel/80 p-5 shadow-neon sm:p-6">
        <div className="flex flex-col gap-4 md:flex-row md:items-end md:justify-between">
          <div className="min-w-0">
            <div className="flex flex-wrap items-center gap-3">
              <p className="text-xs font-black uppercase tracking-[0.2em] text-pulse">
                HackVerse Control Room
              </p>
              <RealtimeStatusBadge status={realtimeStatus} isRefreshing={isRefreshing} />
            </div>
            <h1 className="mt-3 max-w-3xl text-3xl font-black leading-tight tracking-tight text-white sm:text-5xl">
              開発状況を、ひと目で。
            </h1>
            <p className="mt-3 max-w-2xl text-sm leading-6 text-white/60 sm:text-base">
              チームごとのコミット数、Momentum Score、最新イベントを同じ画面で比較できます。
            </p>
          </div>
          <div className="shrink-0 font-mono text-xs text-white/40">
            {state.updatedAt ? `Updated ${new Date(state.updatedAt).toLocaleTimeString()}` : "Waiting for data"}
          </div>
        </div>
      </section>

      <DevelopmentOverview teams={state.teams} activities={state.activities} />

      <div className="grid gap-5 xl:grid-cols-[minmax(0,1.3fr)_minmax(20rem,0.7fr)]">
        <ActivityFeed activities={state.activities} highlightId={lastActivityId} />
        <div className="space-y-5">
          <RankingPanel teams={state.teams} />
          <DemoControls teams={state.teams} onTrigger={triggerDemoEvent} />
        </div>
      </div>

      <div className="grid gap-5 lg:grid-cols-2">
        <HelpBoard posts={state.helpPosts} />
        <MentorList mentors={state.mentors} />
      </div>
    </div>
  );
}
