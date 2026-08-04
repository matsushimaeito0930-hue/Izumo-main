"use client";

import { FormEvent, useEffect, useMemo, useState } from "react";
import { MessageCircle, Send } from "lucide-react";
import { Panel } from "@/components/panel";
import type { ChatMessage, MentorProfile, Team, UserRole } from "@/lib/types";

type SessionSnapshot = {
  displayName?: string;
  role?: UserRole;
  teamId?: string;
};

/**
 * メンター相談。チームごとに1本のスレッド。
 * チーム内チャットは廃止した（同じ場所にいるチームが使わないため）。
 */
export function ChatPanel({
  teams,
  mentors,
  messages,
  onSend,
  viewer = null
}: {
  teams: Team[];
  mentors: MentorProfile[];
  messages: ChatMessage[];
  viewer?: { displayName: string; role: UserRole; login: string } | null;
  onSend: (input: {
    channel: "mentor";
    teamId?: string;
    authorName: string;
    authorRole: UserRole;
    body: string;
  }) => Promise<void>;
}) {
  const [teamId, setTeamId] = useState(teams[0]?.id ?? "");
  const [message, setMessage] = useState("");
  const [session, setSession] = useState<SessionSnapshot>({
    displayName: viewer?.displayName ?? "参加者",
    role: viewer?.role ?? "participant"
  });
  const [isSending, setIsSending] = useState(false);
  const [error, setError] = useState("");

  useEffect(() => {
    if (viewer) return;

    const rawSession = window.localStorage.getItem("hackverse-session");
    if (!rawSession) return;

    try {
      const nextSession = JSON.parse(rawSession) as SessionSnapshot;
      setSession({
        displayName: nextSession.displayName || "参加者",
        role: nextSession.role || "participant",
        teamId: nextSession.teamId
      });
      if (nextSession.teamId && teams.some((team) => team.id === nextSession.teamId)) {
        setTeamId(nextSession.teamId);
      }
    } catch {
      setSession({ displayName: "参加者", role: "participant" });
    }
  }, [teams, viewer]);

  const selectedTeam = teams.find((team) => team.id === teamId) ?? teams[0];
  const visibleMessages = useMemo(
    () =>
      messages
        .filter((item) => item.channel === "mentor" && item.team_id === selectedTeam?.id)
        .slice(-14),
    [messages, selectedTeam?.id]
  );

  const availableMentors = mentors.filter(
    (mentor) => mentor.availability === "available"
  );

  async function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!message.trim() || !selectedTeam) return;

    setIsSending(true);
    setError("");
    try {
      await onSend({
        channel: "mentor",
        teamId: selectedTeam.id,
        authorName: session.displayName || "参加者",
        authorRole: session.role || "participant",
        body: message
      });
      setMessage("");
    } catch (sendError) {
      setError(sendError instanceof Error ? sendError.message : "送信に失敗しました");
    } finally {
      setIsSending(false);
    }
  }

  return (
    <Panel
      title="メンターに相談する"
      description="掲示板に書きにくいことは、ここでメンターに直接聞けます。チームごとの部屋です。"
      action={
        <label className="flex items-center gap-2 text-xs text-muted">
          チーム
          <select
            value={selectedTeam?.id ?? ""}
            onChange={(event) => setTeamId(event.target.value)}
            disabled={teams.length === 0}
            className="h-9 max-w-40 rounded-xl border border-line bg-paper px-2 text-sm text-ink shadow-inset outline-none focus:border-pulse"
          >
            {teams.length === 0 && <option value="">チーム未登録</option>}
            {teams.map((team) => (
              <option key={team.id} value={team.id}>
                {team.name}
              </option>
            ))}
          </select>
        </label>
      }
    >
      <div className="flex min-h-[15rem] flex-col justify-end gap-3 rounded-xl border border-line bg-paper p-3 shadow-inset">
        {visibleMessages.length > 0 ? (
          visibleMessages.map((item) => {
            const isOwnMessage = item.author_name === session.displayName;
            return (
              <div
                key={item.id}
                className={`flex ${isOwnMessage ? "justify-end" : "justify-start"}`}
              >
                <div className={`max-w-[85%] ${isOwnMessage ? "text-right" : ""}`}>
                  <div className="mb-1 flex items-center gap-2 text-xs text-muted">
                    {!isOwnMessage && <span>{item.author_name}</span>}
                    <span>{item.author_role === "mentor" ? "メンター" : "メンバー"}</span>
                    {isOwnMessage && <span>{item.author_name}</span>}
                  </div>
                  <p
                    className={`rounded-xl border px-3 py-2 text-left text-sm leading-6 shadow-soft ${
                      isOwnMessage
                        ? "border-pulse/25 bg-pulse/10 text-ink"
                        : "border-line bg-surface text-ink2"
                    }`}
                  >
                    {item.body}
                  </p>
                  <time className="mt-1 block text-xs text-muted">
                    {new Date(item.created_at).toLocaleTimeString("ja-JP", {
                      hour: "2-digit",
                      minute: "2-digit"
                    })}
                  </time>
                </div>
              </div>
            );
          })
        ) : (
          <div className="grid flex-1 place-items-center text-center">
            <div>
              <MessageCircle className="mx-auto size-6 text-muted" />
              <p className="mt-2 text-sm font-medium text-ink2">
                まだメッセージはありません
              </p>
              <p className="mt-1 text-xs text-muted">
                {availableMentors.length > 0
                  ? `いま ${availableMentors.length} 人のメンターが対応できます。`
                  : "困っていることを書けば、手が空いたメンターが返信します。"}
              </p>
            </div>
          </div>
        )}
      </div>

      <form onSubmit={handleSubmit} className="mt-3 flex gap-2">
        <input
          value={message}
          onChange={(event) => setMessage(event.target.value)}
          maxLength={500}
          disabled={!selectedTeam}
          placeholder="メンターに聞きたいことを書く"
          className="h-11 min-w-0 flex-1 rounded-xl border border-line bg-paper px-3 text-sm text-ink shadow-inset outline-none transition-colors placeholder:text-muted/70 hover:border-lineStrong focus:border-pulse"
        />
        <button
          type="submit"
          disabled={isSending || !message.trim() || !selectedTeam}
          className="flex h-11 shrink-0 items-center gap-2 rounded-xl bg-ink px-4 text-sm font-bold text-white shadow-btn transition-[box-shadow,background-color,transform] hover:bg-ink2 active:translate-y-px active:shadow-pressed disabled:cursor-not-allowed disabled:opacity-40 disabled:shadow-none"
        >
          <Send className="size-4" />
          <span className="hidden sm:inline">送信</span>
        </button>
      </form>

      {error && <p className="mt-2 text-xs font-medium text-hot">{error}</p>}
    </Panel>
  );
}
