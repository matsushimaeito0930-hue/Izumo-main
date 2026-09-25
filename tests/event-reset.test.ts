import { describe, expect, it } from "vitest";
import {
  createTeamByName,
  createEvent,
  getHackVerseState,
  saveEvent,
  setTeamRepo,
  updateTeam
} from "@/lib/store";

describe("event editing", () => {
  it("starts a new event empty and preserves the previous event teams", async () => {
    const previous = await createEvent({ name: "Previous", ownerGithubUsername: "owner" });
    const team = await createTeamByName({ name: "Previous team", eventId: previous.id });
    const next = await createEvent({ name: "Next", ownerGithubUsername: "owner" });
    expect((await getHackVerseState(next.id)).teams).toEqual([]);
    expect((await getHackVerseState(previous.id)).teams.map((item) => item.id)).toContain(team.id);
  });
  it("keeps registered teams in the same event when its name changes", async () => {
    const before = await saveEvent({ name: "Before Reset" });
    const team = await createTeamByName({ name: "Reset Team" });
    await setTeamRepo({ teamId: team.id, githubRepo: "demo/reset-team" });

    const after = await saveEvent({ name: "After Reset" });

    expect(after.join_code).toBe(before.join_code);
    const state = await getHackVerseState();
    expect(state.teams.some((candidate) => candidate.id === team.id)).toBe(true);
    expect(state.activities).toEqual([]);
  });

  it("updates a registered team's name and repository", async () => {
    const team = await createTeamByName({ name: "Editable Team" });

    const updated = await updateTeam({
      teamId: team.id,
      name: "Renamed Team",
      githubRepo: "demo/renamed-team"
    });

    expect(updated.name).toBe("Renamed Team");
    expect(updated.github_repo).toBe("demo/renamed-team");
  });
});
