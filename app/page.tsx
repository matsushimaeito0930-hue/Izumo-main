import { OnboardingClient } from "@/components/onboarding-client";
import { getAuthStatus } from "@/lib/session";
import { getEvent, getHackVerseState, getTeamInvites } from "@/lib/store";

export const dynamic = "force-dynamic";

export default async function Page() {
  const { isConfigured, identity } = getAuthStatus();
  const [invites, state, hackEvent] = await Promise.all([
    // チームの部屋番号は運営だけが一覧で確認できるようにする。
    identity?.role === "admin" ? getTeamInvites() : Promise.resolve([]),
    getHackVerseState(),
    getEvent()
  ]);

  return (
    <OnboardingClient
      initialInvites={invites}
      initialEvent={hackEvent}
      initialTeams={state.teams}
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
