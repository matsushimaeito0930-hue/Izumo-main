import type { ActivityType } from "@/lib/types";

export const HOUSE_LEVELS = [
  { level: 1, minScore: 0, label: "Mini House" },
  { level: 2, minScore: 100, label: "Base House" },
  { level: 3, minScore: 300, label: "Guild House" },
  { level: 4, minScore: 600, label: "Signal Tower" }
] as const;

export const SCORE_BY_ACTIVITY: Record<ActivityType, number> = {
  push: 5,
  pull_request_opened: 10,
  pull_request_merged: 20,
  issue_closed: 8,
  review: 10
};

export const ACTIVITY_LABELS: Record<ActivityType, string> = {
  push: "pushed commits",
  pull_request_opened: "opened a pull request",
  pull_request_merged: "merged a pull request",
  issue_closed: "closed an issue",
  review: "reviewed a pull request"
};

export const ACTIVITY_ICONS: Record<ActivityType, string> = {
  push: "🔥",
  pull_request_opened: "🚀",
  pull_request_merged: "🎉",
  issue_closed: "✅",
  review: "👀"
};

export const TEAM_COLORS = ["#33f2d1", "#ff4f8b", "#ffd166", "#7c5cff"];
