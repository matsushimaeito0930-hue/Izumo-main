import { describe, expect, it } from "vitest";
import { joinTeamByName } from "@/lib/store";

describe("team name onboarding", () => {
  it("joins a registered team with a GitHub identity", async () => {
    const session = await joinTeamByName({
      teamName: "team a",
      displayName: "Join Test",
      githubUsername: "join-test"
    });

    expect(session.teamName).toBe("Team A");
    expect(session.githubUsername).toBe("join-test");
    expect(session.role).toBe("participant");
  });

  it("rejects a team name that is not registered", async () => {
    await expect(
      joinTeamByName({
        teamName: "Unknown Team",
        displayName: "Join Test",
        githubUsername: "join-test-unknown"
      })
    ).rejects.toThrow("Team name was not found.");
  });
});
