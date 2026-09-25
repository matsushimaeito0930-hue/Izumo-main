import { describe, expect, it } from "vitest";
import {
  createChatMessage,
  createEvent,
  createTeamByName,
  getHackVerseState,
  joinTeamByName
} from "@/lib/store";

describe("event state privacy", () => {
  it("only returns the participant's team chat and event announcements", async () => {
    const event = await createEvent({
      name: "Private team chat event",
      ownerGithubUsername: "chat-owner"
    });
    const first = await createTeamByName({ name: "Chat A", eventId: event.id });
    const second = await createTeamByName({ name: "Chat B", eventId: event.id });
    await joinTeamByName({
      teamName: first.name,
      displayName: "First member",
      githubUsername: "chat-first"
    });

    await createChatMessage({
      channel: "staff",
      eventId: event.id,
      teamId: first.id,
      authorName: "First member",
      authorRole: "participant",
      body: "first-team-only"
    });
    await createChatMessage({
      channel: "staff",
      eventId: event.id,
      teamId: second.id,
      authorName: "Second member",
      authorRole: "participant",
      body: "second-team-only"
    });
    await createChatMessage({
      channel: "staff",
      eventId: event.id,
      authorName: "Operator",
      authorRole: "admin",
      body: "public-announcement"
    });

    const participant = await getHackVerseState(event.id, {
      githubUsername: "chat-first",
      role: "participant"
    });
    expect(participant.messages.map((message) => message.body)).toEqual([
      "first-team-only",
      "public-announcement"
    ]);

    const judge = await getHackVerseState(event.id, {
      githubUsername: "chat-judge",
      role: "judge"
    });
    expect(judge.messages.map((message) => message.body)).toEqual(["public-announcement"]);

    const operator = await getHackVerseState(event.id, {
      githubUsername: "chat-owner",
      role: "admin"
    });
    expect(operator.messages).toHaveLength(3);
  });
});
