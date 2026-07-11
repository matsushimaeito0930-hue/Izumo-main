import { DashboardClient } from "@/components/dashboard-client";
import { Shell } from "@/components/shell";
import { getHackVerseState } from "@/lib/store";

export const dynamic = "force-dynamic";

export default async function Page() {
  const state = await getHackVerseState();

  return (
    <Shell>
      <DashboardClient initialState={state} view="lobby" />
    </Shell>
  );
}
