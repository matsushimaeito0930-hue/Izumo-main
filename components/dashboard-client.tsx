"use client";

import { ActivityFeed } from "@/components/activity-feed";
import { DemoControls } from "@/components/demo-controls";
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
      <div className="grid gap-5 lg:grid-cols-[1fr_24rem]">
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
      <div className="grid gap-5 lg:grid-cols-[1fr_24rem]">
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
      <div className="grid gap-5 lg:grid-cols-[1fr_24rem]">
        <RankingPanel teams={state.teams} />
        <div className="space-y-5">
          <DemoControls teams={state.teams} onTrigger={triggerDemoEvent} />
          <ActivityFeed activities={state.activities} highlightId={lastActivityId} />
        </div>
      </div>
    );
  }

  return (
    <div className="grid gap-5 xl:grid-cols-[1fr_22rem_22rem]">
      <div className="space-y-5">
        <section className="rounded-lg border border-pulse/20 bg-white/[0.045] p-6 shadow-neon">
          <div className="flex flex-wrap items-center gap-3">
            <p className="text-xs font-black uppercase tracking-[0.2em] text-pulse">
              Realtime Lobby
            </p>
            <RealtimeStatusBadge status={realtimeStatus} isRefreshing={isRefreshing} />
          </div>
          <h1 className="mt-3 max-w-3xl text-4xl font-black leading-tight text-white md:text-6xl">
            ハッカソンに、ロビーを。
          </h1>
          <p className="mt-4 max-w-2xl text-base leading-7 text-white/64">
            GitHubのPush、PR、Merge、Issue完了をMomentum Scoreへ変換し、
            広場・家・ランキング・HELP掲示板へ数秒で反映します。
          </p>
        </section>
        <ActivityFeed activities={state.activities} highlightId={lastActivityId} />
      </div>
      <div className="space-y-5">
        <DemoControls teams={state.teams} onTrigger={triggerDemoEvent} />
        <HelpBoard posts={state.helpPosts} />
      </div>
      <div className="space-y-5">
        <RankingPanel teams={state.teams} />
        <MentorList mentors={state.mentors} />
      </div>
    </div>
  );
}
