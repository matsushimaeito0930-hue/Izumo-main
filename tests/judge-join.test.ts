import { beforeEach, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  eventId: vi.fn(),
  sync: vi.fn(),
  identity: vi.fn()
}));
vi.mock("@/lib/session", () => ({ getCurrentIdentity: mocks.identity }));
vi.mock("@/lib/github-auth", () => ({
  SESSION_COOKIE: "auth",
  SESSION_MAX_AGE: 3600,
  serializeIdentity: JSON.stringify
}));
vi.mock("@/lib/store", () => ({
  getEventIdForAccessCode: mocks.eventId,
  getEvent: async (id: string) => ({ id, name: "Judge event" }),
  getEventsJoinedBy: async () => [],
  isEventOwner: async () => false,
  syncDirectMessageProfile: mocks.sync
}));

import { POST } from "@/app/api/judges/join/route";

beforeEach(() => {
  mocks.identity.mockResolvedValue(null);
  mocks.eventId.mockResolvedValue("judge-event-id");
  mocks.sync.mockResolvedValue(undefined);
});

it("issues a judge session bound to the invited event", async () => {
  const response = await POST(new Request("http://localhost/api/judges/join", {
    method: "POST",
    body: JSON.stringify({ code: "ABCD-2345", displayName: "Reviewer" })
  }));
  expect(response.status).toBe(200);
  expect((await response.json()).session).toMatchObject({
    role: "judge",
    eventId: "judge-event-id",
    eventName: "Judge event"
  });
  expect(JSON.parse(response.cookies.get("auth")!.value)).toMatchObject({
    role: "judge",
    eventId: "judge-event-id"
  });
  expect(mocks.sync).toHaveBeenCalledWith(
    expect.objectContaining({ eventId: "judge-event-id", role: "judge" })
  );
});

it("rejects an invalid invitation without issuing a session", async () => {
  mocks.eventId.mockResolvedValue(undefined);
  const response = await POST(new Request("http://localhost/api/judges/join", {
    method: "POST",
    body: JSON.stringify({ code: "INVALID", displayName: "Reviewer" })
  }));
  expect(response.status).toBe(403);
  expect(response.cookies.get("auth")).toBeUndefined();
});
