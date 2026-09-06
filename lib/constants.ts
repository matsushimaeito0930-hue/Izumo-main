import type { ActivityType } from "@/lib/types";

/**
 * 開発ステージ。スコアの伸びに応じてチームの進み具合を4段階で表す。
 * DBの列名 house_level は互換のためそのまま使用する。
 */
export const HOUSE_LEVELS = [
  {
    level: 1,
    minScore: 0,
    label: "立ち上げ",
    summary: "環境構築とテーマ決め"
  },
  {
    level: 2,
    minScore: 100,
    label: "開発中",
    summary: "主要機能の実装が進行中"
  },
  {
    level: 3,
    minScore: 300,
    label: "加速中",
    summary: "機能追加とレビューが活発"
  },
  {
    level: 4,
    minScore: 600,
    label: "仕上げ",
    summary: "完成度を高める段階"
  }
] as const;

/** 画面や設定フォームで並べる順番。 */
export const ACTIVITY_TYPES: ActivityType[] = [
  "push",
  "pull_request_opened",
  "pull_request_merged",
  "issue_closed",
  "review"
];

/**
 * 配点の既定値。
 *
 * pushが1点なのは、細かく刻むだけで上位に行けてしまうのを避けるため。
 * イベントごとに events.score_config で上書きできる。
 */
export const DEFAULT_SCORE_BY_ACTIVITY: Record<ActivityType, number> = {
  push: 1,
  pull_request_opened: 2,
  pull_request_merged: 5,
  issue_closed: 2,
  review: 3
};

/** 既定値の別名。設定が読めないときの拠り所として残している。 */
export const SCORE_BY_ACTIVITY = DEFAULT_SCORE_BY_ACTIVITY;

/** 1アクションに付けられる点数の上限。桁を間違えて順位が壊れるのを防ぐ。 */
export const MAX_SCORE_PER_ACTIVITY = 500;

/**
 * DBやフォームから来た配点を安全な形に均す。
 * 欠けている種別は既定値で埋め、数値でないものや範囲外は捨てる。
 */
export function normalizeScoreConfig(value: unknown): Record<ActivityType, number> {
  const source = (value ?? {}) as Record<string, unknown>;
  const result = { ...DEFAULT_SCORE_BY_ACTIVITY };

  for (const type of ACTIVITY_TYPES) {
    const raw = source[type];
    const parsed = typeof raw === "string" ? Number(raw) : raw;

    if (typeof parsed !== "number" || !Number.isFinite(parsed)) continue;

    const rounded = Math.round(parsed);
    if (rounded < 0 || rounded > MAX_SCORE_PER_ACTIVITY) continue;

    result[type] = rounded;
  }

  return result;
}

export const ACTIVITY_LABELS: Record<ActivityType, string> = {
  push: "がコミットをプッシュしました",
  pull_request_opened: "がプルリクエストを作成しました",
  pull_request_merged: "がプルリクエストをマージしました",
  issue_closed: "がIssueをクローズしました",
  review: "がプルリクエストをレビューしました"
};

/** 種別の短い日本語名。バッジや凡例に使う。 */
export const ACTIVITY_SHORT_LABELS: Record<ActivityType, string> = {
  push: "プッシュ",
  pull_request_opened: "PR作成",
  pull_request_merged: "PRマージ",
  issue_closed: "Issue解決",
  review: "レビュー"
};

export const TEAM_COLORS = ["#0f8b7e", "#c05575", "#b5771a", "#2e7d5b"];
