import { describe, expect, it } from "vitest";
import {
  countUniqueCommitShas,
  summarizeUniqueCommitsByGitHubLogin
} from "@/lib/github-commits";

describe("GitHubコミット照合", () => {
  it("同じコミットが複数ブランチに含まれても一度だけ数える", () => {
    expect(
      countUniqueCommitShas([
        [{ sha: "base" }, { sha: "feature" }],
        [{ sha: "base" }, { sha: "feature" }, { sha: "merge" }],
        [{ sha: "other" }]
      ])
    ).toBe(4);
  });

  it("欠損したSHAは集計しない", () => {
    expect(countUniqueCommitShas([[{ sha: "ok" }, {}, { sha: "" }]])).toBe(1);
  });

  it("SHAを重複排除してGitHubアカウント別に集計する", () => {
    expect(
      summarizeUniqueCommitsByGitHubLogin([
        [
          { sha: "base", author: { login: "Eito" } },
          { sha: "feature", author: { login: "06iyz" } }
        ],
        [
          { sha: "base", author: { login: "eito" } },
          { sha: "merge", author: null }
        ]
      ])
    ).toEqual({
      total: 3,
      byLogin: { eito: 1, "06iyz": 1 },
      unattributedCount: 1
    });
  });
});
