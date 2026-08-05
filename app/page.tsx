import { OnboardingClient } from "@/components/onboarding-client";
import { getAuthStatus } from "@/lib/session";
import { getEvent, getHackVerseState, getTeamInvites } from "@/lib/store";

export const dynamic = "force-dynamic";

export default async function Page() {
  const [invites, state, hackEvent] = await Promise.all([
    getTeamInvites(),
    getHackVerseState(),
    getEvent()
  ]);
  const { isConfigured, identity } = getAuthStatus();

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
