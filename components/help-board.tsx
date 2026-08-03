"use client";

import { useState } from "react";
import { HelpThread } from "@/components/help-thread";
import { Panel } from "@/components/panel";
import type { HelpPostView, UserRole } from "@/lib/types";

type Filter = "unanswered" | "unsolved" | "all";

const filterLabels: Record<Filter, string> = {
  unanswered: "未回答",
  unsolved: "未解決",
  all: "すべて"
};

export function HelpBoard({
  posts,
  viewerGithub,
  viewerRole,
  onReply,
  onAccept
}: {
  posts: HelpPostView[];
  viewerGithub?: string | null;
  viewerRole?: UserRole;
  onReply: (input: { helpPostId: string; body: string }) => Promise<void>;
  onAccept: (input: { helpPostId: string; replyId: string }) => Promise<void>;
}) {
  const [filter, setFilter] = useState<Filter>("unsolved");

  const counts = {
    unanswered: posts.filter((post) => post.replies.length === 0).length,
    unsolved: posts.filter((post) => post.status !== "solved").length,
    all: posts.length
  };

  const visiblePosts = posts.filter((post) => {
    if (filter === "unanswered") return post.replies.length === 0;
    if (filter === "unsolved") return post.status !== "solved";
    return true;
  });

  return (
    <Panel
      title="質問掲示板"
      description="困っていることを投稿すると、参加している人なら誰でも回答できます。"
      action={
        <div className="flex items-center gap-1 rounded-xl border border-line bg-paper p-1 shadow-inset">
          {(Object.keys(filterLabels) as Filter[]).map((key) => (
            <button
              key={key}
              type="button"
              onClick={() => setFilter(key)}
              className={`h-7 rounded-lg px-2.5 text-xs font-medium transition-colors ${
                filter === key
                  ? "bg-surface text-ink shadow-card"
                  : "text-muted hover:text-ink"
              }`}
            >
              {filterLabels[key]} {counts[key]}
            </button>
          ))}
        </div>
      }
    >
      {visiblePosts.length === 0 ? (
        <div className="rounded-xl border border-dashed border-lineStrong bg-sand/60 p-8 text-center text-sm text-muted shadow-inset">
          {filter === "unanswered"
            ? "未回答の質問はありません。"
            : filter === "unsolved"
              ? "未解決の質問はありません。"
              : "まだ質問がありません。"}
        </div>
      ) : (
        <ul className="space-y-2">
          {visiblePosts.slice(0, 12).map((post) => (
            <HelpThread
              key={post.id}
              post={post}
              viewerGithub={viewerGithub}
              viewerRole={viewerRole}
              onReply={onReply}
              onAccept={onAccept}
            />
          ))}
        </ul>
      )}
    </Panel>
  );
}
