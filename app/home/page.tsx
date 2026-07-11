import { DashboardClient } from "@/components/dashboard-client";
import { Shell } from "@/components/shell";
import { getHackVerseState } from "@/lib/store";

export const dynamic = "force-dynamic";

export default async function HomePage() {
  const state = await getHackVerseState();

  return (
    <Shell>
      <div className="mb-5">
        <p className="text-xs font-black uppercase tracking-[0.2em] text-pulse">Home</p>
        <h1 className="mt-2 text-3xl font-black text-white">Team Growth</h1>
      </div>
      <DashboardClient initialState={state} view="home" />
    </Shell>
  );
}
