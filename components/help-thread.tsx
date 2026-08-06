"use client";

import { FormEvent, useState } from "react";
import { Check, CornerDownRight, MessageCircle, Send } from "lucide-react";
import type { HelpPostView, UserRole } from "@/lib/types";

const statusLabels = {
  open: "未回答",
  helping: "回答あり",
  solved: "解決済み"
};

const statusClasses = {
  open: "border-hot/30 bg-hot/10 text-hot",
  helping: "border-sun/30 bg-sun/10 text-sun",
  solved: "border-field/30 bg-field/10 text-field"
};

const roleLabels: Record<UserRole, string> = {
  participant: "参加者",
  mentor: "メンター",
  admin: "運営"
};

function formatTime(value: string) {
  return new Date(value).toLocaleTimeString("ja-JP", {
    hour: "2-digit",
    minute: "2-digit"
  });
}

export function HelpThread({
  post,
  viewerGithub,
  viewerRole,
  onReply,
  onAccept
}: {
  post: HelpPostView;
  viewerGithub?: string | null;
  viewerRole?: UserRole;
  onReply: (input: { helpPostId: string; body: string }) => Promise<void>;
  onAccept: (input: { helpPostId: string; replyId: string }) => Promise<void>;
}) {
  const [isOpen, setIsOpen] = useState(post.status !== "solved");
  const [body, setBody] = useState("");
  const [isBusy, setIsBusy] = useState(false);
  const [error, setError] = useState("");

  const canAccept =
    !viewerGithub ||
    post.author_github === viewerGithub ||
    viewerRole === "admin" || viewerRole === "mentor";

  async function submitReply(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!body.trim()) return;

    setIsBusy(true);
    setError("");
    try {
      await onReply({ helpPostId: post.id, body });
      setBody("");
    } catch (replyError) {
      setError(replyError instanceof Error ? replyError.message : "投稿に失敗しました。");
    } finally {
      setIsBusy(false);
    }
  }

  async function accept(replyId: string) {
    setIsBusy(true);
    setError("");
    try {
      await onAccept({ helpPostId: post.id, replyId });
    } catch (acceptError) {
      setError(acceptError instanceof Error ? acceptError.message : "採用に失敗しました。");
    } finally {
      setIsBusy(false);
    }
  }

  return (
    <li className="rounded-xl border border-line/70 bg-surface p-4 shadow-soft">
      <div className="mb-1.5 flex items-start justify-between gap-3">
        <h3 className="min-w-0 text-sm font-bold text-ink">{post.title}</h3>
        <span
          className={`shrink-0 rounded-full border px-2.5 py-0.5 text-xs font-medium ${
            statusClasses[post.status]
          }`}
        >
          {statusLabels[post.status]}
        </span>
      </div>

      <p className="whitespace-pre-wrap text-sm leading-6 text-ink2">{post.body}</p>

      <div className="mt-2 flex flex-wrap items-center gap-x-2 gap-y-1 text-xs text-muted">
        <span className="rounded bg-paper2 px-1.5 py-0.5 text-ink2">{post.category}</span>
        <span>{post.team_name}</span>
        <span>{post.author_name}</span>
        <span>{formatTime(post.created_at)}</span>
        <button
          type="button"
          onClick={() => setIsOpen((current) => !current)}
          className="ml-auto flex items-center gap-1.5 rounded-lg px-2 py-1 text-ink2 transition-colors hover:bg-sand hover:text-ink"
        >
          <MessageCircle className="size-3.5" />
          回答 {post.replies.length} 件
        </button>
      </div>

      {isOpen && (
        <div className="mt-3 border-t border-line pt-3">
          {post.replies.length === 0 ? (
            <p className="rounded-xl border border-dashed border-lineStrong bg-sand/60 px-4 py-5 text-center text-xs text-muted shadow-inset">
              まだ回答がありません。わかる人がいたら書いてあげてください。
            </p>
          ) : (
            <ul className="space-y-2">
              {post.replies.map((reply) => (
                <li
                  key={reply.id}
                  className={`rounded-xl border p-3 ${
                    reply.is_accepted
                      ? "border-field/35 bg-field/5 shadow-soft"
                      : "border-line/70 bg-paper shadow-inset"
                  }`}
                >
                  <div className="mb-1 flex flex-wrap items-center gap-x-2 gap-y-1 text-xs text-muted">
                    <CornerDownRight className="size-3.5" />
                    <span className="font-medium text-ink2">{reply.author_name}</span>
                    <span className="rounded bg-paper2 px-1.5 py-0.5">
                      {roleLabels[reply.author_role]}
                    </span>
                    <span>{formatTime(reply.created_at)}</span>
                    {reply.is_accepted && (
                      <span className="flex items-center gap-1 rounded-full border border-field/30 bg-field/10 px-2 py-0.5 font-medium text-field">
                        <Check className="size-3" />
                        ベストアンサー
                      </span>
                    )}
                  </div>
                  <p className="whitespace-pre-wrap text-sm leading-6 text-ink">
                    {reply.body}
                  </p>
                  {!reply.is_accepted && canAccept && (
                    <button
                      type="button"
                      onClick={() => accept(reply.id)}
                      disabled={isBusy}
                      className="mt-2 flex h-8 items-center gap-1.5 rounded-lg border border-line bg-surface px-2.5 text-xs font-medium text-ink2 shadow-soft transition-[box-shadow,color,transform] hover:text-field active:translate-y-px active:shadow-pressed disabled:opacity-40"
                    >
                      <Check className="size-3.5" />
                      これで解決した
                    </button>
                  )}
                </li>
              ))}
            </ul>
          )}

          <form onSubmit={submitReply} className="mt-3 flex gap-2">
            <input
              value={body}
              onChange={(event) => setBody(event.target.value)}
              maxLength={1000}
              placeholder="心当たりがあれば書いてください"
              className="h-10 min-w-0 flex-1 rounded-xl border border-line bg-paper px-3 text-sm text-ink shadow-inset outline-none transition-colors placeholder:text-muted/70 hover:border-lineStrong focus:border-pulse"
            />
            <button
              type="submit"
              disabled={isBusy || !body.trim()}
              className="flex h-10 shrink-0 items-center gap-1.5 rounded-xl bg-ink px-3.5 text-sm font-bold text-white shadow-btn transition-[box-shadow,background-color,transform] hover:bg-ink2 active:translate-y-px active:shadow-pressed disabled:cursor-not-allowed disabled:opacity-40 disabled:shadow-none"
            >
              <Send className="size-4" />
              <span className="hidden sm:inline">回答</span>
            </button>
          </form>

          {error && <p className="mt-2 text-xs font-medium text-hot">{error}</p>}
        </div>
      )}
    </li>
  );
}
