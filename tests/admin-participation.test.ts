import { describe, expect, it } from "vitest";
import { createChatMessage, createTeamByName, joinTeamByName, saveEvent } from "@/lib/store";

describe("operator participation", () => {
  it("keeps the admin role when the operator joins a team", async () => {
    await saveEvent({ name: "Operator Test Event" });
    const team = await createTeamByName({ name: "Operator Test Team" });

    const session = await joinTeamByName({
      teamName: team.name,
      displayName: "Operator",
      githubUsername: "operator-test",
      role: "admin"
    });

    expect(session.role).toBe("admin");
    expect(session.teamId).toBe(team.id);
  });

  it("stores an operator announcement without a team", async () => {
    const message = await createChatMessage({
      channel: "staff",
      authorName: "Operator",
      authorRole: "admin",
      body: "開始時刻をお知らせします。"
    });

    expect(message.team_id).toBeNull();
  });
});

