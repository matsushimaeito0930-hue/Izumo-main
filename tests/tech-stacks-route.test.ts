import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  identity: vi.fn(),
  state: vi.fn(),
  membership: vi.fn(),
  inspect: vi.fn()
}));

vi.mock("@/lib/session", () => ({ getCurrentIdentity: mocks.identity }));
vi.mock("@/lib/store", () => ({
  getHackVerseState: mocks.state,
  getMembershipInEvent: mocks.membership
}));
vi.mock("@/lib/github-tech-stack", () => ({
  inspectGitHubRepoTechStack: mocks.inspect
}));

import { GET } from "@/app/api/tech-stacks/route";

const teams = [
  { id: "team-own", name: "Own", github_repo: "demo/own" },
  { id: "team-other", name: "Other", github_repo: "demo/other" }
];

beforeEach(() => {
  vi.clearAllMocks();
  mocks.identity.mockResolvedValue({
    login: "participant",
    displayName: "Participant",
    role: "participant",
    eventId: "event-1"
  });
  mocks.state.mockResolvedValue({ teams });
  mocks.membership.mockResolvedValue({ teamId: "team-own", teamName: "Own" });
  mocks.inspect.mockImplementation(async (repo: string) => ({
    repo,
    frameworks: [],
    languages: [],
    scannedAt: "2026-09-22T00:00:00.000Z",
    status: "ready"
  }));
});

describe("tech stack API access", () => {
  it("returns only the participant's own team", async () => {
    const response = await GET(new Request("http://localhost/api/tech-stacks"));
    expect(response.status).toBe(200);
    expect(await response.json()).toMatchObject({
      scope: "own",
      stacks: [expect.objectContaining({ teamId: "team-own", repo: "demo/own" })]
    });
    expect(mocks.inspect).toHaveBeenCalledTimes(1);
    expect(mocks.inspect).toHaveBeenCalledWith("demo/own", undefined, { forceRefresh: false });
  });

  it("returns all teams to a judge", async () => {
    mocks.identity.mockResolvedValue({
      login: "judge",
      displayName: "Judge",
      role: "judge",
      eventId: "event-1"
    });

    const response = await GET(new Request("http://localhost/api/tech-stacks"));
    expect(response.status).toBe(200);
    const payload = await response.json();
    expect(payload.scope).toBe("all");
    expect(payload.stacks).toHaveLength(2);
    expect(mocks.membership).not.toHaveBeenCalled();
  });
});
