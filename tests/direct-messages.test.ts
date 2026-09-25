import { describe, expect, it } from "vitest";
import {
  createDirectMessage,
  createTeamByName,
  getDirectMessageContacts,
  getDirectMessages,
  joinTeamByName,
  saveEvent,
  createEvent,
  syncDirectMessageProfile
} from "@/lib/store";

describe("direct messages", () => {
  it("lets a participant message a registered admin and keeps the thread private", async () => {
    const event = await saveEvent({ name: "DM Test Event" });
    await syncDirectMessageProfile({
      eventId: event.id,
      displayName: "DM Admin",
      githubUsername: "dm-admin",
      avatarUrl: null,
      role: "admin"
    });
    await syncDirectMessageProfile({
      eventId: event.id,
      displayName: "DM Mentor",
      githubUsername: "dm-mentor",
      avatarUrl: null,
      role: "mentor"
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
          github_username: "dm-admin",
          role: "admin"
        })
      ])
    );
    expect(contacts.map((contact) => contact.github_username)).not.toContain("dm-mentor");

    await expect(
      createDirectMessage({
        senderLogin: "dm-participant",
        senderName: "DM Participant",
        senderRole: "participant",
        eventId: event.id,
        recipientLogin: "dm-mentor",
        body: "個別相談"
      })
    ).rejects.toThrow("この相手にはDMを送れません。");

    await createDirectMessage({
      senderLogin: "dm-participant",
      senderName: "DM Participant",
      senderRole: "participant",
      eventId: event.id,
      recipientLogin: "dm-admin",
      body: "レビューをお願いできますか？"
    });

    expect(await getDirectMessages("dm-admin", event.id)).toHaveLength(1);
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
      githubUsername: "event-a-admin",
      displayName: "Event A Admin",
      avatarUrl: null,
      role: "admin"
    });
    await syncDirectMessageProfile({
      eventId: eventB.id,
      githubUsername: "event-b-admin",
      displayName: "Event B Admin",
      avatarUrl: null,
      role: "admin"
    });

    const contacts = await getDirectMessageContacts({
      eventId: eventA.id,
      viewerLogin: "event-a-participant",
      viewerRole: "participant"
    });
    expect(contacts.map((contact) => contact.github_username)).toContain("event-a-admin");
    expect(contacts.map((contact) => contact.github_username)).not.toContain("event-b-admin");

    await expect(
      createDirectMessage({
        eventId: eventA.id,
        senderLogin: "event-a-participant",
        senderName: "Event A Participant",
        senderRole: "participant",
        recipientLogin: "event-b-admin",
        body: "This must not cross events."
      })
    ).rejects.toThrow("この相手にはDMを送れません。");
  });

  it("allows an image-only DM and keeps attachment metadata with the message", async () => {
    const event = await createEvent({ name: "DM attachment event", ownerGithubUsername: "dm-owner-c" });
    await syncDirectMessageProfile({
      eventId: event.id,
      githubUsername: "dm-image-sender",
      displayName: "Image sender",
      avatarUrl: null,
      role: "participant"
    });
    await syncDirectMessageProfile({
      eventId: event.id,
      githubUsername: "dm-image-admin",
      displayName: "Image admin",
      avatarUrl: null,
      role: "admin"
    });

    const message = await createDirectMessage({
      eventId: event.id,
      senderLogin: "dm-image-sender",
      senderName: "Image sender",
      senderRole: "participant",
      recipientLogin: "dm-image-admin",
      body: "",
      attachmentPath: `${event.id}/example.png`,
      attachmentName: "example.png",
      attachmentMimeType: "image/png",
      attachmentSize: 1024
    });

    expect(message.body).toBe("");
    expect(message.attachment_path).toBe(`${event.id}/example.png`);
    expect(message.attachment_mime_type).toBe("image/png");
  });
});
