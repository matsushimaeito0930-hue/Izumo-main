import { beforeEach, expect, it, vi } from "vitest";
const mocks = vi.hoisted(() => ({ owner: vi.fn(), membership: vi.fn(), joined: vi.fn() }));
vi.mock("@/lib/session", () => ({ getCurrentIdentity: () => ({ login: "alice", displayName: "Alice", role: "admin" }) }));
vi.mock("@/lib/github-auth", () => ({ SESSION_COOKIE: "auth", SESSION_MAX_AGE: 3600, serializeIdentity: JSON.stringify }));
vi.mock("@/lib/store", () => ({
  isEventOwner: mocks.owner,
  getMembershipInEvent: mocks.membership,
  getEventsJoinedBy: mocks.joined,
  getEvent: async (id: string) => ({ id, name: "Event" })
}));
import { POST } from "@/app/api/events/activate/route";
beforeEach(() => {
  mocks.owner.mockResolvedValue(false);
  mocks.membership.mockResolvedValue(null);
  mocks.joined.mockResolvedValue([]);
});
function activate(role: string) {
  return POST(new Request("http://localhost/api/events/activate", { method: "POST", body: JSON.stringify({ eventId: "event-b", role }) }));
}
it("switches an organizer to their participant team without inheriting admin", async () => {
  mocks.owner.mockResolvedValue(true);
  mocks.membership.mockResolvedValue({ teamId: "team-b", teamName: "B" });
  mocks.joined.mockResolvedValue([{ id: "event-b", role: "participant" }]);
  const response = await activate("participant");
  expect((await response.json()).session).toMatchObject({ role: "participant", eventId: "event-b", teamId: "team-b" });
  expect(JSON.parse(response.cookies.get("auth")!.value).role).toBe("participant");
});
it("rejects switching to an event without membership", async () => {
  expect((await activate("participant")).status).toBe(403);
});
it("does not let a participant request organizer privileges", async () => {
  mocks.membership.mockResolvedValue({ teamId: "team-b", teamName: "B" });
  mocks.joined.mockResolvedValue([{ id: "event-b", role: "participant" }]);
  expect((await activate("admin")).status).toBe(403);
});
it("opens a mentor event only when that event grants mentor membership", async () => {
  mocks.joined.mockResolvedValue([{ id: "event-b", role: "mentor" }]);
  const response = await activate("mentor");
  expect((await response.json()).session).toMatchObject({ role: "mentor", eventId: "event-b" });
  expect(JSON.parse(response.cookies.get("auth")!.value).role).toBe("mentor");
});
it("does not let a judge claim mentor privileges", async () => {
  mocks.joined.mockResolvedValue([{ id: "event-b", role: "judge" }]);
  expect((await activate("mentor")).status).toBe(403);
});
