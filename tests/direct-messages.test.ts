import { describe, expect, it } from "vitest";
import {
  createDirectMessage,
  createTeamByName,
  getDirectMessageContacts,
  getDirectMessages,
  joinMentorByCode,
  joinTeamByName,
  saveEvent,
  createEvent,
  syncDirectMessageProfile
} from "@/lib/store";

describe("direct messages", () => {
  it("lets a participant message a registered mentor and keeps the thread private", async () => {
    const event = await saveEvent({ name: "DM Test Event" });
    await joinMentorByCode({
      code: event.join_code,
      displayName: "DM Mentor",
      specialty: "Next.js",
      githubUsername: "dm-mentor"
    });
    await createTeamByName({ name: "DM Team" });
    await joinTeamByName({
      teamName: "DM Team",
      displayName: "DM Participant",
      githubUsername: "dm-participant"
    });

    const contacts = await getDirectMessageContacts({
      eventId: event.id,
      viewerLogin: "dm-participant",
      viewerRole: "participant"
    });
    expect(contacts).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          github_username: "dm-mentor",
          specialty: "Next.js",
          role: "mentor"
        })
      ])
    );

    await createDirectMessage({
      senderLogin: "dm-participant",
      senderName: "DM Participant",
      senderRole: "participant",
      eventId: event.id,
      recipientLogin: "dm-mentor",
      body: "レビューをお願いできますか？"
    });

    expect(await getDirectMessages("dm-mentor", event.id)).toHaveLength(1);
    expect(await getDirectMessages("dm-participant", event.id)).toHaveLength(1);
    expect(await getDirectMessages("someone-else", event.id)).toHaveLength(0);
  });

  it("does not let a participant DM another participant", async () => {
    await expect(
      createDirectMessage({
        senderLogin: "dm-participant",
        senderName: "DM Participant",
        senderRole: "participant",
        recipientLogin: "someone-else",
        body: "hello"
      })
    ).rejects.toThrow("この相手にはDMを送れません。");
  });

  it("does not expose contacts from a different event", async () => {
    const eventA = await createEvent({ name: "DM event A", ownerGithubUsername: "dm-owner-a" });
    const eventB = await createEvent({ name: "DM event B", ownerGithubUsername: "dm-owner-b" });

    await syncDirectMessageProfile({
      eventId: eventA.id,
      githubUsername: "event-a-participant",
      displayName: "Event A Participant",
      avatarUrl: null,
      role: "participant"
    });
    await syncDirectMessageProfile({
      eventId: eventA.id,
      githubUsername: "event-a-mentor",
      displayName: "Event A Mentor",
      avatarUrl: null,
      role: "mentor"
    });
    await syncDirectMessageProfile({
      eventId: eventB.id,
      githubUsername: "event-b-mentor",
      displayName: "Event B Mentor",
      avatarUrl: null,
      role: "mentor"
    });

    const contacts = await getDirectMessageContacts({
      eventId: eventA.id,
      viewerLogin: "event-a-participant",
      viewerRole: "participant"
    });
    expect(contacts.map((contact) => contact.github_username)).toContain("event-a-mentor");
    expect(contacts.map((contact) => contact.github_username)).not.toContain("event-b-mentor");

    await expect(
      createDirectMessage({
        eventId: eventA.id,
        senderLogin: "event-a-participant",
        senderName: "Event A Participant",
        senderRole: "participant",
        recipientLogin: "event-b-mentor",
        body: "This must not cross events."
      })
    ).rejects.toThrow("この相手にはDMを送れません。");
  });
});
