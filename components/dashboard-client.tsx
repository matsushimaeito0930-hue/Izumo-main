"use client";

import { useEffect, useState } from "react";
import { ActivityFeed } from "@/components/activity-feed";
import { AdminRepoStatus } from "@/components/admin-repo-status";
import { DemoControls } from "@/components/demo-controls";
import { DevelopmentOverview } from "@/components/development-overview";
import { HelpBoard } from "@/components/help-board";
import { HelpComposer } from "@/components/help-composer";
import { MyTeamCard } from "@/components/my-team-card";
import { RankingPanel } from "@/components/ranking-panel";
import { StaffChat } from "@/components/staff-chat";
import { RealtimeStatusBadge } from "@/components/realtime-status-badge";
import { TeamRepoSetup } from "@/components/team-repo-setup";
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
    refresh,
    triggerDemoEvent,
    createHelp,
    createHelpReply,
    acceptHelpReply,
    createChatMessage
  } = useHackVerseState(initialState);

  // 参加時に保存したセッションから自分のチームを拾い、一覧で目印を付ける。
  const [myTeamId, setMyTeamId] = useState<string | null>(null);
  const [sessionViewer, setSessionViewer] = useState<Viewer | null>(null);

  useEffect(() => {
    const raw = window.localStorage.getItem("hackverse-session");
    if (!raw) return;

    try {
      const session = JSON.parse(raw) as {
        teamId?: string;
        role?: UserRole;
        displayName?: string;
        githubUsername?: string;
      };
      setMyTeamId(session.teamId ?? null);
      if (session.role && session.displayName) {
        setSessionViewer({
          login: session.githubUsername ?? "local-user",
          displayName: session.displayName,
          role: session.role
        });
      }
    } catch {
      setMyTeamId(null);
      setSessionViewer(null);
    }
  }, [viewer]);

  const activeViewer = viewer ?? sessionViewer;
  const isAdmin = activeViewer?.role === "admin";
  const isMentor = activeViewer?.role === "mentor";
  // 審査員は閲覧専用。開発状況とお知らせだけを見る。
  const isJudge = activeViewer?.role === "judge";
  const isStaff = isAdmin || isMentor;
  const myTeam = state.teams.find((team) => team.id === myTeamId) ?? null;
  // state.teams はスコアの降順。順位はその並びから取る。
  const myRank = myTeam ? state.teams.findIndex((team) => team.id === myTeam.id) + 1 : 0;
  const myLatestActivity =
    state.activities.find((activity) => activity.team_id === myTeamId) ?? null;

  if (view === "help") {
    return (
      <div className="space-y-5">
        {!isAdmin && !isJudge && (
          <>
            <HelpComposer
              teams={isMentor ? state.teams : myTeam ? [myTeam] : []}
              lockedTeamId={isMentor ? null : myTeamId}
              onSubmit={createHelp}
            />
            <HelpBoard
              posts={state.helpPosts}
              viewerGithub={activeViewer?.login ?? null}
              viewerRole={activeViewer?.role}
              onReply={createHelpReply}
              onAccept={acceptHelpReply}
            />
          </>
        )}
        <StaffChat
          teams={state.teams}
          messages={state.messages}
          myTeamId={myTeamId}
          viewer={activeViewer}
          announcementOnly={isAdmin || isJudge}
          readOnly={isJudge}
          onSend={createChatMessage}
        />
      </div>
    );
  }

  return (
    <div className="space-y-6">
      <header className="flex flex-col gap-3 sm:flex-row sm:items-end sm:justify-between">
        <div className="min-w-0">
          <h1 className="text-2xl font-bold tracking-tight text-ink sm:text-3xl">
            {isAdmin ? "全体の開発状況" : "開発状況"}
          </h1>
          <p className="mt-1.5 text-sm leading-6 text-muted">
            {isAdmin
              ? "全チームの進み具合です。参加コードはヘッダー右上からコピーできます。"
              : "GitHubにプッシュすると、この画面が自動で更新されます。"}
          </p>
        </div>
        <div className="flex shrink-0 items-center gap-2">
          <RealtimeStatusBadge status={realtimeStatus} isRefreshing={isRefreshing} />
          {demoEnabled && (isAdmin || !viewer && !sessionViewer) && (
            <DemoControls teams={state.teams} onTrigger={triggerDemoEvent} />
          )}
        </div>
      </header>

      {myTeam && !myTeam.github_repo && (
        <TeamRepoSetup team={myTeam} onDone={refresh} />
      )}

      {/* 参加者は自分のチームを先に見せる。運営は全チームをフラットに見る。 */}
      {!isStaff && !isJudge && myTeam && (
        <MyTeamCard
          team={myTeam}
          rank={myRank}
          totalTeams={state.teams.length}
          latestActivity={myLatestActivity}
          members={state.members.filter((member) => member.team_id === myTeam.id)}
          viewerLogin={activeViewer?.login ?? null}
        />
      )}

      {isAdmin && <AdminRepoStatus teams={state.teams} />}

      <DevelopmentOverview
        teams={state.teams}
        activities={state.activities}
        myTeamId={isStaff || isJudge ? null : myTeamId}
        members={state.members}
      />

      <div className="grid gap-5 lg:grid-cols-[minmax(0,1.35fr)_minmax(18rem,0.65fr)]">
        <ActivityFeed activities={state.activities} highlightId={lastActivityId} />
        <RankingPanel teams={state.teams} myTeamId={myTeamId} />
      </div>
    </div>
  );
}
