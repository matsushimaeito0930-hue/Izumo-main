import { DashboardClient } from "@/components/dashboard-client";
import { Shell } from "@/components/shell";
import { isDemoModeEnabled } from "@/lib/env";
import { getAuthStatus } from "@/lib/session";
import { getHackVerseState } from "@/lib/store";

export const dynamic = "force-dynamic";

export default async function DashboardPage() {
  const state = await getHackVerseState();
  const { identity } = getAuthStatus();
  const viewer = identity
    ? {
        login: identity.login,
        displayName: identity.displayName,
        role: identity.role
      }
    : null;

  return (
    <Shell>
      <DashboardClient
        initialState={state}
        view="dashboard"
        viewer={viewer}
        demoEnabled={isDemoModeEnabled()}
      />
    </Shell>
  );
}
