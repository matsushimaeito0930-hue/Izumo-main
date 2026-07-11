import { createHmac } from "node:crypto";
import { describe, expect, it } from "vitest";
import { parseGitHubWebhook, verifyGitHubSignature } from "@/lib/github";

describe("github webhook parsing", () => {
  it("verifies the sha256 GitHub signature", () => {
    const secret = "test-secret";
    const body = JSON.stringify({ ok: true });
    const signature = `sha256=${createHmac("sha256", secret)
      .update(body)
      .digest("hex")}`;

    expect(verifyGitHubSignature({ body, signature, secret })).toBe(true);
    expect(
      verifyGitHubSignature({ body, signature: "sha256=bad", secret })
    ).toBe(false);
  });

  it("converts a push payload to a momentum activity", () => {
    const activity = parseGitHubWebhook("push", {
      repository: {
        full_name: "owner/hackverse",
        name: "hackverse"
      },
      commits: [{ id: "1" }, { id: "2" }, { id: "3" }]
    });

    expect(activity).toEqual({
      type: "push",
      githubRepo: "owner/hackverse",
      fallbackTeamName: "Hackverse",
      metadata: {
        commitCount: 3
      }
    });
  });

  it("ignores a push payload with no commits", () => {
    expect(
      parseGitHubWebhook("push", {
        repository: {
          full_name: "owner/hackverse",
          name: "hackverse"
        },
        commits: []
      })
    ).toBeNull();
  });

  it("ignores a pull request close that was not merged", () => {
    expect(
      parseGitHubWebhook("pull_request", {
        action: "closed",
        repository: {
          full_name: "owner/hackverse",
          name: "hackverse"
        },
        pull_request: {
          merged: false,
          number: 4
        }
      })
    ).toBeNull();
  });
});
