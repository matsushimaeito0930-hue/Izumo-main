"use client";

import { FormEvent, useState } from "react";
import { Send } from "lucide-react";
import { Panel } from "@/components/panel";
import type { Team } from "@/lib/types";

const fieldClass =
  "w-full rounded-xl border border-line bg-paper px-3 text-sm text-ink shadow-inset outline-none transition-colors placeholder:text-muted/70 hover:border-lineStrong focus:border-pulse";

const labelClass = "mb-1.5 block text-xs font-medium text-ink2";

export function HelpComposer({
  teams,
  onSubmit
}: {
  teams: Team[];
  onSubmit: (input: {
    teamId: string;
    title: string;
    body: string;
    category: string;
  }) => Promise<void>;
}) {
  const [teamId, setTeamId] = useState(teams[0]?.id ?? "");
  const [title, setTitle] = useState("");
  const [body, setBody] = useState("");
  const [category, setCategory] = useState("フロントエンド");
  const [isSubmitting, setIsSubmitting] = useState(false);

  async function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setIsSubmitting(true);
    try {
      await onSubmit({ teamId, title, body, category });
      setTitle("");
      setBody("");
    } finally {
      setIsSubmitting(false);
    }
  }

  return (
    <Panel
      title="わからないことを書く"
      description="メンターだけでなく、参加している人なら誰でも答えてくれます。"
    >
      <form onSubmit={handleSubmit} className="space-y-4">
        <div className="grid gap-4 sm:grid-cols-2">
          <label className="block">
            <span className={labelClass}>自分のチーム</span>
            <select
              value={teamId}
              onChange={(event) => setTeamId(event.target.value)}
              className={`h-10 ${fieldClass}`}
            >
              {teams.map((team) => (
                <option key={team.id} value={team.id}>
                  {team.name}
                </option>
              ))}
            </select>
          </label>
          <label className="block">
            <span className={labelClass}>カテゴリ</span>
            <select
              value={category}
              onChange={(event) => setCategory(event.target.value)}
              className={`h-10 ${fieldClass}`}
            >
              <option>フロントエンド</option>
              <option>バックエンド</option>
              <option>リアルタイム通信</option>
              <option>UI/UX</option>
              <option>発表準備</option>
            </select>
          </label>
        </div>
        <label className="block">
          <span className={labelClass}>ひとことで言うと</span>
          <input
            value={title}
            onChange={(event) => setTitle(event.target.value)}
            required
            placeholder="例）ログインしてもセッションが取れない"
            className={`h-10 ${fieldClass}`}
          />
        </label>
        <label className="block">
          <span className={labelClass}>くわしく</span>
          <textarea
            value={body}
            onChange={(event) => setBody(event.target.value)}
            required
            rows={4}
            placeholder="やりたいこと・試したこと・出ているエラーを書くと、答えが返ってきやすいです。"
            className={`resize-none py-2 ${fieldClass}`}
          />
        </label>
        <button
          type="submit"
          disabled={isSubmitting || !teamId}
          className="flex h-11 w-full items-center justify-center gap-2 rounded-xl bg-ink px-4 text-sm font-bold text-white shadow-btn transition-[box-shadow,background-color,transform] hover:bg-ink2 active:translate-y-px active:shadow-pressed disabled:cursor-not-allowed disabled:opacity-40 disabled:shadow-none"
        >
          <Send className="size-4" />
          <span>{isSubmitting ? "送信中..." : "質問を投稿する"}</span>
        </button>
      </form>
    </Panel>
  );
}
