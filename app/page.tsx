import { OnboardingClient } from "@/components/onboarding-client";
import { getAuthStatus } from "@/lib/session";
import { getHackVerseState, getTeamInvites } from "@/lib/store";

export const dynamic = "force-dynamic";

export default async function Page() {
  const [invites, state] = await Promise.all([getTeamInvites(), getHackVerseState()]);
  const { isConfigured, identity } = getAuthStatus();

  return (
    <OnboardingClient
      initialInvites={invites}
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
