import { describe, expect, it } from "vitest";
import {
  createTeamByName,
  getHackVerseState,
  saveEvent,
  setTeamRepo,
  updateTeam
} from "@/lib/store";

describe("event reset", () => {
  it("clears registered teams and repositories when the event name changes", async () => {
    await saveEvent({ name: "Before Reset" });
    const team = await createTeamByName({ name: "Reset Team" });
    await setTeamRepo({ teamId: team.id, githubRepo: "demo/reset-team" });

    await saveEvent({ name: "After Reset" });

    const state = await getHackVerseState();
    expect(state.teams).toEqual([]);
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
