"use client";

import { FormEvent, useEffect, useState } from "react";
import { Save } from "lucide-react";
import {
  ACTIVITY_SHORT_LABELS,
  ACTIVITY_TYPES,
  DEFAULT_SCORE_BY_ACTIVITY,
  MAX_SCORE_PER_ACTIVITY
} from "@/lib/constants";
import type { ActivityType } from "@/lib/types";

/** 何をしたときの点数かを、運営が読んで分かる言葉で添える。 */
const ACTIVITY_HINTS: Record<ActivityType, string> = {
  push: "コミットをプッシュしたとき。回数を稼ぎやすいので低めが安全です。",
  pull_request_opened: "プルリクエストを新しく開いたとき。",
  pull_request_merged: "プルリクエストがマージされたとき。",
  issue_closed: "Issueをクローズしたとき。",
  review: "プルリクエストにレビューを出したとき。"
};

/**
 * イベントごとの配点を編集する。
 *
 * 保存すると過去の記録も新しい配点で計算し直す。途中で配点を変えたとき、
 * 変更前と変更後の活動が混ざったままだと順位が意味を失うため。
 */
export function ScoreConfigEditor({ onMessage }: { onMessage?: (text: string) => void }) {
  const [values, setValues] = useState<Record<ActivityType, string>>(() =>
    Object.fromEntries(
      ACTIVITY_TYPES.map((type) => [type, String(DEFAULT_SCORE_BY_ACTIVITY[type])])
    ) as Record<ActivityType, string>
  );
  const [isLoading, setIsLoading] = useState(true);
  const [isSaving, setIsSaving] = useState(false);
  const [error, setError] = useState("");

  useEffect(() => {
    let cancelled = false;

    fetch("/api/admin/scores", { cache: "no-store" })
      .then(async (response) => {
        const payload = (await response.json().catch(() => ({}))) as {
          config?: Record<string, number>;
        };
        if (cancelled || !payload.config) return;

        setValues(
          Object.fromEntries(
            ACTIVITY_TYPES.map((type) => [
              type,
              String(payload.config?.[type] ?? DEFAULT_SCORE_BY_ACTIVITY[type])
            ])
          ) as Record<ActivityType, string>
        );
      })
      .finally(() => {
        if (!cancelled) setIsLoading(false);
      });

    return () => {
      cancelled = true;
    };
  }, []);

  async function save(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setIsSaving(true);
    setError("");

    try {
      const config = Object.fromEntries(
        ACTIVITY_TYPES.map((type) => [type, Number(values[type])])
      );

      const response = await fetch("/api/admin/scores", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ config })
      });

      const payload = (await response.json().catch(() => ({}))) as {
        updatedActivities?: number;
        updatedTeams?: number;
        error?: string;
      };

      if (!response.ok) {
        throw new Error(payload.error ?? "保存できませんでした。");
      }

      onMessage?.(
        `配点を保存しました。${payload.updatedActivities ?? 0} 件の記録を計算し直し、${
          payload.updatedTeams ?? 0
        } チームのスコアを更新しました。`
      );
    } catch (saveError) {
      setError(saveError instanceof Error ? saveError.message : "保存できませんでした。");
    } finally {
      setIsSaving(false);
    }
  }

  function resetToDefault() {
    setValues(
      Object.fromEntries(
        ACTIVITY_TYPES.map((type) => [type, String(DEFAULT_SCORE_BY_ACTIVITY[type])])
      ) as Record<ActivityType, string>
    );
  }

  return (
    <form onSubmit={save} className="space-y-3">
      <p className="text-xs leading-5 text-muted">
        アクションごとの点数です。保存すると、これまでの記録も新しい配点で計算し直します。
        0〜{MAX_SCORE_PER_ACTIVITY} の範囲で指定してください。
      </p>

      <ul className="space-y-2">
        {ACTIVITY_TYPES.map((type) => (
          <li
            key={type}
            className="flex items-center gap-3 rounded-xl border border-line/70 bg-paper p-3"
          >
            <div className="min-w-0 flex-1">
              <p className="text-xs font-medium text-ink2">
                {ACTIVITY_SHORT_LABELS[type]}
              </p>
              <p className="mt-0.5 text-[11px] leading-4 text-muted">
                {ACTIVITY_HINTS[type]}
              </p>
            </div>
            <label className="flex shrink-0 items-center gap-1.5">
              <span className="sr-only">{ACTIVITY_SHORT_LABELS[type]}の点数</span>
              <input
                type="number"
                inputMode="numeric"
                min={0}
                max={MAX_SCORE_PER_ACTIVITY}
                value={values[type]}
                disabled={isLoading}
                onChange={(event) =>
                  setValues((current) => ({ ...current, [type]: event.target.value }))
                }
                className="h-10 w-20 rounded-xl border border-line bg-paper px-2 text-right font-mono text-sm text-ink shadow-inset outline-none focus:border-pulse disabled:opacity-40"
              />
              <span className="text-xs text-muted">pt</span>
            </label>
          </li>
        ))}
      </ul>

      {error && <p className="text-xs font-medium text-hot">{error}</p>}

      <div className="flex flex-wrap gap-2">
        <button
          type="submit"
          disabled={isSaving || isLoading}
          className="flex h-11 items-center gap-2 rounded-xl bg-ink px-4 text-sm font-bold text-white shadow-btn transition-[box-shadow,background-color,transform] hover:bg-ink2 active:translate-y-px active:shadow-pressed disabled:cursor-not-allowed disabled:opacity-40"
        >
          <Save className="size-4" />
          {isSaving ? "計算し直しています…" : "配点を保存して再計算する"}
        </button>
        <button
          type="button"
          onClick={resetToDefault}
          disabled={isSaving || isLoading}
          className="h-11 rounded-xl border border-line bg-surface px-4 text-sm font-medium text-ink2 shadow-soft transition-colors hover:text-ink disabled:opacity-40"
        >
          既定値に戻す
        </button>
      </div>
    </form>
  );
}
