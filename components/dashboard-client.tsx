"use client";

import { useEffect, useState } from "react";
import { ActivityFeed } from "@/components/activity-feed";
import { ChatPanel } from "@/components/chat-panel";
import { DemoControls } from "@/components/demo-controls";
import { DevelopmentOverview } from "@/components/development-overview";
import { HelpBoard } from "@/components/help-board";
import { HelpComposer } from "@/components/help-composer";
import { MentorList } from "@/components/mentor-list";
import { RankingPanel } from "@/components/ranking-panel";
import { RealtimeStatusBadge } from "@/components/realtime-status-badge";
import { useHackVerseState } from "@/components/use-hackverse-state";
import type { HackVerseState, UserRole } from "@/lib/types";

type ViewMode = "dashboard" | "help";

type Viewer = {
  login: string;
  displayName: string;
  role: UserRole;
};

export function DashboardClient({
  initialState,
  view,
  viewer = null,
  demoEnabled = false
}: {
  initialState: HackVerseState;
  view: ViewMode;
  viewer?: Viewer | null;
  demoEnabled?: boolean;
}) {
  const {
    state,
    isRefreshing,
    realtimeStatus,
    lastActivityId,
    triggerDemoEvent,
    createHelp,
    createHelpReply,
    acceptHelpReply,
    createChatMessage
  } = useHackVerseState(initialState);

  // 参加時に保存したセッションから自分のチームを拾い、一覧で目印を付ける。
  const [myTeamId, setMyTeamId] = useState<string | null>(null);

  useEffect(() => {
    const raw = window.localStorage.getItem("hackverse-session");
    if (!raw) return;

    try {
      const session = JSON.parse(raw) as { teamId?: string };
      setMyTeamId(session.teamId ?? null);
    } catch {
      setMyTeamId(null);
    }
  }, []);

  if (view === "help") {
    return (
      <div className="space-y-5">
        <HelpComposer teams={state.teams} onSubmit={createHelp} />
        <HelpBoard
          posts={state.helpPosts}
          viewerGithub={viewer?.login ?? null}
          viewerRole={viewer?.role}
          onReply={createHelpReply}
          onAccept={acceptHelpReply}
        />
        <ChatPanel
          teams={state.teams}
          mentors={state.mentors}
          messages={state.messages}
          onSend={createChatMessage}
          viewer={viewer}
        />
        <MentorList mentors={state.mentors} />
      </div>
    );
  }

  return (
    <div className="space-y-6">
      <header className="flex flex-col gap-3 sm:flex-row sm:items-end sm:justify-between">
        <div className="min-w-0">
          <h1 className="text-2xl font-bold tracking-tight text-ink sm:text-3xl">
            開発状況
          </h1>
          <p className="mt-1.5 text-sm leading-6 text-muted">
            GitHubにプッシュすると、この画面が自動で更新されます。
          </p>
        </div>
        <div className="flex shrink-0 items-center gap-2">
          <RealtimeStatusBadge status={realtimeStatus} isRefreshing={isRefreshing} />
          {demoEnabled && (
            <DemoControls teams={state.teams} onTrigger={triggerDemoEvent} />
          )}
        </div>
      </header>

      <DevelopmentOverview
        teams={state.teams}
        activities={state.activities}
        myTeamId={myTeamId}
      />

      <div className="grid gap-5 lg:grid-cols-[minmax(0,1.35fr)_minmax(18rem,0.65fr)]">
        <ActivityFeed activities={state.activities} highlightId={lastActivityId} />
        <RankingPanel teams={state.teams} myTeamId={myTeamId} />
      </div>
    </div>
  );
}
