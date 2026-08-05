"use client";

import { FormEvent, useEffect, useState } from "react";
import Image from "next/image";
import { useRouter, useSearchParams } from "next/navigation";
import { HackRadarLogo } from "@/components/hackradar-logo";
import {
  ChevronDown,
  Clipboard,
  LoaderCircle,
  DoorOpen,
  Github,
  GraduationCap,
  LogOut,
  Plus,
  TriangleAlert
} from "lucide-react";
import type {
  AppSession,
  HackEvent,
  Team,
  TeamInviteView,
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
  admin: "運営"
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

/** 運営・メンター向けの操作は普段畳んでおく。参加者の視界に入れない。 */
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

export function OnboardingClient({
  initialInvites,
  initialEvent,
  initialTeams,
  authConfigured,
  viewer
}: {
  initialInvites: TeamInviteView[];
  initialEvent: HackEvent | null;
  initialTeams: Team[];
  authConfigured: boolean;
  viewer: Viewer | null;
}) {
  const router = useRouter();
  const searchParams = useSearchParams();
  const [invites, setInvites] = useState(initialInvites);
  const [teams, setTeams] = useState(initialTeams);
  const [hackEvent, setHackEvent] = useState(initialEvent);
  const [eventName, setEventName] = useState(initialEvent?.name ?? "");
  const [joinCode, setJoinCode] = useState("");
  const [teamName, setTeamName] = useState(initialTeams[0]?.name ?? "");
  const [newTeamName, setNewTeamName] = useState("");
  const [githubRepo, setGithubRepo] = useState("");
  const [repos, setRepos] = useState<{ fullName: string; private: boolean }[]>([]);
  const [canListPrivate, setCanListPrivate] = useState(false);
  const [reposState, setReposState] = useState<"idle" | "loading" | "ready" | "error">(
    "idle"
  );
  const [manualRepo, setManualRepo] = useState(false);
  const [displayName, setDisplayName] = useState("");
  const [specialty, setSpecialty] = useState("");
  const [message, setMessage] = useState("");
  const [isBusy, setIsBusy] = useState(false);

  // GitHubログイン未設定のローカル環境だけ、手入力での参加を許す。
  const manualEntry = !authConfigured;
  const canJoin = manualEntry || Boolean(viewer);
  const isStaff = viewer?.role === "mentor" || viewer?.role === "admin";

  useEffect(() => {
    const inviteCode = searchParams.get("invite");
    if (inviteCode) {
      const invite = initialInvites.find(
        (candidate) => candidate.code === inviteCode.toUpperCase()
      );
      if (invite) setTeamName(invite.team_name);
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
          repos?: { fullName: string; private: boolean }[];
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

  async function createInvite(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setIsBusy(true);
    setMessage("");

    try {
      const response = await fetch("/api/admin/invites", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ teamName: newTeamName, githubRepo })
      });
      const payload = (await response.json()) as {
        invite: TeamInviteView;
        error?: string;
      };

      if (!response.ok) throw new Error(payload.error ?? "招待コードを作成できませんでした。");

      setInvites((current) => [payload.invite, ...current]);
      setTeamName(payload.invite.team_name);
      setNewTeamName("");
      setGithubRepo("");
      setMessage(`招待コード ${payload.invite.code} を作成しました。`);
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
      const payload = (await response.json()) as { team?: Team; error?: string };

      if (!response.ok || !payload.team) {
        throw new Error(payload.error ?? "チームを登録できませんでした。");
      }

      setTeams((current) => [...current, payload.team as Team]);
      setMessage(`チーム「${payload.team.name}」を登録しました。`);
      setNewTeamName("");
    } catch (error) {
      setMessage(error instanceof Error ? error.message : "登録に失敗しました。");
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
          teamName,
          joinCode,
          githubRepo: githubRepo || undefined,
          displayName: manualEntry ? displayName : undefined
        })
      });
      const payload = (await response.json()) as {
        session: AppSession;
        repoWarning?: string;
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
      const response = await fetch("/api/mentors/session", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          specialty,
          displayName: manualEntry ? displayName : undefined
        })
      });
      const payload = (await response.json()) as { session: AppSession; error?: string };

      if (!response.ok) throw new Error(payload.error ?? "登録に失敗しました。");

      saveSession(payload.session);
      router.push("/help");
    } catch (error) {
      setMessage(error instanceof Error ? error.message : "登録に失敗しました。");
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
          {viewer ? (
            <>
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
                <button
                  type="button"
                  onClick={logout}
                  aria-label="ログアウト"
                  className="grid size-8 shrink-0 place-items-center rounded-xl border border-line bg-surface text-muted shadow-soft transition-colors hover:text-ink"
                >
                  <LogOut className="size-3.5" />
                </button>
              </div>

              <form onSubmit={joinTeam} className="space-y-4">
                <Field label="参加コード">
                  <input
                    value={joinCode}
                    onChange={(event) => setJoinCode(event.target.value.toUpperCase())}
                    className={inputClass}
                    placeholder="ABCD-2345"
                    required={Boolean(hackEvent)}
                  />
                  <p className="mt-1.5 text-xs leading-5 text-muted">
                    運営がDiscordなどで配ったコードを入力してください。
                  </p>
                </Field>

                <Field label="チーム名">
                  {teams.length === 0 ? (
                    <p className="rounded-xl border border-dashed border-lineStrong bg-sand/60 px-3 py-2.5 text-xs leading-5 text-muted shadow-inset">
                      まだチームが登録されていません。運営がチームを登録するのを待ってください。
                    </p>
                  ) : (
                    <select
                      value={teamName}
                      onChange={(event) => setTeamName(event.target.value)}
                      className={inputClass}
                      required
                    >
                      <option value="">選んでください</option>
                      {teams.map((team) => (
                        <option key={team.id} value={team.name}>
                          {team.name}
                        </option>
                      ))}
                    </select>
                  )}
                </Field>

                <Field label="自分のGitHubリポジトリ（あとからでも可）">
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
                      {repos.map((repo) => (
                        <option key={repo.fullName} value={repo.fullName}>
                          {repo.fullName}
                        </option>
                      ))}
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
                          href="/api/auth/github?private=1"
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

                <button
                  type="submit"
                  disabled={isBusy || teams.length === 0}
                  className={primaryButtonClass}
                >
                  <DoorOpen className="size-4" />
                  チームに参加する
                </button>
              </form>
            </>
          ) : authConfigured ? (
            <>
              <ol className="mb-5 space-y-2.5 text-sm text-ink2">
                {[
                  "GitHubでログインする",
                  "運営から配られた参加コードを入れる",
                  "チームと自分のリポジトリを選ぶ"
                ].map((step, index) => (
                  <li key={step} className="flex items-start gap-2.5">
                    <span className="grid size-5 shrink-0 place-items-center rounded-full bg-paper2 text-xs font-medium text-muted shadow-inset">
                      {index + 1}
                    </span>
                    <span className="leading-5">{step}</span>
                  </li>
                ))}
              </ol>
              <a href="/api/auth/github" className={primaryButtonClass}>
                <Github className="size-5" />
                GitHubでログイン
              </a>
            </>
          ) : (
            <form onSubmit={joinTeam} className="space-y-4">
              <div className="flex items-start gap-2.5 rounded-xl border border-sun/30 bg-sun/10 px-3 py-2.5 text-xs leading-5 text-sun shadow-soft">
                <TriangleAlert className="mt-0.5 size-3.5 shrink-0" />
                <span>
                  GitHubログインは未設定です。いまは名前を入れて参加できます。
                </span>
              </div>
              <Field label="チーム名">
                <input
                  list="registered-team-names"
                  value={teamName}
                  onChange={(event) => setTeamName(event.target.value)}
                  className={inputClass}
                  placeholder="例）Team Aurora"
                  required
                />
                <datalist id="registered-team-names">
                  {initialTeams.map((team) => (
                    <option key={team.id} value={team.name} />
                  ))}
                </datalist>
              </Field>
              <Field label="表示名">
                <input
                  value={displayName}
                  onChange={(event) => setDisplayName(event.target.value)}
                  className={inputClass}
                  placeholder="例）山田太郎"
                  required
                />
              </Field>
              <button type="submit" disabled={isBusy} className={primaryButtonClass}>
                <DoorOpen className="size-4" />
                チームに参加する
              </button>
            </form>
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

        {canJoin && (
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
                <p className="text-xs font-medium text-ink2">参加コード</p>
                <p className="mt-1 font-mono text-2xl font-bold tracking-widest text-pulse">
                  {hackEvent.join_code}
                </p>
                <p className="mt-1.5 text-xs leading-5 text-muted">
                  このコードをDiscordなど参加者が集まる場所に共有してください。
                </p>
                <button
                  type="button"
                  onClick={() => {
                    void navigator.clipboard?.writeText(hackEvent.join_code);
                    setMessage("参加コードをコピーしました。");
                  }}
                  className="mt-3 flex h-10 w-full items-center justify-center gap-2 rounded-xl border border-line bg-surface text-sm font-medium text-ink2 shadow-soft transition-[box-shadow,color,transform] hover:text-ink active:translate-y-px active:shadow-pressed"
                >
                  <Clipboard className="size-4" />
                  コードをコピー
                </button>
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
                {teams.map((team) => (
                  <li
                    key={team.id}
                    className="flex items-center justify-between gap-3 text-xs"
                  >
                    <span className="min-w-0 truncate text-ink2">{team.name}</span>
                    <span className="shrink-0 font-mono text-muted">
                      {team.github_repo ?? "リポジトリ未設定"}
                    </span>
                  </li>
                ))}
              </ul>
            )}
          </Collapsible>
        )}

        {(isStaff || manualEntry) && (
          <Collapsible title="メンターの方：担当として登録する">
            <form onSubmit={joinMentor} className="space-y-4">
              {manualEntry && !viewer && (
                <Field label="表示名">
                  <input
                    value={displayName}
                    onChange={(event) => setDisplayName(event.target.value)}
                    className={inputClass}
                  />
                </Field>
              )}
              <Field label="得意分野">
                <input
                  value={specialty}
                  onChange={(event) => setSpecialty(event.target.value)}
                  className={inputClass}
                  required
                />
              </Field>
              <button type="submit" disabled={isBusy} className={primaryButtonClass}>
                <GraduationCap className="size-4" />
                メンターとして入る
              </button>
            </form>
          </Collapsible>
        )}
      </div>
    </main>
  );
}
