import { OnboardingClient } from "@/components/onboarding-client";
import { getAuthStatus } from "@/lib/session";
import {
  getEvent,
  getEventsJoinedBy,
  getEventsOwnedBy,
  getHackVerseState,
  getTeamInvites
} from "@/lib/store";

export const dynamic = "force-dynamic";

export default async function Page() {
  const { isConfigured, identity } = await getAuthStatus();
  const [invites, state, hackEvent, ownedEvents, joinedEvents] = await Promise.all([
    // チームの部屋番号は運営だけが一覧で確認できるようにする。
    identity?.role === "admin" && identity.eventId ? getTeamInvites(identity.eventId) : Promise.resolve([]),
    identity?.eventId || !isConfigured ? getHackVerseState(identity?.eventId) : Promise.resolve({ teams: [], members: [] }),
    identity?.eventId || !isConfigured ? getEvent(identity?.eventId) : Promise.resolve(null),
    getEventsOwnedBy(identity?.login),
    getEventsJoinedBy(identity?.login)
  ]);

  return (
    <OnboardingClient
      key={`${identity?.login ?? "guest"}:${identity?.eventId ?? "none"}:${identity?.role ?? "none"}`}
      initialInvites={invites}
      initialEvent={hackEvent}
      initialTeams={state.teams}
      // 所属の直しは運営だけの操作なので、他の役割には渡さない。
      initialMembers={identity?.role === "admin" ? state.members : []}
      ownedEvents={ownedEvents}
      joinedEvents={joinedEvents}
      authConfigured={isConfigured}
      viewer={
        identity
          ? {
              login: identity.login,
              displayName: identity.displayName,
              avatarUrl: identity.avatarUrl,
              role: identity.role
            }
          : null
      }
    />
  );
}
