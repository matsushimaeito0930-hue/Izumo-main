import { OnboardingClient } from "@/components/onboarding-client";
import { getAuthStatus } from "@/lib/session";
import { getEvent, getEventsOwnedBy, getHackVerseState, getTeamInvites } from "@/lib/store";

export const dynamic = "force-dynamic";

export default async function Page() {
  const { isConfigured, identity } = getAuthStatus();
  const [invites, state, hackEvent, ownedEvents] = await Promise.all([
    // チームの部屋番号は運営だけが一覧で確認できるようにする。
    identity?.role === "admin" ? getTeamInvites(identity.eventId) : Promise.resolve([]),
    getHackVerseState(identity?.eventId),
    getEvent(identity?.eventId),
    getEventsOwnedBy(identity?.login)
  ]);

  return (
    <OnboardingClient
      initialInvites={invites}
      initialEvent={hackEvent}
      initialTeams={state.teams}
      // 所属の直しは運営だけの操作なので、他の役割には渡さない。
      initialMembers={identity?.role === "admin" ? state.members : []}
      ownedEvents={ownedEvents}
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
