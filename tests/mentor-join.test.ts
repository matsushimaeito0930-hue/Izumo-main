import { describe, expect, it } from "vitest";
import { joinMentorByCode, saveEvent } from "@/lib/store";

describe("mentor onboarding", () => {
  it("registers a mentor with an event invite code and specialty", async () => {
    const event = await saveEvent({ name: "Mentor Test Event" });

    const session = await joinMentorByCode({
      code: event.join_code.toLowerCase(),
      displayName: "Mentor Test",
      specialty: "Next.js",
      githubUsername: "mentor-test"
    });

    expect(session.role).toBe("mentor");
    expect(session.displayName).toBe("Mentor Test");
    expect(session.specialty).toBe("Next.js");
    expect(session.teamId).toBeUndefined();
  });

  it("rejects an incorrect invite code", async () => {
    await saveEvent({ name: "Mentor Test Event 2" });

    await expect(
      joinMentorByCode({
        code: "WRONG-CODE",
        displayName: "Mentor Test",
        specialty: "UI design",
        githubUsername: "mentor-test-invalid"
      })
    ).rejects.toThrow("招待コードが違います");
  });
});
