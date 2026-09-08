"use client";

import { FormEvent, useEffect, useState } from "react";
import { Send } from "lucide-react";
import { Panel } from "@/components/panel";
import type { Team } from "@/lib/types";

const fieldClass =
  "w-full rounded-xl border border-line bg-paper px-3 text-sm text-ink shadow-inset outline-none transition-colors placeholder:text-muted/70 hover:border-lineStrong focus:border-pulse";

const labelClass = "mb-1.5 block text-xs font-medium text-ink2";

const categories = ["フロントエンド", "バックエンド", "リアルタイム通信", "UI/UX", "発表資料", "その他"];

export function HelpComposer({
  teams,
  lockedTeamId,
  onSubmit
}: {
  teams: Team[];
  /** 参加者のチームはログイン情報から決まるため、画面で選ばせない。 */
  lockedTeamId?: string | null;
  onSubmit: (input: {
    teamId: string;
    title: string;
    body: string;
    category: string;
    anonymous: boolean;
  }) => Promise<void>;
}) {
  const [teamId, setTeamId] = useState(lockedTeamId ?? teams[0]?.id ?? "");
  const [title, setTitle] = useState("");
  const [body, setBody] = useState("");
  const [category, setCategory] = useState(categories[0]);
  const [customCategory, setCustomCategory] = useState("");
  const [anonymous, setAnonymous] = useState(false);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [error, setError] = useState("");

  useEffect(() => {
    if (lockedTeamId) {
      setTeamId(lockedTeamId);
    } else if (!teamId && teams[0]) {
      setTeamId(teams[0].id);
    }
  }, [lockedTeamId, teamId, teams]);

  const selectedCategory = category === "その他" ? customCategory.trim() : category;

  async function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setIsSubmitting(true);
    setError("");
    try {
      await onSubmit({ teamId, title, body, category: selectedCategory, anonymous });
      setTitle("");
      setBody("");
      setCategory(categories[0]);
      setCustomCategory("");
      setAnonymous(false);
    } catch (submitError) {
      setError(
        submitError instanceof Error ? submitError.message : "質問を投稿できませんでした。もう一度お試しください。"
      );
    } finally {
      setIsSubmitting(false);
    }
  }

  return (
    <Panel
      title="わからないことを書く"
      description="困っていることを投稿すると、参加している人なら誰でも回答できます。"
    >
      <form onSubmit={handleSubmit} className="space-y-4">
        {!lockedTeamId && (
          <label className="block">
            <span className={labelClass}>チーム</span>
            <select
              value={teamId}
              onChange={(event) => setTeamId(event.target.value)}
              disabled={teams.length === 0}
              className={`h-10 ${fieldClass}`}
            >
              {teams.length === 0 && <option value="">チーム未登録</option>}
              {teams.map((team) => (
                <option key={team.id} value={team.id}>
                  {team.name}
                </option>
              ))}
            </select>
          </label>
        )}

        {teams.length === 0 && (
          <p className="rounded-xl border border-dashed border-lineStrong bg-sand/60 px-3 py-2.5 text-xs leading-5 text-muted">
            運営がチームを登録すると、質問を投稿できます。
          </p>
        )}

        <label className="block">
          <span className={labelClass}>カテゴリ</span>
          <select
            value={category}
            onChange={(event) => setCategory(event.target.value)}
            className={`h-10 ${fieldClass}`}
          >
            {categories.map((item) => (
              <option key={item}>{item}</option>
            ))}
          </select>
        </label>

        {category === "その他" && (
          <label className="block">
            <span className={labelClass}>カテゴリを入力</span>
            <input
              value={customCategory}
              onChange={(event) => setCustomCategory(event.target.value)}
              required
              maxLength={60}
              placeholder="例：データベース設計"
              className={`h-10 ${fieldClass}`}
            />
          </label>
        )}

        <label className="block">
          <span className={labelClass}>ひとことで言うと</span>
          <input
            value={title}
            onChange={(event) => setTitle(event.target.value)}
            required
            maxLength={120}
            placeholder="例：ログイン後もセッションが切れる"
            className={`h-10 ${fieldClass}`}
          />
        </label>

        <label className="block">
          <span className={labelClass}>くわしく</span>
          <textarea
            value={body}
            onChange={(event) => setBody(event.target.value)}
            required
            maxLength={3000}
            rows={4}
            placeholder="やりたいこと・試したこと・出ているエラーを書いてください。"
            className={`resize-none py-2 ${fieldClass}`}
          />
        </label>

        <label className="flex items-start gap-2.5 rounded-xl border border-line bg-paper px-3 py-2.5 text-sm text-ink2 shadow-inset">
          <input
            type="checkbox"
            checked={anonymous}
            onChange={(event) => setAnonymous(event.target.checked)}
            className="mt-0.5 size-4 accent-ink"
          />
          <span>
            匿名で投稿する
            <span className="mt-0.5 block text-xs leading-5 text-muted">
              画面には「匿名」と表示されます。投稿者情報はシステム内部で保持されます。
            </span>
          </span>
        </label>

        {error && <p className="rounded-xl bg-hot/10 px-3 py-2 text-sm text-hot">{error}</p>}

        <button
          type="submit"
          disabled={isSubmitting || !teamId || !selectedCategory}
          className="flex h-11 w-full items-center justify-center gap-2 rounded-xl bg-ink px-4 text-sm font-bold text-white shadow-btn transition-[box-shadow,background-color,transform] hover:bg-ink2 active:translate-y-px active:shadow-pressed disabled:cursor-not-allowed disabled:opacity-40 disabled:shadow-none"
        >
          <Send className="size-4" />
          <span>{isSubmitting ? "投稿中..." : "質問を投稿する"}</span>
        </button>
      </form>
    </Panel>
  );
}
