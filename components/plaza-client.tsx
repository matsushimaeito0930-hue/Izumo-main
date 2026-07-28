"use client";

import { useState } from "react";
import { ActivityFeed } from "@/components/activity-feed";
import { DemoControls } from "@/components/demo-controls";
import { HelpBoard } from "@/components/help-board";
import { MentorList } from "@/components/mentor-list";
import { PlazaScene } from "@/components/plaza-scene";
import { RankingPanel } from "@/components/ranking-panel";
import { RealtimeStatusBadge } from "@/components/realtime-status-badge";
import { useHackVerseState } from "@/components/use-hackverse-state";
import type { HackVerseState, Team } from "@/lib/types";

export function PlazaClient({ initialState }: { initialState: HackVerseState }) {
  const {
    state,
    isRefreshing,
    realtimeStatus,
    lastActivityId,
    triggerDemoEvent
  } = useHackVerseState(initialState);
  const [nearbyTeam, setNearbyTeam] = useState<Team | null>(null);
  const latestActivity = state.activities[0];

  return (
    <div className="relative">
      <PlazaScene state={state} onNearbyTeamChange={setNearbyTeam} />

      <div className="pointer-events-none absolute inset-0 hidden p-4 lg:block">
        <div className="grid h-full grid-cols-[22rem_1fr_23rem] gap-4">
          <div className="pointer-events-auto flex flex-col gap-4">
            <DemoControls teams={state.teams} onTrigger={triggerDemoEvent} />
            <div className="max-h-[24rem] overflow-hidden">
              <ActivityFeed activities={state.activities} highlightId={lastActivityId} />
            </div>
          </div>

          <div className="flex flex-col items-center justify-between">
            <div className="rounded-lg border border-pulse/25 bg-void/64 px-4 py-3 text-center shadow-neon backdrop-blur">
              <div className="flex flex-wrap items-center justify-center gap-3">
                <p className="text-xs font-black uppercase tracking-[0.2em] text-pulse">
                  HackVerse City Lobby
                </p>
                <RealtimeStatusBadge
                  status={realtimeStatus}
                  isRefreshing={isRefreshing}
                />
              </div>
              <p className="mt-2 text-sm text-white/68">
                GitHubイベントが街のラボ、ランキング、アクティビティに反映されます。
              </p>
            </div>

            <div className="mb-4 w-full max-w-md rounded-lg border border-white/10 bg-void/72 p-4 shadow-hot backdrop-blur">
              {nearbyTeam ? (
                <>
                  <p className="text-xs font-black uppercase tracking-[0.18em] text-sun">
                    Nearby Team Lab
                  </p>
                  <div className="mt-3 flex items-end justify-between gap-4">
                    <div>
                      <h2 className="text-2xl font-black text-white">
                        {nearbyTeam.name}
                      </h2>
                      <p className="mt-1 text-xs text-white/52">
                        {nearbyTeam.github_repo}
                      </p>
                    </div>
                    <div className="text-right">
                      <p className="text-3xl font-black text-pulse">
                        {nearbyTeam.score}
                      </p>
                      <p className="text-xs text-white/50">
                        Lab Lv {nearbyTeam.house_level}
                      </p>
                    </div>
                  </div>
                  <div className="mt-4 rounded-md border border-white/10 bg-white/[0.04] p-3">
                    <p className="text-xs font-black uppercase tracking-[0.14em] text-field">
                      GitHub Commit Count
                    </p>
                    <p className="mt-1 text-2xl font-black text-white">
                      {nearbyTeam.commit_count}
                    </p>
                  </div>
                </>
              ) : (
                <>
                  <p className="text-xs font-black uppercase tracking-[0.18em] text-white/50">
                    Walk To A Team Lab
                  </p>
                  <p className="mt-2 text-sm text-white/70">
                    ラボに近づくと、チームのスコアとGitHub状況がここに表示されます。
                  </p>
                </>
              )}
            </div>
          </div>

          <div className="pointer-events-auto flex flex-col gap-4">
            <RankingPanel teams={state.teams} />
            <HelpBoard posts={state.helpPosts} />
            <MentorList mentors={state.mentors} />
          </div>
        </div>
      </div>

      <div className="pointer-events-none absolute right-4 top-4 rounded-lg border border-white/10 bg-void/72 p-3 shadow-neon backdrop-blur lg:hidden">
        <p className="text-xs font-black uppercase tracking-[0.16em] text-pulse">
          Latest
        </p>
        <p className="mt-1 max-w-56 text-sm font-bold text-white">
          {latestActivity?.message ?? "No activity yet"}
        </p>
      </div>

      <div className="mt-5 grid gap-5 lg:hidden">
        <RealtimeStatusBadge status={realtimeStatus} isRefreshing={isRefreshing} />
        <DemoControls teams={state.teams} onTrigger={triggerDemoEvent} />
        <RankingPanel teams={state.teams} />
        <ActivityFeed activities={state.activities} highlightId={lastActivityId} />
        <HelpBoard posts={state.helpPosts} />
        <MentorList mentors={state.mentors} />
      </div>
    </div>
  );
}
