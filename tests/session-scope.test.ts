import { beforeEach, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  identity: vi.fn(),
  owner: vi.fn(),
  role: vi.fn(),
  team: vi.fn()
}));
vi.mock("next/headers", () => ({
  cookies: async () => ({ get: () => ({ value: "signed-session" }) })
}));
vi.mock("@/lib/github-auth", () => ({
  SESSION_COOKIE: "auth",
  parseIdentity: mocks.identity,
  isGitHubAuthConfigured: () => true
}));
vi.mock("@/lib/store", () => ({
  isEventOwner: mocks.owner,
  getEventMemberRole: mocks.role,
  getMembershipInEvent: mocks.team
}));

import { getCurrentIdentity } from "@/lib/session";

beforeEach(() => {
  mocks.identity.mockReturnValue({ login: "alice", role: "participant", eventId: "event-a" });
  mocks.owner.mockResolvedValue(false);
  mocks.role.mockResolvedValue(null);
  mocks.team.mockResolvedValue(null);
});

it("rejects a stale organizer role outside the event they own", async () => {
  mocks.identity.mockReturnValue({ login: "alice", role: "admin", eventId: "event-b" });
  expect(await getCurrentIdentity()).toMatchObject({ role: "participant", eventId: undefined });
});

it("keeps a participant only while their event role and team membership both exist", async () => {
  mocks.role.mockResolvedValue("participant");
  mocks.team.mockResolvedValue({ teamId: "team-a", teamName: "A" });
  expect(await getCurrentIdentity()).toMatchObject({ role: "participant", eventId: "event-a" });
  mocks.team.mockResolvedValue(null);
  expect(await getCurrentIdentity()).toMatchObject({ role: "participant", eventId: undefined });
});

it("does not carry mentor access into a judge-only event", async () => {
  mocks.identity.mockReturnValue({ login: "alice", role: "mentor", eventId: "event-b" });
  mocks.role.mockResolvedValue("judge");
  expect(await getCurrentIdentity()).toMatchObject({ role: "participant", eventId: undefined });
});
