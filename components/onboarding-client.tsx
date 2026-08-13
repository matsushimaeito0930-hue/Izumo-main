"use client";

import { FormEvent, useEffect, useState } from "react";
import Image from "next/image";
import Link from "next/link";
import { useRouter, useSearchParams } from "next/navigation";
import { HackRadarLogo } from "@/components/hackradar-logo";
import { RolePicker, type OnboardingRole } from "@/components/role-picker";
import { ScoreConfigEditor } from "@/components/score-config-editor";
import { ShareLinkButton } from "@/components/share-link-button";
import { WebhookNotice, type WebhookResult } from "@/components/webhook-notice";
import {
  ChevronDown,
  ChevronLeft,
  LoaderCircle,
  DoorOpen,
  Github,
  LayoutDashboard,
  LogOut,
  Plus,
  Pencil,
  Save,
  Trash2,
  X,
  TriangleAlert
} from "lucide-react";
import type {
  AppSession,
  HackEvent,
  Team,
  TeamInviteView,
  TeamMemberView,
  UserRole
} from "@/lib/types";

type Viewer = {
  login: string;
  displayName: string;
  avatarUrl: string | null;
  role: UserRole;
};

const roleLabels: Record<UserRole, string> = {
  participant: "参加者",
  mentor: "メンター",
  admin: "運営",
  judge: "審査員"
};

const authErrorMessages: Record<string, string> = {
  not_configured: "GitHubログインが未設定です。環境変数を確認してください。",
  denied: "GitHubの認可がキャンセルされました。",
  state_mismatch: "認証の検証に失敗しました。もう一度お試しください。",
  exchange_failed: "GitHubとの通信に失敗しました。もう一度お試しください。"
};

function saveSession(session: AppSession) {
  window.localStorage.setItem("hackverse-session", JSON.stringify(session));
}

const inputClass =
  "h-11 w-full rounded-xl border border-line bg-paper px-3 text-sm text-ink shadow-inset outline-none transition-colors placeholder:text-muted/70 hover:border-lineStrong focus:border-pulse";

const primaryButtonClass =
  "flex h-12 w-full items-center justify-center gap-2 rounded-xl bg-ink px-4 text-sm font-bold text-white shadow-btn transition-[box-shadow,background-color,transform] hover:bg-ink2 active:translate-y-px active:shadow-pressed disabled:cursor-not-allowed disabled:opacity-40 disabled:shadow-none";

function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <label className="block">
      <span className="mb-1.5 block text-xs font-medium text-ink2">{label}</span>
      {children}
    </label>
  );
}

/** 運営向けの操作は普段畳んでおく。 */
function Collapsible({
  title,
  children
}: {
  title: string;
  children: React.ReactNode;
}) {
  const [isOpen, setIsOpen] = useState(false);

  return (
    <div className="rounded-2xl border border-line/70 bg-surface shadow-soft">
      <button
        type="button"
        onClick={() => setIsOpen((current) => !current)}
        aria-expanded={isOpen}
        className="flex w-full items-center justify-between gap-3 px-4 py-3 text-sm font-medium text-ink2 transition-colors hover:text-ink"
      >
        {title}
        <ChevronDown
          className={`size-4 transition-transform ${isOpen ? "rotate-180" : ""}`}
        />
      </button>
      {isOpen && <div className="border-t border-line p-4">{children}</div>}
    </div>
  );
}

export type RepoOption = {
  fullName: string;
  private: boolean;
  owner: string;
  isOwn: boolean;
};

/**
 * リポジトリの選択肢。自分のものと、Organization・共同編集者として見えているものを
 * 分けて表示する。見覚えのない名前が並ぶ理由が一目で分かるようにするため。
 */
export function RepoOptions({ repos }: { repos: RepoOption[] }) {
  const own = repos.filter((repo) => repo.isOwn);
  const shared = repos.filter((repo) => !repo.isOwn);

  const label = (repo: RepoOption) =>
    `${repo.fullName}${repo.private ? "（プライベート）" : ""}`;

  return (
    <>
      {own.length > 0 && (
        <optgroup label="自分のリポジトリ">
          {own.map((repo) => (
            <option key={repo.fullName} value={repo.fullName}>
              {label(repo)}
            </option>
          ))}
        </optgroup>
      )}

      {shared.length > 0 && (
        <optgroup label="参加しているリポジトリ（Organization・共同編集者）">
          {shared.map((repo) => (
            <option key={repo.fullName} value={repo.fullName}>
              {label(repo)}
            </option>
          ))}
        </optgroup>
      )}
    </>
  );
}

export function OnboardingClient({
  initialInvites,
  initialEvent,
  initialTeams,
  initialMembers = [],
  authConfigured,
  viewer
}: {
  initialInvites: TeamInviteView[];
  initialEvent: HackEvent | null;
  initialTeams: Team[];
  /** 運営がメンバーの所属を直せるように、誰がどのチームにいるかを渡す。 */
  initialMembers?: TeamMemberView[];
  authConfigured: boolean;
  viewer: Viewer | null;
}) {
  const router = useRouter();
  const searchParams = useSearchParams();
  const [invites, setInvites] = useState(initialInvites);
  const [teams, setTeams] = useState(initialTeams);
  const [members, setMembers] = useState(initialMembers);
  const [hackEvent, setHackEvent] = useState(initialEvent);
  const [eventName, setEventName] = useState(initialEvent?.name ?? "");
  // joinCode はイベントの招待コード、roomCode はチームの部屋番号。
  // 複数のハッカソンを動かしたときに部屋番号が衝突しないよう、参加時は両方もらう。
  const [joinCode, setJoinCode] = useState("");
  const [roomCode, setRoomCode] = useState("");
  const [newTeamName, setNewTeamName] = useState("");
  // イベント削除は取り返しがつかないので、開くのと打ち直すのを2段階に分ける。
  const [showDeleteEvent, setShowDeleteEvent] = useState(false);
  const [deleteConfirmName, setDeleteConfirmName] = useState("");
  const [editingTeamId, setEditingTeamId] = useState<string | null>(null);
  const [editingTeamName, setEditingTeamName] = useState("");
  const [editingGithubRepo, setEditingGithubRepo] = useState("");
  const [githubRepo, setGithubRepo] = useState("");
  const [repos, setRepos] = useState<RepoOption[]>([]);
  const [canListPrivate, setCanListPrivate] = useState(false);
  const [reposState, setReposState] = useState<"idle" | "loading" | "ready" | "error">(
    "idle"
  );
  const [manualRepo, setManualRepo] = useState(false);
  const [displayName, setDisplayName] = useState("");
  const [specialty, setSpecialty] = useState("");
  // 最初は役割未選択。選ぶまでその役割の入口を出さない。
  // GitHubの認可から戻ったときに選び直しにならないよう、URLの ?role= からも復元する。
  const [pickedRole, setPickedRole] = useState<OnboardingRole | null>(null);
  const [message, setMessage] = useState("");
  const [isBusy, setIsBusy] = useState(false);
  const [webhook, setWebhook] = useState<WebhookResult | null>(null);

  // GitHubログイン未設定のローカル環境だけ、手入力での参加を許す。
  const manualEntry = !authConfigured;
  // 運営セクションは運営ロールのときだけ出す。参加者の視界に入れない。
  const isStaff = viewer?.role === "admin";
  const canManage = manualEntry || isStaff;
  // メンターと審査員はGitHubログイン不要。参加者と運営だけログインを求める。
  const needsLogin =
    authConfigured && !viewer && pickedRole !== "mentor" && pickedRole !== "judge";

  useEffect(() => {
    // 招待URL（/?code=イベント&room=部屋番号）で来た人は、入力欄を自動で埋める。
    const sharedCode = searchParams.get("code");
    if (sharedCode) setJoinCode(sharedCode.trim().toUpperCase());

    const sharedRoom = searchParams.get("room");
    if (sharedRoom) setRoomCode(sharedRoom.trim().toUpperCase());

    // 認可の往復で役割が消えないよう、URLに残しておいたものを戻す。
    const sharedRole = searchParams.get("role");
    if (sharedRole === "participant" || sharedRole === "mentor" || sharedRole === "admin") {
      setPickedRole(sharedRole);
    }

    const authError = searchParams.get("auth_error");
    if (authError) {
      setMessage(authErrorMessages[authError] ?? "ログインに失敗しました。");
    }
  }, [initialInvites, searchParams]);

  // 運営としてログインしている場合だけ、選択用にリポジトリ一覧を取りに行く。
  useEffect(() => {
    if (!viewer) return;

    let cancelled = false;
    setReposState("loading");

    fetch("/api/github/repos")
      .then(async (response) => {
        const payload = (await response.json().catch(() => ({}))) as {
          repos?: RepoOption[];
          canListPrivate?: boolean;
          error?: string;
        };
        if (cancelled) return;

        if (!response.ok || !payload.repos) {
          setReposState("error");
          setManualRepo(true);
          return;
        }

        setCanListPrivate(Boolean(payload.canListPrivate));
        setRepos(payload.repos);
        setReposState("ready");
        if (payload.repos.length === 0) setManualRepo(true);
      })
      .catch(() => {
        if (cancelled) return;
        setReposState("error");
        setManualRepo(true);
      });

    return () => {
      cancelled = true;
    };
  }, [viewer]);

  async function issueTeamInvite(teamId: string) {
    setIsBusy(true);
    setMessage("");

    try {
      const response = await fetch("/api/admin/invites", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ teamId })
      });
      const payload = (await response.json()) as {
        invite: TeamInviteView;
        error?: string;
      };

      if (!response.ok) throw new Error(payload.error ?? "招待コードを作成できませんでした。");

      setInvites((current) => [payload.invite, ...current]);
      setMessage(`「${payload.invite.team_name}」の部屋番号 ${payload.invite.code} を発行しました。`);
    } catch (error) {
      setMessage(error instanceof Error ? error.message : "作成に失敗しました。");
    } finally {
      setIsBusy(false);
    }
  }

  async function saveEventName(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setIsBusy(true);
    setMessage("");

    try {
      const response = await fetch("/api/admin/event", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ name: eventName })
      });
      const payload = (await response.json()) as { event?: HackEvent; error?: string };

      if (!response.ok || !payload.event) {
        throw new Error(payload.error ?? "イベントを保存できませんでした。");
      }

      setHackEvent(payload.event);
      setMessage(`参加コード ${payload.event.join_code} を発行しました。`);
    } catch (error) {
      setMessage(error instanceof Error ? error.message : "保存に失敗しました。");
    } finally {
      setIsBusy(false);
    }
  }

  async function addTeam(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setIsBusy(true);
    setMessage("");

    try {
      const response = await fetch("/api/admin/event", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ teamName: newTeamName })
      });
      const payload = (await response.json()) as {
        team?: Team;
        invite?: TeamInviteView;
        error?: string;
      };

      if (!response.ok || !payload.team) {
        throw new Error(payload.error ?? "チームを登録できませんでした。");
      }

      setTeams((current) => [...current, payload.team as Team]);
      if (payload.invite) {
        setInvites((current) => [payload.invite as TeamInviteView, ...current]);
        setMessage(
          `チーム「${payload.team.name}」を登録しました。部屋番号は ${payload.invite.code} です。`
        );
      } else {
        setMessage(`チーム「${payload.team.name}」を登録しました。`);
      }
      setNewTeamName("");
    } catch (error) {
      setMessage(error instanceof Error ? error.message : "登録に失敗しました。");
    } finally {
      setIsBusy(false);
    }
  }

  function startEditingTeam(team: Team) {
    setEditingTeamId(team.id);
    setEditingTeamName(team.name);
    setEditingGithubRepo(team.github_repo ?? "");
  }

  function cancelEditingTeam() {
    setEditingTeamId(null);
    setEditingTeamName("");
    setEditingGithubRepo("");
  }

  async function updateRegisteredTeam(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!editingTeamId) return;

    setIsBusy(true);
    setMessage("");

    try {
      const response = await fetch(`/api/admin/teams/${editingTeamId}`, {
        method: "PATCH",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          name: editingTeamName,
          githubRepo: editingGithubRepo.trim() || null
        })
      });
      const payload = (await response.json()) as { team?: Team; error?: string };

      if (!response.ok || !payload.team) {
        throw new Error(payload.error ?? "チームを更新できませんでした。");
      }

      const updatedTeam = payload.team;
      setTeams((current) =>
        current.map((team) => (team.id === updatedTeam.id ? updatedTeam : team))
      );
      setInvites((current) =>
        current.map((invite) =>
          invite.team_id === updatedTeam.id
            ? { ...invite, team_name: updatedTeam.name, github_repo: updatedTeam.github_repo }
            : invite
        )
      );
      setMessage(`チーム「${updatedTeam.name}」を更新しました。`);
      cancelEditingTeam();
    } catch (error) {
      setMessage(error instanceof Error ? error.message : "チームを更新できませんでした。");
    } finally {
      setIsBusy(false);
    }
  }

  /**
   * 部屋番号を間違えて入った人を直す。
   * toTeamId を渡せば移動、渡さなければそのチームから外すだけ。
   */
  async function fixMembership(
    fromTeamId: string,
    githubUsername: string,
    toTeamId?: string
  ) {
    setIsBusy(true);
    setMessage("");

    try {
      const response = await fetch(`/api/admin/teams/${fromTeamId}`, {
        method: "PATCH",
        headers: { "content-type": "application/json" },
        body: JSON.stringify(
          toTeamId
            ? { moveMember: { githubUsername, toTeamId } }
            : { removeMember: githubUsername }
        )
      });
      const payload = (await response.json().catch(() => ({}))) as { error?: string };

      if (!response.ok) {
        throw new Error(payload.error ?? "メンバーを変更できませんでした。");
      }

      setMembers((current) =>
        toTeamId
          ? current.map((member) =>
              member.team_id === fromTeamId &&
              member.github_username === githubUsername
                ? { ...member, team_id: toTeamId }
                : member
            )
          : current.filter(
              (member) =>
                !(
                  member.team_id === fromTeamId &&
                  member.github_username === githubUsername
                )
            )
      );

      setMessage(
        toTeamId
          ? `@${githubUsername} を「${
              teams.find((team) => team.id === toTeamId)?.name ?? "別のチーム"
            }」に移しました。`
          : `@${githubUsername} をチームから外しました。`
      );
    } catch (error) {
      setMessage(error instanceof Error ? error.message : "メンバーを変更できませんでした。");
    } finally {
      setIsBusy(false);
    }
  }

  /**
   * イベントを丸ごと消す。
   * 取り返しがつかないので、イベント名を打ち直してもらってから実行する。
   */
  async function removeEvent() {
    if (!hackEvent) return;

    setIsBusy(true);
    setMessage("");

    try {
      const response = await fetch("/api/admin/event", {
        method: "DELETE",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ confirmName: deleteConfirmName })
      });
      const payload = (await response.json().catch(() => ({}))) as {
        deletedName?: string;
        error?: string;
      };

      if (!response.ok) {
        throw new Error(payload.error ?? "削除できませんでした。");
      }

      setHackEvent(null);
      setEventName("");
      setTeams([]);
      setInvites([]);
      setMembers([]);
      setDeleteConfirmName("");
      setShowDeleteEvent(false);
      setMessage(
        `イベント「${payload.deletedName ?? ""}」を削除しました。新しいイベント名を登録すると、また最初から始められます。`
      );
    } catch (error) {
      setMessage(error instanceof Error ? error.message : "削除できませんでした。");
    } finally {
      setIsBusy(false);
    }
  }

  /** 誤って作ったチームを消す。スコアが動いているときは確認を挟む。 */
  async function removeTeam(team: Team) {
    const warning =
      team.score > 0
        ? `「${team.name}」には ${team.score} ポイントの記録があります。チームと一緒に活動履歴も消えます。削除しますか？`
        : `「${team.name}」を削除しますか？`;
    if (!window.confirm(warning)) return;

    setIsBusy(true);
    setMessage("");

    try {
      const response = await fetch(`/api/admin/teams/${team.id}`, {
        method: "DELETE"
      });
      const payload = (await response.json().catch(() => ({}))) as { error?: string };

      if (!response.ok) {
        throw new Error(payload.error ?? "チームを削除できませんでした。");
      }

      setTeams((current) => current.filter((candidate) => candidate.id !== team.id));
      setInvites((current) => current.filter((invite) => invite.team_id !== team.id));
      setMembers((current) => current.filter((member) => member.team_id !== team.id));
      setMessage(`チーム「${team.name}」を削除しました。`);
    } catch (error) {
      setMessage(error instanceof Error ? error.message : "チームを削除できませんでした。");
    } finally {
      setIsBusy(false);
    }
  }

  async function joinTeam(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setIsBusy(true);
    setMessage("");

    try {
      const response = await fetch("/api/teams/join", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          eventCode: joinCode,
          joinCode: roomCode,
          githubRepo: githubRepo || undefined,
          displayName: manualEntry ? displayName : undefined
        })
      });
      const payload = (await response.json()) as {
        session: AppSession;
        repoWarning?: string;
        webhook?: WebhookResult;
        error?: string;
      };

      if (!response.ok) throw new Error(payload.error ?? "チームに参加できませんでした。");

      saveSession(payload.session);

      if (payload.repoWarning) {
        // 参加はできているので、リポジトリだけダッシュボードで設定してもらう。
        setMessage(`${payload.repoWarning} 参加は完了しています。`);
        setIsBusy(false);
        return;
      }

      // Webhookを自動で張れなかったときは、手順を読ませてから進んでもらう。
      if (payload.webhook && payload.webhook.status === "skipped") {
        setWebhook(payload.webhook);
        setIsBusy(false);
        return;
      }

      router.push("/dashboard");
    } catch (error) {
      setMessage(error instanceof Error ? error.message : "参加に失敗しました。");
    } finally {
      setIsBusy(false);
    }
  }

  async function joinMentor(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setIsBusy(true);
    setMessage("");

    try {
      const response = await fetch("/api/mentors/join", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          code: joinCode,
          displayName: displayName || viewer?.displayName,
          specialty
        })
      });
      const payload = (await response.json()) as { session?: AppSession; error?: string };

      if (!response.ok || !payload.session) {
        throw new Error(payload.error ?? "メンター登録に失敗しました。");
      }

      saveSession(payload.session);
      router.push("/dashboard");
    } catch (error) {
      setMessage(error instanceof Error ? error.message : "メンター登録に失敗しました。");
    } finally {
      setIsBusy(false);
    }
  }

  async function joinJudge(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setIsBusy(true);
    setMessage("");

    try {
      const response = await fetch("/api/judges/join", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          code: joinCode,
          displayName: displayName || viewer?.displayName
        })
      });
      const payload = (await response.json()) as { session?: AppSession; error?: string };

      if (!response.ok || !payload.session) {
        throw new Error(payload.error ?? "審査員として入れませんでした。");
      }

      saveSession(payload.session);
      router.push("/dashboard");
    } catch (error) {
      setMessage(error instanceof Error ? error.message : "審査員として入れませんでした。");
    } finally {
      setIsBusy(false);
    }
  }

  async function logout() {
    await fetch("/api/auth/logout", { method: "POST" });
    window.localStorage.removeItem("hackverse-session");
    router.refresh();
  }

  return (
    <main className="min-h-screen bg-paper px-4 py-10 sm:px-6">
      <div className="mx-auto w-full max-w-md space-y-5">
        <div className="text-center">
          <HackRadarLogo className="mx-auto size-14" />
          <h1 className="mt-4 text-2xl font-bold tracking-tight text-ink">HackRadar</h1>
          <p className="mt-1.5 text-sm leading-6 text-muted">
            GitHubにプッシュすると、チームの進み具合が自動で見える場所です。
          </p>
        </div>

        <div className="rounded-2xl border border-line/70 bg-surface p-5 shadow-card">
          {viewer && (
            <div className="mb-4 flex items-center gap-3 rounded-xl border border-line/70 bg-sand/60 p-3 shadow-inset">
              {viewer.avatarUrl ? (
                <Image
                  src={viewer.avatarUrl}
                  alt=""
                  width={36}
                  height={36}
                  className="size-9 rounded-full"
                />
              ) : (
                <span className="grid size-9 place-items-center rounded-full bg-paper2 text-sm text-muted">
                  {viewer.displayName.slice(0, 1)}
                </span>
              )}
              <div className="min-w-0 flex-1">
                <p className="truncate text-sm font-medium text-ink">
                  {viewer.displayName}
                </p>
                <p className="truncate font-mono text-xs text-muted">
                  @{viewer.login}・{roleLabels[viewer.role]}
                </p>
              </div>
              {/* 一度入った人がトップに戻ってきたとき、行き先を失わないようにする。 */}
              <Link
                href="/dashboard"
                aria-label="開発状況を見る"
                title="開発状況を見る"
                className="grid size-8 shrink-0 place-items-center rounded-xl border border-line bg-surface text-muted shadow-soft transition-colors hover:text-ink"
              >
                <LayoutDashboard className="size-3.5" />
              </Link>
              <button
                type="button"
                onClick={logout}
                aria-label="ログアウト"
                className="grid size-8 shrink-0 place-items-center rounded-xl border border-line bg-surface text-muted shadow-soft transition-colors hover:text-ink"
              >
                <LogOut className="size-3.5" />
              </button>
            </div>
          )}

          {pickedRole === null ? (
            <RolePicker onSelect={setPickedRole} />
          ) : (
            <>
              <button
                type="button"
                onClick={() => {
                  setPickedRole(null);
                  setMessage("");
                  setWebhook(null);
                }}
                className="mb-4 flex items-center gap-1 text-xs text-muted transition-colors hover:text-ink"
              >
                <ChevronLeft className="size-3.5" />
                役割を選び直す
              </button>

              {needsLogin ? (
                <>
                  <p className="mb-4 text-sm leading-6 text-ink2">
                    {pickedRole === "admin"
                      ? "運営はGitHubログインが必要です。イベントの作成やリセットができるため、本人確認をしています。"
                      : "参加者はGitHubログインが必要です。リポジトリの選択とWebhookの自動設定に使います。"}
                  </p>
                  <a
                    href={`/api/auth/github?return_to=${encodeURIComponent(`/?role=${pickedRole}`)}`}
                    className={primaryButtonClass}
                  >
                    <Github className="size-5" />
                    GitHubでログイン
                  </a>
                </>
              ) : pickedRole === "admin" ? (
                canManage ? (
                  <div className="space-y-3">
                    {/* 運営はチームに参加しないので、自動では画面が切り替わらない。
                        ここに入口を置かないとダッシュボードへ行く手段が無くなる。 */}
                    <Link href="/dashboard" className={primaryButtonClass}>
                      <LayoutDashboard className="size-5" />
                      開発状況を見る
                    </Link>
                    <p className="rounded-xl border border-line bg-paper px-3 py-4 text-xs leading-5 text-muted shadow-inset">
                      イベント作成・チーム登録・配点の変更は、下の「運営の方：…」から操作してください。
                    </p>
                  </div>
                ) : (
                  <div className="flex items-start gap-2.5 rounded-xl border border-sun/30 bg-sun/10 px-3 py-2.5 text-xs leading-5 text-sun shadow-soft">
                    <TriangleAlert className="mt-0.5 size-3.5 shrink-0" />
                    <span>
                      このGitHubアカウントは運営として登録されていません。
                      運営に <code className="font-mono">ADMIN_GITHUB_LOGINS</code> へ
                      @{viewer?.login} を追加してもらってください。
                    </span>
                  </div>
                )
              ) : pickedRole === "judge" ? (
                <form onSubmit={joinJudge} className="space-y-4">
                  <p className="text-xs leading-5 text-muted">
                    審査員はGitHubログイン不要です。見られるのは開発状況とお知らせだけで、
                    投稿はできません。
                  </p>

                  <Field label="招待コード">
                    <input
                      value={joinCode}
                      onChange={(event) => setJoinCode(event.target.value.toUpperCase())}
                      className={inputClass}
                      placeholder="ABCD-2345"
                      required
                    />
                    <p className="mt-1.5 text-xs leading-5 text-muted">
                      運営から配られたコードを入力してください。
                    </p>
                  </Field>

                  <Field label="名前">
                    <input
                      value={displayName}
                      onChange={(event) => setDisplayName(event.target.value)}
                      className={inputClass}
                      placeholder={viewer?.displayName ?? "表示名"}
                      required
                    />
                  </Field>

                  <button type="submit" disabled={isBusy} className={primaryButtonClass}>
                    <DoorOpen className="size-4" />
                    開発状況を見る
                  </button>
                </form>
              ) : pickedRole === "mentor" ? (
                <form onSubmit={joinMentor} className="space-y-4">
                  <p className="text-xs leading-5 text-muted">
                    メンターはGitHubログイン不要です。運営から配られたコードで入れます。
                  </p>

                  <Field label="招待コード">
                    <input
                      value={joinCode}
                      onChange={(event) => setJoinCode(event.target.value.toUpperCase())}
                      className={inputClass}
                      placeholder="ABCD-2345"
                      required
                    />
                    <p className="mt-1.5 text-xs leading-5 text-muted">
                      運営から配られたメンター用の全体コードを入力してください。
                    </p>
                  </Field>

                  <Field label="名前">
                    <input
                      value={displayName}
                      onChange={(event) => setDisplayName(event.target.value)}
                      className={inputClass}
                      placeholder={viewer?.displayName ?? "表示名"}
                      required
                    />
                  </Field>

                  <Field label="得意なこと">
                    <input
                      value={specialty}
                      onChange={(event) => setSpecialty(event.target.value)}
                      className={inputClass}
                      placeholder="例）Next.js / UI設計 / Firebase"
                      required
                    />
                  </Field>

                  <button type="submit" disabled={isBusy} className={primaryButtonClass}>
                    <DoorOpen className="size-4" />
                    ダッシュボードに参加する
                  </button>
                </form>
              ) : (
                <form onSubmit={joinTeam} className="space-y-4">
                  {manualEntry && (
                    <div className="flex items-start gap-2.5 rounded-xl border border-sun/30 bg-sun/10 px-3 py-2.5 text-xs leading-5 text-sun shadow-soft">
                      <TriangleAlert className="mt-0.5 size-3.5 shrink-0" />
                      <span>
                        GitHubログインは未設定です。いまは名前を入れて参加できます。
                      </span>
                    </div>
                  )}

                  <Field label="招待コード（イベント）">
                    <input
                      value={joinCode}
                      onChange={(event) => setJoinCode(event.target.value.toUpperCase())}
                      className={inputClass}
                      placeholder="ABCD-2345"
                      required
                    />
                    <p className="mt-1.5 text-xs leading-5 text-muted">
                      どのハッカソンに参加するかを決めるコードです。参加者全員で同じものを使います。
                    </p>
                  </Field>

                  <Field label="部屋番号（チーム）">
                    <input
                      value={roomCode}
                      onChange={(event) => setRoomCode(event.target.value.toUpperCase())}
                      className={inputClass}
                      placeholder="WXYZ-6789"
                      required
                    />
                    <p className="mt-1.5 text-xs leading-5 text-muted">
                      自分のチーム専用のコードです。チームごとに違うものが配られます。
                    </p>
                  </Field>

                  {manualEntry && !viewer && (
                    <Field label="表示名">
                      <input
                        value={displayName}
                        onChange={(event) => setDisplayName(event.target.value)}
                        className={inputClass}
                        placeholder="表示名"
                        required
                      />
                    </Field>
                  )}

                  <Field label="チームのGitHubリポジトリ（あとからでも可）">
                    {reposState === "loading" ? (
                      <p className="flex h-11 items-center gap-2 rounded-xl border border-line bg-paper px-3 text-sm text-muted shadow-inset">
                        <LoaderCircle className="size-4 animate-spin" />
                        リポジトリを読み込んでいます...
                      </p>
                    ) : manualRepo ? (
                      <input
                        value={githubRepo}
                        onChange={(event) => setGithubRepo(event.target.value)}
                        className={inputClass}
                        placeholder="owner/repository"
                      />
                    ) : (
                      <select
                        value={githubRepo}
                        onChange={(event) => setGithubRepo(event.target.value)}
                        className={inputClass}
                      >
                        <option value="">あとで設定する</option>
                        <RepoOptions repos={repos} />
                      </select>
                    )}

                    {reposState === "ready" && (
                      <div className="mt-1.5 flex flex-wrap items-center gap-x-3 gap-y-1">
                        <button
                          type="button"
                          onClick={() => {
                            setManualRepo((current) => !current);
                            setGithubRepo("");
                          }}
                          className="text-xs text-muted underline underline-offset-2 transition-colors hover:text-ink"
                        >
                          {manualRepo ? "一覧から選ぶ" : "一覧に無い（手入力する）"}
                        </button>

                        {!canListPrivate && (
                          <a
                            href="/api/auth/github?private=1&return_to=%2F%3Frole%3Dparticipant"
                            className="text-xs text-pulse underline underline-offset-2"
                          >
                            プライベートも表示する
                          </a>
                        )}
                      </div>
                    )}

                    {reposState === "ready" && !canListPrivate && (
                      <p className="mt-1.5 text-xs leading-5 text-muted">
                        いまはパブリックリポジトリだけが表示されています。
                      </p>
                    )}

                    {reposState === "error" && (
                      <p className="mt-1.5 text-xs leading-5 text-muted">
                        リポジトリ一覧を取得できませんでした。手入力するか、あとから設定できます。
                      </p>
                    )}
                  </Field>

                  <button type="submit" disabled={isBusy} className={primaryButtonClass}>
                    <DoorOpen className="size-4" />
                    チームに参加する
                  </button>
                </form>
              )}
            </>
          )}

          {webhook && (
            <div className="mt-4 space-y-3">
              <WebhookNotice result={webhook} githubRepo={githubRepo} />
              <button
                type="button"
                onClick={() => router.push("/dashboard")}
                className="flex h-11 w-full items-center justify-center rounded-xl bg-ink px-4 text-sm font-bold text-white shadow-btn transition-[box-shadow,background-color,transform] hover:bg-ink2 active:translate-y-px active:shadow-pressed"
              >
                ダッシュボードへ進む
              </button>
            </div>
          )}

          {message && (
            <p
              role="status"
              className="mt-4 rounded-xl border border-sun/30 bg-sun/10 px-3 py-2.5 text-xs leading-5 text-sun shadow-soft"
            >
              {message}
            </p>
          )}
        </div>

        {canManage && pickedRole === "admin" && (
          <Collapsible title="運営の方：イベントとチームを登録する">
            <form onSubmit={saveEventName} className="space-y-4">
              <Field label="イベント名">
                <input
                  value={eventName}
                  onChange={(event) => setEventName(event.target.value)}
                  className={inputClass}
                  placeholder="例）出雲ハッカソン 2026"
                  required
                />
              </Field>
              <button type="submit" disabled={isBusy} className={primaryButtonClass}>
                <Plus className="size-4" />
                {hackEvent ? "イベント名を更新する" : "イベントを作る"}
              </button>
            </form>

            {hackEvent && (
              <div className="mt-4 rounded-xl border border-line/70 bg-sand/60 p-4 shadow-inset">
                <p className="text-xs font-medium text-ink2">招待コード（イベント共通）</p>
                <p className="mt-1 font-mono text-2xl font-bold tracking-widest text-pulse">
                  {hackEvent.join_code}
                </p>
                <p className="mt-1.5 text-xs leading-5 text-muted">
                  どのハッカソンかを表すコードです。参加者にはこれと、下のチームごとの
                  部屋番号の<strong className="font-bold">2つ</strong>を渡します。
                  各チームの「招待URL」を使えば両方が自動で入るので、そちらが確実です。
                  メンター登録にはこのコードだけを使います。
                </p>
                <div className="mt-3">
                  <ShareLinkButton
                    url={`/?code=${encodeURIComponent(hackEvent.join_code)}`}
                    label="メンター用の招待URLを送る"
                    title="HackRadar にメンターとして参加"
                    text="このリンクからメンター登録できます。"
                    onDone={setMessage}
                  />
                </div>
              </div>
            )}

            <form onSubmit={addTeam} className="mt-5 space-y-4 border-t border-line pt-5">
              <Field label="チーム名を追加">
                <input
                  value={newTeamName}
                  onChange={(event) => setNewTeamName(event.target.value)}
                  className={inputClass}
                  placeholder="例）Team Aurora"
                  required
                />
                <p className="mt-1.5 text-xs leading-5 text-muted">
                  リポジトリは参加者が自分で選ぶので、ここでは入力しません。
                </p>
              </Field>
              <button type="submit" disabled={isBusy} className={primaryButtonClass}>
                <Plus className="size-4" />
                チームを登録する
              </button>
            </form>

            {teams.length > 0 && (
              <ul className="mt-4 space-y-2 border-t border-line pt-4">
                {teams.map((team) => {
                  const invite = invites.find((candidate) => candidate.team_id === team.id);
                  const teamMembers = members.filter(
                    (member) => member.team_id === team.id
                  );

                  return (
                  <li key={team.id} className="rounded-xl border border-line/70 bg-paper p-3">
                    {editingTeamId === team.id ? (
                      <form onSubmit={updateRegisteredTeam} className="space-y-2.5">
                        <input
                          value={editingTeamName}
                          onChange={(event) => setEditingTeamName(event.target.value)}
                          className={inputClass}
                          aria-label={`${team.name}のチーム名`}
                          placeholder="チーム名"
                          required
                        />
                        <input
                          value={editingGithubRepo}
                          onChange={(event) => setEditingGithubRepo(event.target.value)}
                          className={inputClass}
                          aria-label={`${team.name}のGitHubリポジトリ`}
                          placeholder="owner/repository（任意）"
                        />
                        <div className="flex justify-end gap-2">
                          <button
                            type="button"
                            onClick={cancelEditingTeam}
                            className="grid size-9 place-items-center rounded-xl border border-line bg-surface text-muted shadow-soft transition-colors hover:text-ink"
                            aria-label="編集をキャンセル"
                            title="キャンセル"
                          >
                            <X className="size-4" />
                          </button>
                          <button
                            type="submit"
                            disabled={isBusy}
                            className="grid size-9 place-items-center rounded-xl bg-ink text-white shadow-btn transition-colors hover:bg-ink2 disabled:opacity-40"
                            aria-label="チームを保存"
                            title="保存"
                          >
                            <Save className="size-4" />
                          </button>
                        </div>
                      </form>
                    ) : (
                      <div className="flex items-center gap-3">
                        <div className="min-w-0 flex-1">
                          <p className="truncate text-xs font-medium text-ink2">{team.name}</p>
                          <p className="mt-1 truncate font-mono text-[11px] text-muted">
                            {team.github_repo ?? "リポジトリ未設定"}
                          </p>
                          <div className="mt-2 flex items-center gap-2">
                            <span className="text-[11px] text-muted">部屋番号</span>
                            {invite ? (
                              <>
                                <code className="font-mono text-xs font-bold tracking-wide text-pulse">
                                  {invite.code}
                                </code>
                                {hackEvent && (
                                  <ShareLinkButton
                                    variant="quiet"
                                    label="招待URLを送る"
                                    title={`HackRadar「${team.name}」への招待`}
                                    text="このリンクを開くとチームに参加できます。"
                                    url={`/?code=${encodeURIComponent(
                                      hackEvent.join_code
                                    )}&room=${encodeURIComponent(invite.code)}`}
                                    onDone={setMessage}
                                  />
                                )}
                              </>
                            ) : (
                              <button
                                type="button"
                                onClick={() => void issueTeamInvite(team.id)}
                                disabled={isBusy}
                                className="text-[11px] font-medium text-pulse underline underline-offset-2 disabled:opacity-40"
                              >
                                発行する
                              </button>
                            )}
                          </div>
                        </div>
                        <button
                          type="button"
                          onClick={() => startEditingTeam(team)}
                          className="grid size-9 shrink-0 place-items-center rounded-xl border border-line bg-surface text-muted shadow-soft transition-colors hover:text-ink"
                          aria-label={`${team.name}を編集`}
                          title="チームを編集"
                        >
                          <Pencil className="size-4" />
                        </button>
                        <button
                          type="button"
                          onClick={() => void removeTeam(team)}
                          disabled={isBusy}
                          className="grid size-9 shrink-0 place-items-center rounded-xl border border-line bg-surface text-muted shadow-soft transition-colors hover:border-hot/40 hover:text-hot disabled:opacity-40"
                          aria-label={`${team.name}を削除`}
                          title="チームを削除"
                        >
                          <Trash2 className="size-4" />
                        </button>
                      </div>
                    )}

                    {/* 部屋番号を間違えて入る事故は必ず起きるので、その場で直せるようにする。 */}
                    {editingTeamId !== team.id && teamMembers.length > 0 && (
                      <ul className="mt-2.5 space-y-1.5 border-t border-line/70 pt-2.5">
                        {teamMembers.map((member) => (
                          <li
                            key={member.github_username}
                            className="flex items-center gap-2"
                          >
                            <span className="min-w-0 flex-1 truncate font-mono text-[11px] text-ink2">
                              @{member.github_username}
                            </span>
                            <label className="shrink-0">
                              <span className="sr-only">
                                @{member.github_username} の移動先
                              </span>
                              <select
                                value=""
                                disabled={isBusy || teams.length < 2}
                                onChange={(event) => {
                                  const toTeamId = event.target.value;
                                  if (!toTeamId) return;
                                  void fixMembership(
                                    team.id,
                                    member.github_username,
                                    toTeamId
                                  );
                                }}
                                className="h-8 max-w-32 rounded-lg border border-line bg-paper px-1.5 text-[11px] text-ink2 shadow-inset outline-none focus:border-pulse disabled:opacity-40"
                              >
                                <option value="">移動先…</option>
                                {teams
                                  .filter((candidate) => candidate.id !== team.id)
                                  .map((candidate) => (
                                    <option key={candidate.id} value={candidate.id}>
                                      {candidate.name}
                                    </option>
                                  ))}
                              </select>
                            </label>
                            <button
                              type="button"
                              onClick={() =>
                                void fixMembership(team.id, member.github_username)
                              }
                              disabled={isBusy}
                              className="shrink-0 text-[11px] font-medium text-muted underline underline-offset-2 transition-colors hover:text-hot disabled:opacity-40"
                            >
                              外す
                            </button>
                          </li>
                        ))}
                      </ul>
                    )}
                  </li>
                  );
                })}
              </ul>
            )}

            {/* 片付け用。開催中に押される事故を避けるため、いちばん下に置いて2段階にする。 */}
            {hackEvent && (
              <div className="mt-5 border-t border-line pt-5">
                {showDeleteEvent ? (
                  <div className="rounded-xl border border-hot/30 bg-hot/5 p-3.5">
                    <p className="text-xs font-bold text-hot">
                      イベントを削除します
                    </p>
                    <p className="mt-1.5 text-xs leading-5 text-ink2">
                      チーム{teams.length > 0 ? `（${teams.length}件）` : ""}、参加者の所属、
                      部屋番号、スコアと活動履歴、質問、お知らせが
                      <strong className="font-bold text-hot">すべて消えます</strong>。
                      招待コードも使えなくなります。元に戻せません。
                    </p>
                    <p className="mt-2.5 text-xs leading-5 text-ink2">
                      確認のため、イベント名{" "}
                      <code className="font-mono font-bold text-ink">{hackEvent.name}</code>{" "}
                      を入力してください。
                    </p>
                    <input
                      value={deleteConfirmName}
                      onChange={(event) => setDeleteConfirmName(event.target.value)}
                      className={`${inputClass} mt-2`}
                      placeholder={hackEvent.name}
                      aria-label="確認のためのイベント名"
                    />
                    <div className="mt-3 flex gap-2">
                      <button
                        type="button"
                        onClick={() => {
                          setShowDeleteEvent(false);
                          setDeleteConfirmName("");
                        }}
                        className="h-11 flex-1 rounded-xl border border-line bg-surface text-sm font-medium text-ink2 shadow-soft transition-colors hover:text-ink"
                      >
                        やめる
                      </button>
                      <button
                        type="button"
                        onClick={() => void removeEvent()}
                        disabled={isBusy || deleteConfirmName.trim() !== hackEvent.name}
                        className="flex h-11 flex-1 items-center justify-center gap-2 rounded-xl bg-hot text-sm font-bold text-white shadow-btn transition-[box-shadow,background-color,transform] active:translate-y-px active:shadow-pressed disabled:cursor-not-allowed disabled:opacity-40 disabled:shadow-none"
                      >
                        <Trash2 className="size-4" />
                        削除する
                      </button>
                    </div>
                  </div>
                ) : (
                  <button
                    type="button"
                    onClick={() => setShowDeleteEvent(true)}
                    className="flex items-center gap-1.5 text-xs font-medium text-muted underline underline-offset-2 transition-colors hover:text-hot"
                  >
                    <Trash2 className="size-3.5" />
                    このイベントを削除する
                  </button>
                )}
              </div>
            )}
          </Collapsible>
        )}

        {canManage && pickedRole === "admin" && (
          <Collapsible title="運営の方：アクションの配点を決める">
            <ScoreConfigEditor onMessage={setMessage} />
          </Collapsible>
        )}

      </div>
    </main>
  );
}
