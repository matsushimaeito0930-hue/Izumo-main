import { redirect } from "next/navigation";
import { DashboardClient } from "@/components/dashboard-client";
import { Shell } from "@/components/shell";
import { isDemoModeEnabled } from "@/lib/env";
import { getAuthStatus } from "@/lib/session";
import { getHackVerseState } from "@/lib/store";

export const dynamic = "force-dynamic";

export default async function DashboardPage() {
  const { isConfigured, identity } = await getAuthStatus();
  if (isConfigured && (!identity || !identity.eventId)) redirect("/");
  const state = await getHackVerseState(
    identity?.eventId,
    identity ? { githubUsername: identity.login, role: identity.role } : undefined
  );
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
