import { describe, expect, it } from "vitest";
import {
  createDirectMessage,
  createTeamByName,
  getDirectMessageContacts,
  getDirectMessages,
  joinMentorByCode,
  joinTeamByName,
  saveEvent
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
      recipientLogin: "dm-mentor",
      body: "レビューをお願いできますか？"
    });

    expect(await getDirectMessages("dm-mentor")).toHaveLength(1);
    expect(await getDirectMessages("dm-participant")).toHaveLength(1);
    expect(await getDirectMessages("someone-else")).toHaveLength(0);
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
});
