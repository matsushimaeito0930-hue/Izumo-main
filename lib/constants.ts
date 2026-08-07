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

export const SCORE_BY_ACTIVITY: Record<ActivityType, number> = {
  push: 1,
  pull_request_opened: 10,
  pull_request_merged: 20,
  issue_closed: 8,
  review: 10
};

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
