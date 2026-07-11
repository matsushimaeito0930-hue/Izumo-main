import { DashboardClient } from "@/components/dashboard-client";
import { Shell } from "@/components/shell";
import { getHackVerseState } from "@/lib/store";

export const dynamic = "force-dynamic";

export default async function RankingPage() {
  const state = await getHackVerseState();

  return (
    <Shell>
      <div className="mb-5">
        <p className="text-xs font-black uppercase tracking-[0.2em] text-sun">
          Ranking
        </p>
        <h1 className="mt-2 text-3xl font-black text-white">Momentum Scoreboard</h1>
      </div>
      <DashboardClient initialState={state} view="ranking" />
    </Shell>
  );
}
