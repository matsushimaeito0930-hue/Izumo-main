import { describe, expect, it } from "vitest";
import { countUniqueCommitShas } from "@/lib/github-commits";

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
});
