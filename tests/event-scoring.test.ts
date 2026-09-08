import { describe, expect, it } from "vitest";
import {
  createEvent,
  createTeamByName,
  getHackVerseState,
  recordActivity,
  saveScoreConfig
} from "@/lib/store";

describe("event activity scoring", () => {
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
});
