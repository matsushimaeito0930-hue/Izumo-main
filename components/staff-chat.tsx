"use client";

import { FormEvent, useMemo, useState } from "react";
import { MessageCircle, Send } from "lucide-react";
import { Panel } from "@/components/panel";
import type { ChatMessage, Team, UserRole } from "@/lib/types";

/**
 * 運営への相談。チームごとに1本のスレッド。
 * 参加者は自分のチームの部屋だけ、運営は全チームの部屋を切り替えて見る。
 */
export function StaffChat({
  teams,
  messages,
  myTeamId,
  viewer = null,
  onSend,
  announcementOnly = false,
  readOnly = false
}: {
  teams: Team[];
  messages: ChatMessage[];
  myTeamId: string | null;
  viewer?: { displayName: string; role: UserRole; login: string } | null;
  onSend: (input: {
    channel: "staff";
    teamId?: string;
    authorName: string;
    authorRole: UserRole;
    body: string;
  }) => Promise<void>;
  announcementOnly?: boolean;
  /** 審査員のように読むだけの人には、入力欄を出さない。 */
  readOnly?: boolean;
}) {
  const isStaff = viewer?.role === "admin" || viewer?.role === "mentor";

  // 参加者は自分のチーム固定。メンターと運営はチームを切り替えて確認できる。
  const [selectedId, setSelectedId] = useState(
    () => myTeamId ?? (isStaff ? (teams[0]?.id ?? "") : "")
  );
  const activeId = announcementOnly ? "" : isStaff ? selectedId : (myTeamId ?? "");
  const activeTeam = teams.find((team) => team.id === activeId) ?? null;

  const [message, setMessage] = useState("");
  const [isSending, setIsSending] = useState(false);
  const [error, setError] = useState("");

  const visibleMessages = useMemo(
    () =>
      messages
        .filter(
          (item) =>
            item.channel === "staff" &&
            (announcementOnly ? item.team_id === null : item.team_id === activeTeam?.id)
        )
        .slice(-14),
    [announcementOnly, messages, activeTeam?.id]
  );

  async function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!message.trim() || (!announcementOnly && !activeTeam)) return;

    setIsSending(true);
    setError("");
    try {
      await onSend({
        channel: "staff",
        teamId: announcementOnly ? undefined : activeTeam?.id,
        authorName: viewer?.displayName ?? "参加者",
        authorRole: viewer?.role ?? "participant",
        body: message
      });
      setMessage("");
    } catch (sendError) {
      setError(sendError instanceof Error ? sendError.message : "送信に失敗しました");
    } finally {
      setIsSending(false);
    }
  }

  // 参加者がまだチームに入っていないときは、案内だけ出す。
  if (!announcementOnly && !isStaff && !activeTeam) {
    return (
      <Panel
        title="運営に相談する"
        description="チームに参加すると、運営と直接やり取りできる部屋が開きます。"
      >
        <p className="rounded-xl border border-line bg-paper px-3 py-6 text-center text-sm text-muted shadow-inset">
          まずはトップページで参加コードを入力してください。
        </p>
      </Panel>
    );
  }

  return (
    <Panel
      title={announcementOnly ? "お知らせ" : "運営に相談する"}
      description={
        announcementOnly
          ? "運営から全チームに共有するメッセージです。"
          : isStaff
          ? "各チームからの相談がここに届きます。チームを切り替えて返信してください。"
          : "掲示板に書きにくいことは、ここで運営に直接聞けます。"
      }
      action={
        announcementOnly ? null : isStaff ? (
          <label className="flex items-center gap-2 text-xs text-muted">
            チーム
            <select
              value={activeId}
              onChange={(event) => setSelectedId(event.target.value)}
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
        ) : (
          <span className="text-xs text-muted">{activeTeam?.name}</span>
        )
      }
    >
      <div className="flex min-h-[15rem] flex-col justify-end gap-3 rounded-xl border border-line bg-paper p-3 shadow-inset">
        {visibleMessages.length > 0 ? (
          visibleMessages.map((item) => {
            const isOwnMessage = item.author_name === viewer?.displayName;
            return (
              <div
                key={item.id}
                className={`flex ${isOwnMessage ? "justify-end" : "justify-start"}`}
              >
                <div className={`max-w-[85%] ${isOwnMessage ? "text-right" : ""}`}>
                  <div className="mb-1 flex items-center gap-2 text-xs text-muted">
                    {!isOwnMessage && <span>{item.author_name}</span>}
                    <span>
                      {item.author_role === "admin"
                        ? "運営"
                        : item.author_role === "mentor"
                          ? "メンター"
                          : "メンバー"}
                    </span>
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
                {announcementOnly
                  ? "運営からのお知らせがここに表示されます。"
                  : isStaff
                  ? "このチームからの相談はまだありません。"
                  : "困っていることを書けば、運営が返信します。"}
              </p>
            </div>
          </div>
        )}
      </div>

      {readOnly ? null : (
      <form onSubmit={handleSubmit} className="mt-3 flex gap-2">
        <input
          value={message}
          onChange={(event) => setMessage(event.target.value)}
          maxLength={500}
          disabled={!announcementOnly && !activeTeam}
          placeholder={announcementOnly ? "全チームへのお知らせを書く" : isStaff ? "チームに返信する" : "運営に聞きたいことを書く"}
          className="h-11 min-w-0 flex-1 rounded-xl border border-line bg-paper px-3 text-sm text-ink shadow-inset outline-none transition-colors placeholder:text-muted/70 hover:border-lineStrong focus:border-pulse"
        />
        <button
          type="submit"
          disabled={isSending || !message.trim() || (!announcementOnly && !activeTeam)}
          className="flex h-11 shrink-0 items-center gap-2 rounded-xl bg-ink px-4 text-sm font-bold text-white shadow-btn transition-[box-shadow,background-color,transform] hover:bg-ink2 active:translate-y-px active:shadow-pressed disabled:cursor-not-allowed disabled:opacity-40 disabled:shadow-none"
        >
          <Send className="size-4" />
          <span className="hidden sm:inline">送信</span>
        </button>
      </form>
      )}

      {error && <p className="mt-2 text-xs font-medium text-hot">{error}</p>}
    </Panel>
  );
}
