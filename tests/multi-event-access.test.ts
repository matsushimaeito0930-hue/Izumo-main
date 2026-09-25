import { describe, expect, it } from "vitest";
import {
  createEvent,
  createTeamByName,
  getEvent,
  getEventIdForAccessCode,
  getEventsJoinedBy,
  getEventsOwnedBy,
  joinMentorByCode,
  joinTeamByName,
  syncDirectMessageProfile
} from "@/lib/store";

describe("multi-event access", () => {
  it("keeps past events available with each person's event-specific role", async () => {
    const first = await createEvent({ name: "First event", ownerGithubUsername: "owner-a" });
    const firstTeam = await createTeamByName({ name: "First participant team", eventId: first.id });
    await joinTeamByName({
      teamName: firstTeam.name,
      displayName: "Multi-role user",
      githubUsername: "multi-role-user"
    });

    const second = await createEvent({ name: "Second event", ownerGithubUsername: "owner-b" });
    await syncDirectMessageProfile({
      eventId: second.id,
      githubUsername: "multi-role-user",
      displayName: "Multi-role user",
      avatarUrl: null,
      role: "mentor"
    });

    expect((await getEvent(first.id))?.name).toBe("First event");
    expect((await getEventsOwnedBy("owner-a")).map((event) => event.id)).toContain(first.id);
    expect(await getEventIdForAccessCode(first.join_code)).toBe(first.id);
    expect(await getEventIdForAccessCode(second.join_code)).toBe(second.id);

    const joined = await getEventsJoinedBy("multi-role-user");
    expect(joined.find((event) => event.id === first.id)).toMatchObject({
      role: "participant",
      teamId: firstTeam.id
    });
    expect(joined.find((event) => event.id === second.id)).toMatchObject({ role: "mentor" });

    const ownerAsMentorElsewhere = await joinMentorByCode({
      code: second.join_code,
      displayName: "Owner A",
      specialty: "Frontend",
      githubUsername: "owner-a",
      role: "admin"
    });
    expect(ownerAsMentorElsewhere.role).toBe("mentor");
    const ownerAtHome = await joinMentorByCode({
      code: first.join_code,
      displayName: "Owner A",
      specialty: "Frontend",
      githubUsername: "owner-a",
      role: "admin"
    });
    expect(ownerAtHome.role).toBe("admin");
  });
});
