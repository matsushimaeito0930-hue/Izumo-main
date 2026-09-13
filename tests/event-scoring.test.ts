import { beforeEach, describe, expect, it, vi } from "vitest";
vi.mock("@/lib/env", () => ({ isSupabaseConfigured: () => false }));
import {
  createEvent,
  createTeamByName,
  deleteEvent,
  getEvent,
  getEventByJoinCode,
  getEventsOwnedBy,
  getHackVerseState,
  recordActivity,
  recordRepositoryActivity,
  saveScoreConfig,
  setTeamRepo
} from "@/lib/store";
import { ACTIVITY_TYPES } from "@/lib/constants";

beforeEach(() => {
  globalThis.hackVerseMemoryStore = undefined;
  globalThis.hackVerseMemoryStoreVersion = undefined;
});

describe("event activity scoring", () => {
  it("retains previous memory events and deletes only the selected event", async () => {
    const a = await createEvent({ name: "A", ownerGithubUsername: "owner" });
    const ta = await createTeamByName({ name: "A team", eventId: a.id });
    const b = await createEvent({ name: "B", ownerGithubUsername: "owner" });
    const tb = await createTeamByName({ name: "B team", eventId: b.id });
    expect((await getEventByJoinCode(a.join_code))?.id).toBe(a.id);
    expect(await getEventsOwnedBy("owner")).toHaveLength(2);
    await deleteEvent(a.id);
    expect(await getEvent(a.id)).toBeNull();
    expect(await getEventByJoinCode(a.join_code)).toBeNull();
    expect((await getHackVerseState(a.id)).teams).toEqual([]);
    expect((await getHackVerseState(b.id)).teams.map((team) => team.id)).toEqual([tb.id]);
    expect((await getHackVerseState()).teams.map((team) => team.id)).not.toContain(ta.id);
    await deleteEvent(b.id);
    expect(await getEvent()).toBeNull();
  });
  it("keeps two events' five activity scores separate, including after recalculation", async () => {
    const a = await createEvent({ name: "A", ownerGithubUsername: "owner-a" });
    const ta = await createTeamByName({ name: "A team", eventId: a.id });
    const configA = { push: 1, pull_request_opened: 2, pull_request_merged: 3, issue_closed: 2, review: 2 };
    await saveScoreConfig(configA, a.id);
    const b = await createEvent({ name: "B", ownerGithubUsername: "owner-b" });
    const tb = await createTeamByName({ name: "B team", eventId: b.id });
    const configB = { push: 4, pull_request_opened: 5, pull_request_merged: 6, issue_closed: 7, review: 8 };
    await saveScoreConfig(configB, b.id);
    for (const type of ACTIVITY_TYPES) {
      expect((await recordActivity({ type, teamId: ta.id }))?.score_delta).toBe(configA[type]);
      expect((await recordActivity({ type, teamId: tb.id }))?.score_delta).toBe(configB[type]);
    }
    const beforeB = await getHackVerseState(b.id);
    expect(beforeB.teams[0].score).toBe(30);
    expect((await getHackVerseState(a.id)).teams[0].score).toBe(10);
    const result = await saveScoreConfig({ ...configA, push: 9 }, a.id);
    expect(result.updatedTeams).toBe(1);
    expect((await getHackVerseState(a.id)).teams[0].score).toBe(18);
    const afterB = await getHackVerseState(b.id);
    expect(afterB.teams[0].score).toBe(30);
    expect(afterB.activities.map((activity) => activity.score_delta)).toEqual(beforeB.activities.map((activity) => activity.score_delta));
    expect((await recordActivity({ type: "push", teamId: tb.id }))?.score_delta).toBe(4);
  });
  it("applies the event's configured points to push, PR, issue, and review activities", async () => {
    const event = await createEvent({
      name: "Scoring event",
      ownerGithubUsername: "scoring-owner"
    });
    const team = await createTeamByName({
      name: "Scoring team",
      eventId: event.id
    });

    await saveScoreConfig(
      {
        push: 3,
        pull_request_opened: 7,
        pull_request_merged: 11,
        issue_closed: 13,
        review: 17
      },
      event.id
    );

    const activities = [
      { type: "push" as const, metadata: { commitCount: 2, commitSha: "score-push" } },
      { type: "pull_request_opened" as const, metadata: { number: 1 } },
      { type: "pull_request_merged" as const, metadata: { number: 1 } },
      { type: "issue_closed" as const, metadata: { number: 2 } },
      { type: "review" as const, metadata: { number: 1 } }
    ];

    const recorded = [];
    for (const activity of activities) {
      recorded.push(
        await recordActivity({
          type: activity.type,
          teamId: team.id,
          metadata: activity.metadata
        })
      );
    }

    expect(recorded.map((activity) => activity?.score_delta)).toEqual([3, 7, 11, 13, 17]);

    const state = await getHackVerseState(event.id);
    const scoredTeam = state.teams.find((candidate) => candidate.id === team.id);
    expect(scoredTeam?.score).toBe(51);
    expect(scoredTeam?.commit_count).toBe(2);
  });

  it("keeps scoring isolated when another event has different points", async () => {
    const firstEvent = await createEvent({
      name: "First scoring event",
      ownerGithubUsername: "first-owner"
    });
    const firstTeam = await createTeamByName({ name: "First team", eventId: firstEvent.id });

    await saveScoreConfig({ push: 1 }, firstEvent.id);
    await recordActivity({
      type: "push",
      teamId: firstTeam.id,
      metadata: { commitCount: 1, commitSha: "first-before-second-event" }
    });

    const secondEvent = await createEvent({
      name: "Second scoring event",
      ownerGithubUsername: "second-owner"
    });
    const secondTeam = await createTeamByName({ name: "Second team", eventId: secondEvent.id });
    await saveScoreConfig({ push: 9 }, secondEvent.id);

    const firstActivity = await recordActivity({
      type: "push",
      teamId: firstTeam.id,
      metadata: { commitCount: 1, commitSha: "first-after-second-event" }
    });
    const secondActivity = await recordActivity({
      type: "push",
      teamId: secondTeam.id,
      metadata: { commitCount: 1, commitSha: "second-event-push" }
    });

    expect(firstActivity?.score_delta).toBe(1);
    expect(secondActivity?.score_delta).toBe(9);

    const firstState = await getHackVerseState(firstEvent.id);
    const secondState = await getHackVerseState(secondEvent.id);
    expect(firstState.teams.find((team) => team.id === firstTeam.id)?.score).toBe(2);
    expect(secondState.teams.find((team) => team.id === secondTeam.id)?.score).toBe(9);
  });

  it("fans out one repository webhook to the matching team in each event", async () => {
    const firstEvent = await createEvent({
      name: "Shared repository event A",
      ownerGithubUsername: "shared-owner-a"
    });
    const firstTeam = await createTeamByName({ name: "Shared A", eventId: firstEvent.id });
    await setTeamRepo({ teamId: firstTeam.id, githubRepo: "shared/example" });
    await saveScoreConfig({ push: 1 }, firstEvent.id);

    const secondEvent = await createEvent({
      name: "Shared repository event B",
      ownerGithubUsername: "shared-owner-b"
    });
    const secondTeam = await createTeamByName({ name: "Shared B", eventId: secondEvent.id });
    await setTeamRepo({ teamId: secondTeam.id, githubRepo: "SHARED/example" });
    await saveScoreConfig({ push: 7 }, secondEvent.id);

    const recorded = await recordRepositoryActivity({
      type: "push",
      githubRepo: "shared/example",
      githubDeliveryId: "shared-delivery",
      metadata: { commitCount: 1, commitSha: "shared-sha" }
    });
    expect(recorded).toHaveLength(2);

    // GitHubの再送は各イベントとも二重加点しない。
    await recordRepositoryActivity({
      type: "push",
      githubRepo: "shared/example",
      githubDeliveryId: "shared-delivery",
      metadata: { commitCount: 1, commitSha: "shared-sha" }
    });

    const firstState = await getHackVerseState(firstEvent.id);
    const secondState = await getHackVerseState(secondEvent.id);
    expect(firstState.teams.find((team) => team.id === firstTeam.id)?.score).toBe(1);
    expect(secondState.teams.find((team) => team.id === secondTeam.id)?.score).toBe(7);
  });
});
