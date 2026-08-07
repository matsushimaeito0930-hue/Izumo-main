import { describe, expect, it } from "vitest";
import { getMentorJoinErrorMessage } from "@/lib/mentor-errors";

describe("mentor join error messages", () => {
  it("explains when the Supabase mentor migration is missing", () => {
    expect(
      getMentorJoinErrorMessage(
        new Error("Could not find the 'specialty' column of 'users' in the schema cache")
      )
    ).toContain("supabase/mentor-migration.sql");
  });

  it("explains when an invite code is stale", () => {
    expect(getMentorJoinErrorMessage(new Error("Invite code was not found."))).toContain(
      "最新のコード"
    );
  });

  it("does not expose unknown database errors to the user", () => {
    expect(getMentorJoinErrorMessage(new Error("connection reset by peer"))).toBe(
      "メンター登録に失敗しました。入力内容と招待コードを確認して、もう一度お試しください。"
    );
  });
});
