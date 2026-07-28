"use client";

import { FormEvent, useEffect, useMemo, useState } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import {
  Clipboard,
  DoorOpen,
  GraduationCap,
  LogIn,
  Plus,
  ShieldCheck,
  Users
} from "lucide-react";
import type { AppSession, TeamInviteView } from "@/lib/types";

type InviteResponse = {
  invite: TeamInviteView;
};

type JoinResponse = {
  session: AppSession;
};

function saveSession(session: AppSession) {
  window.localStorage.setItem("hackverse-session", JSON.stringify(session));
}

function Field({
  label,
  children
}: {
  label: string;
  children: React.ReactNode;
}) {
  return (
    <label className="block">
      <span className="mb-2 block text-xs font-black uppercase tracking-[0.14em] text-white/55">
        {label}
      </span>
      {children}
    </label>
  );
}

const inputClass =
  "h-11 w-full rounded-md border border-white/12 bg-void px-3 text-sm text-white outline-none placeholder:text-white/30 focus:border-pulse";

export function OnboardingClient({
  initialInvites
}: {
  initialInvites: TeamInviteView[];
}) {
  const router = useRouter();
  const searchParams = useSearchParams();
  const [invites, setInvites] = useState(initialInvites);
  const [teamName, setTeamName] = useState("");
  const [githubRepo, setGithubRepo] = useState("");
  const [invitedBy, setInvitedBy] = useState("HackVerse Admin");
  const [joinCode, setJoinCode] = useState(initialInvites[0]?.code ?? "");
  const [displayName, setDisplayName] = useState("");
  const [githubUsername, setGithubUsername] = useState("");
  const [mentorName, setMentorName] = useState("");
  const [mentorGithub, setMentorGithub] = useState("");
  const [specialty, setSpecialty] = useState("JavaScript / Realtime");
  const [message, setMessage] = useState("");
  const [isBusy, setIsBusy] = useState(false);

  const latestInvite = invites[0];
  const inviteLink = useMemo(() => {
    if (!latestInvite || typeof window === "undefined") return "";
    return `${window.location.origin}/?invite=${latestInvite.code}`;
  }, [latestInvite]);

  useEffect(() => {
    const inviteCode = searchParams.get("invite");
    if (inviteCode) {
      setJoinCode(inviteCode.toUpperCase());
    }
  }, [searchParams]);

  async function createInvite(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setIsBusy(true);
    setMessage("");

    try {
      const response = await fetch("/api/admin/invites", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ teamName, githubRepo, invitedBy })
      });
      const payload = (await response.json()) as InviteResponse & { error?: string };

      if (!response.ok) throw new Error(payload.error ?? "Invite creation failed.");

      setInvites((current) => [payload.invite, ...current]);
      setJoinCode(payload.invite.code);
      setTeamName("");
      setGithubRepo("");
      setMessage(`${payload.invite.team_name} の招待コードを作成しました。`);
    } catch (error) {
      setMessage(error instanceof Error ? error.message : "招待コードの作成に失敗しました。");
    } finally {
      setIsBusy(false);
    }
  }

  async function joinTeam(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setIsBusy(true);
    setMessage("");

    try {
      const response = await fetch("/api/invites/join", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          code: joinCode,
          displayName,
          githubUsername
        })
      });
      const payload = (await response.json()) as JoinResponse & { error?: string };

      if (!response.ok) throw new Error(payload.error ?? "Join failed.");

      saveSession(payload.session);
      router.push("/plaza");
    } catch (error) {
      setMessage(error instanceof Error ? error.message : "チーム参加に失敗しました。");
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
          displayName: mentorName,
          githubUsername: mentorGithub,
          specialty
        })
      });
      const payload = (await response.json()) as JoinResponse & { error?: string };

      if (!response.ok) throw new Error(payload.error ?? "Mentor join failed.");

      saveSession(payload.session);
      router.push("/help");
    } catch (error) {
      setMessage(error instanceof Error ? error.message : "メンター参加に失敗しました。");
    } finally {
      setIsBusy(false);
    }
  }

  return (
    <main className="min-h-screen bg-transparent px-5 py-6">
      <div className="mx-auto max-w-7xl">
        <header className="flex flex-wrap items-center justify-between gap-4 border-b border-white/10 pb-5">
          <div className="flex items-center gap-3">
            <span className="grid size-11 place-items-center rounded-md border border-pulse/35 bg-pulse/10 text-lg font-black text-white shadow-neon">
              HV
            </span>
            <div>
              <p className="text-sm font-black uppercase tracking-[0.18em] text-pulse">
                HackVerse
              </p>
              <h1 className="text-2xl font-black text-white">
                チーム招待から始めるハッカソンロビー
              </h1>
            </div>
          </div>
          <button
            type="button"
            onClick={() => router.push("/dashboard")}
            className="flex h-10 items-center gap-2 rounded-md border border-white/12 bg-white/[0.06] px-3 text-sm font-bold text-white/75 transition hover:bg-white/10 hover:text-white"
          >
            <DoorOpen className="size-4" />
            ロビーを見る
          </button>
        </header>

        <section className="grid gap-6 py-8 lg:grid-cols-[1.05fr_0.95fr]">
          <div className="rounded-lg border border-white/10 bg-panel/80 p-6 shadow-neon">
            <p className="text-xs font-black uppercase tracking-[0.2em] text-pulse">
              Event Setup
            </p>
            <h2 className="mt-3 max-w-2xl text-4xl font-black leading-tight text-white">
              運営がチームを招待し、参加者はコードで入る。
            </h2>
            <p className="mt-4 max-w-2xl text-sm leading-7 text-white/64">
              GitHub repoをチームに紐づけると、pushやPRがそのチームの家・ランキング・
              Live Activityに反映されます。まずは運営が招待コードを発行してください。
            </p>

            <div className="mt-6 grid gap-3 sm:grid-cols-3">
              <div className="rounded-md border border-white/10 bg-white/[0.045] p-4">
                <ShieldCheck className="size-5 text-pulse" />
                <p className="mt-3 text-sm font-black text-white">運営</p>
                <p className="mt-1 text-xs text-white/55">チームとrepoを登録</p>
              </div>
              <div className="rounded-md border border-white/10 bg-white/[0.045] p-4">
                <Users className="size-5 text-sun" />
                <p className="mt-3 text-sm font-black text-white">参加者</p>
                <p className="mt-1 text-xs text-white/55">招待コードで入場</p>
              </div>
              <div className="rounded-md border border-white/10 bg-white/[0.045] p-4">
                <GraduationCap className="size-5 text-hot" />
                <p className="mt-3 text-sm font-black text-white">メンター</p>
                <p className="mt-1 text-xs text-white/55">HELPを見て支援</p>
              </div>
            </div>

            {message && (
              <div className="mt-5 rounded-md border border-sun/25 bg-sun/10 px-4 py-3 text-sm font-bold text-sun">
                {message}
              </div>
            )}
          </div>

          <div className="rounded-lg border border-white/10 bg-panel/80 p-5 shadow-[0_14px_42px_rgba(0,0,0,0.28)]">
            <div className="mb-4 flex items-center justify-between gap-3">
              <h2 className="text-sm font-black uppercase tracking-[0.16em] text-white/70">
                Latest Invites
              </h2>
              <span className="rounded bg-pulse/10 px-2 py-1 text-xs font-black text-pulse">
                {invites.length} active
              </span>
            </div>
            <div className="space-y-3">
              {invites.slice(0, 4).map((invite) => (
                <button
                  key={invite.id}
                  type="button"
                  onClick={() => setJoinCode(invite.code)}
                  className="w-full rounded-md border border-white/10 bg-white/[0.045] p-3 text-left transition hover:border-pulse/45 hover:bg-pulse/10"
                >
                  <div className="flex items-start justify-between gap-3">
                    <div className="min-w-0">
                      <p className="truncate text-sm font-black text-white">
                        {invite.team_name}
                      </p>
                      <p className="truncate text-xs text-white/45">
                        {invite.github_repo}
                      </p>
                    </div>
                    <code className="rounded bg-void px-2 py-1 text-xs font-black text-pulse">
                      {invite.code}
                    </code>
                  </div>
                </button>
              ))}
            </div>
            {latestInvite && (
              <button
                type="button"
                onClick={() => {
                  void navigator.clipboard?.writeText(inviteLink || latestInvite.code);
                  setMessage("最新の招待リンクをコピーしました。");
                }}
                className="mt-4 flex h-10 w-full items-center justify-center gap-2 rounded-md border border-pulse/35 bg-pulse/10 text-sm font-black text-pulse transition hover:bg-pulse/18"
              >
                <Clipboard className="size-4" />
                最新招待リンクをコピー
              </button>
            )}
          </div>
        </section>

        <section className="grid gap-5 lg:grid-cols-3">
          <form
            onSubmit={createInvite}
            className="rounded-lg border border-white/10 bg-panel/80 p-5"
          >
            <div className="mb-5 flex items-center gap-3">
              <span className="grid size-10 place-items-center rounded-md bg-pulse/10 text-pulse">
                <ShieldCheck className="size-5" />
              </span>
              <div>
                <h2 className="text-lg font-black text-white">運営として招待</h2>
                <p className="text-xs text-white/50">チームとGitHub repoを登録</p>
              </div>
            </div>
            <div className="space-y-4">
              <Field label="Team Name">
                <input
                  value={teamName}
                  onChange={(event) => setTeamName(event.target.value)}
                  className={inputClass}
                  placeholder="Team Izumo"
                  required
                />
              </Field>
              <Field label="GitHub Repo">
                <input
                  value={githubRepo}
                  onChange={(event) => setGithubRepo(event.target.value)}
                  className={inputClass}
                  placeholder="owner/repository"
                  required
                />
              </Field>
              <Field label="Invited By">
                <input
                  value={invitedBy}
                  onChange={(event) => setInvitedBy(event.target.value)}
                  className={inputClass}
                  placeholder="HackVerse Admin"
                />
              </Field>
              <button
                type="submit"
                disabled={isBusy}
                className="flex h-11 w-full items-center justify-center gap-2 rounded-md bg-pulse px-4 text-sm font-black text-void transition hover:bg-pulse/90 disabled:opacity-50"
              >
                <Plus className="size-4" />
                招待コードを作成
              </button>
            </div>
          </form>

          <form
            onSubmit={joinTeam}
            className="rounded-lg border border-white/10 bg-panel/80 p-5"
          >
            <div className="mb-5 flex items-center gap-3">
              <span className="grid size-10 place-items-center rounded-md bg-sun/10 text-sun">
                <LogIn className="size-5" />
              </span>
              <div>
                <h2 className="text-lg font-black text-white">招待コードで参加</h2>
                <p className="text-xs text-white/50">参加者としてPlazaへ入る</p>
              </div>
            </div>
            <div className="space-y-4">
              <Field label="Invite Code">
                <input
                  value={joinCode}
                  onChange={(event) => setJoinCode(event.target.value.toUpperCase())}
                  className={inputClass}
                  placeholder="TEAM-A"
                  required
                />
              </Field>
              <Field label="Display Name">
                <input
                  value={displayName}
                  onChange={(event) => setDisplayName(event.target.value)}
                  className={inputClass}
                  placeholder="Matsu"
                  required
                />
              </Field>
              <Field label="GitHub Username">
                <input
                  value={githubUsername}
                  onChange={(event) => setGithubUsername(event.target.value)}
                  className={inputClass}
                  placeholder="matsushimaeito0930-hue"
                />
              </Field>
              <button
                type="submit"
                disabled={isBusy}
                className="flex h-11 w-full items-center justify-center gap-2 rounded-md bg-sun px-4 text-sm font-black text-void transition hover:bg-sun/90 disabled:opacity-50"
              >
                <DoorOpen className="size-4" />
                Plazaへ入る
              </button>
            </div>
          </form>

          <form
            onSubmit={joinMentor}
            className="rounded-lg border border-white/10 bg-panel/80 p-5"
          >
            <div className="mb-5 flex items-center gap-3">
              <span className="grid size-10 place-items-center rounded-md bg-hot/10 text-hot">
                <GraduationCap className="size-5" />
              </span>
              <div>
                <h2 className="text-lg font-black text-white">メンターとして入る</h2>
                <p className="text-xs text-white/50">HELP投稿を見て支援する</p>
              </div>
            </div>
            <div className="space-y-4">
              <Field label="Display Name">
                <input
                  value={mentorName}
                  onChange={(event) => setMentorName(event.target.value)}
                  className={inputClass}
                  placeholder="JavaScript Mentor"
                  required
                />
              </Field>
              <Field label="GitHub Username">
                <input
                  value={mentorGithub}
                  onChange={(event) => setMentorGithub(event.target.value)}
                  className={inputClass}
                  placeholder="mentor-user"
                />
              </Field>
              <Field label="Specialty">
                <input
                  value={specialty}
                  onChange={(event) => setSpecialty(event.target.value)}
                  className={inputClass}
                  placeholder="UI/UX / Firebase"
                  required
                />
              </Field>
              <button
                type="submit"
                disabled={isBusy}
                className="flex h-11 w-full items-center justify-center gap-2 rounded-md bg-hot px-4 text-sm font-black text-white transition hover:bg-hot/90 disabled:opacity-50"
              >
                <GraduationCap className="size-4" />
                HELPを見る
              </button>
            </div>
          </form>
        </section>
      </div>
    </main>
  );
}
