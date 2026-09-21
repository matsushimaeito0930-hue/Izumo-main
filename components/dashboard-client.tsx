"use client";

import { useEffect, useMemo, useState } from "react";
import { ActivityFeed } from "@/components/activity-feed";
import { markAnnouncementsSeen } from "@/components/announcement-badge";
import { ContributorPanel } from "@/components/contributor-panel";
import { DirectMessages } from "@/components/direct-messages";
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
import { TechStackPanel } from "@/components/tech-stack-panel";
import { WakaTimePanel } from "@/components/wakatime-panel";
import { useHackVerseState } from "@/components/use-hackverse-state";
import type { HackVerseState, UserRole } from "@/lib/types";

type ViewMode = "dashboard" | "help" | "announcements";

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
    const restoreSession = window.setTimeout(() => {
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
    }, 0);

    return () => window.clearTimeout(restoreSession);
  }, [viewer]);

  const activeViewer = viewer ?? sessionViewer;
  const isAdmin = activeViewer?.role === "admin";
  const isMentor = activeViewer?.role === "mentor";
  // 審査員は閲覧専用。開発状況とお知らせだけを見る。
  const isJudge = activeViewer?.role === "judge";
  const isStaff = isAdmin || isMentor;
  const myTeam = state.teams.find((team) => team.id === myTeamId) ?? null;
  const canViewAllTechStacks = isJudge || isStaff;
  const techStackTeams = canViewAllTechStacks ? state.teams : myTeam ? [myTeam] : [];
  // state.teams はスコアの降順。順位はその並びから取る。
  const myRank = myTeam ? state.teams.findIndex((team) => team.id === myTeam.id) + 1 : 0;
  const myLatestActivity =
    state.activities.find((activity) => activity.team_id === myTeamId) ?? null;

  // 全チーム宛のお知らせ（team_idなし）のうち、いちばん新しいものの時刻。
  const latestAnnouncementAt = useMemo(() => {
    let newest = 0;
    for (const message of state.messages) {
      if (message.channel !== "staff" || message.team_id !== null) continue;
      const at = Date.parse(message.created_at);
      if (at > newest) newest = at;
    }
    return newest ? new Date(newest).toISOString() : null;
  }, [state.messages]);

  // お知らせ画面を開いている間は既読扱いにして、ナビのバッジを消す。
  useEffect(() => {
    if (view !== "announcements") return;
    markAnnouncementsSeen(latestAnnouncementAt);
  }, [view, latestAnnouncementAt]);

  if (view === "announcements") {
    return (
      <div className="space-y-5">
        {/* 全体連絡は常に最上段。運営だけが投稿でき、他の役割は閲覧する。 */}
        <StaffChat
          teams={state.teams}
          messages={state.messages}
          myTeamId={myTeamId}
          viewer={activeViewer}
          announcementOnly
          readOnly={isJudge}
          onSend={createChatMessage}
        />
        {/* チーム単位の相談は運営・メンターと参加者だけに見せる。 */}
        {!isJudge && (
          <StaffChat
            teams={state.teams}
            messages={state.messages}
            myTeamId={myTeamId}
            viewer={activeViewer}
            onSend={createChatMessage}
          />
        )}
      </div>
    );
  }

  if (view === "help") {
    return (
      <div className="space-y-5">
        {/* 質問を出すのは参加者だけ。メンターは他チームの質問にも答える。 */}
        {!isAdmin && !isJudge && (
          <HelpComposer
            teams={isMentor ? state.teams : myTeam ? [myTeam] : []}
            lockedTeamId={isMentor ? null : myTeamId}
            onSubmit={createHelp}
          />
        )}
        {!isJudge && <DirectMessages viewer={activeViewer} />}
        {/* 審査員には学生同士の質問と解決の様子を、閲覧専用で見せる。 */}
        <HelpBoard
          posts={state.helpPosts}
          onReply={createHelpReply}
          onAccept={acceptHelpReply}
          readOnly={isJudge}
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
        <RealtimeStatusBadge status={realtimeStatus} isRefreshing={isRefreshing} />
        {demoEnabled && (isAdmin || !viewer && !sessionViewer) && (
          <DemoControls teams={state.teams} onTrigger={triggerDemoEvent} />
        )}
      </header>

      {/* 参加者には自チームのみ、支援・評価する役割には全チームを上部に出す。 */}
      {(canViewAllTechStacks || myTeam) && (
        <TechStackPanel
          teams={techStackTeams}
          scope={canViewAllTechStacks ? "all" : "own"}
        />
      )}

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

      {!isStaff && !isJudge && myTeam && (
        <WakaTimePanel viewerLogin={activeViewer?.login ?? null} />
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

      {/* 合計だけだと、一人が全部やったチームと分担したチームが同じに見える。 */}
      <ContributorPanel
        contributors={state.contributors}
        teams={state.teams}
        teamId={isStaff || isJudge ? null : myTeamId}
        title={isStaff || isJudge ? "メンバー別の動き（全チーム）" : "チーム内の動き"}
        description={
          isStaff || isJudge
            ? "GitHubの操作をアカウントごとに集計しています。誰が動いているかの確認に使えます。"
            : "チームの中で誰がどれだけ動いたかです。GitHubの記録がもとになっています。"
        }
      />
    </div>
  );
}
