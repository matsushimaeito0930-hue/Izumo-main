import { OnboardingClient } from "@/components/onboarding-client";
import { getTeamInvites } from "@/lib/store";

export const dynamic = "force-dynamic";

export default async function Page() {
  const invites = await getTeamInvites();

  return <OnboardingClient initialInvites={invites} />;
}
