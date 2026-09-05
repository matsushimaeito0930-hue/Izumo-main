import { describe, expect, it } from "vitest";
import { createTeamInvite, joinTeamWithInvite } from "@/lib/store";

describe("team invite onboarding", () => {
  it("joins the team resolved by its room code", async () => {
    const invite = await createTeamInvite({
      teamName: "Aurora Lab",
      githubRepo: "demo/aurora-lab",
      invitedBy: "HackRadar Admin"
    });

    const session = await joinTeamWithInvite({
      code: invite.code,
      displayName: "Join Test",
      githubUsername: "join-test"
    });

    expect(session.teamName).toBe("Aurora Lab");
    expect(session.githubUsername).toBe("join-test");
    expect(session.role).toBe("participant");
  });

  it("rejects a participant from joining a second team", async () => {
    const firstInvite = await createTeamInvite({
      teamName: "First Invite Team",
      githubRepo: "demo/first-invite-team",
      invitedBy: "HackRadar Admin"
    });
    const secondInvite = await createTeamInvite({
      teamName: "Second Invite Team",
      githubRepo: "demo/second-invite-team",
      invitedBy: "HackRadar Admin"
    });

    await joinTeamWithInvite({
      code: firstInvite.code,
      displayName: "Single Team User",
      githubUsername: "single-team-user"
    });

    await expect(
      joinTeamWithInvite({
        code: secondInvite.code,
        displayName: "Single Team User",
        githubUsername: "single-team-user"
      })
    ).rejects.toThrow("すでに別のチームに所属");
  });

  it("allows the same GitHub account to join a team in another event", async () => {
    const firstInvite = await createTeamInvite({
      teamName: "Parallel Event One",
      githubRepo: "demo/parallel-event-one",
      invitedBy: "HackRadar Admin",
      eventId: "parallel-event-one"
    });
    const secondInvite = await createTeamInvite({
      teamName: "Parallel Event Two",
      githubRepo: "demo/parallel-event-two",
      invitedBy: "HackRadar Admin",
      eventId: "parallel-event-two"
    });

    const firstSession = await joinTeamWithInvite({
      code: firstInvite.code,
      displayName: "Parallel User",
      githubUsername: "parallel-user"
    });
    const secondSession = await joinTeamWithInvite({
      code: secondInvite.code,
      displayName: "Parallel User",
      githubUsername: "parallel-user"
    });

    expect(firstSession.eventId).toBe("parallel-event-one");
    expect(secondSession.eventId).toBe("parallel-event-two");
  });
});
