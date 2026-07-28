import { ArrowDown, ArrowUp, Minus, Trophy } from "lucide-react";
import { Panel } from "@/components/panel";
import type { Team } from "@/lib/types";

function rankIcon(index: number) {
  if (index === 0) return <ArrowUp className="size-4 text-field" />;
  if (index === 1) return <Minus className="size-4 text-sun" />;
  return <ArrowDown className="size-4 text-hot" />;
}

export function RankingPanel({ teams }: { teams: Team[] }) {
  return (
    <Panel
      title="Momentum Ranking"
      action={<span className="font-mono text-xs text-white/35">{teams.length} teams</span>}
    >
      <div className="space-y-2">
        {teams.map((team, index) => (
          <div
            key={team.id}
            className={`grid grid-cols-[2.25rem_minmax(0,1fr)_auto] items-center gap-3 rounded-md border p-3 transition-colors ${
              index === 0
                ? "border-sun/30 bg-sun/[0.06]"
                : "border-white/10 bg-white/[0.035] hover:border-pulse/25"
            }`}
          >
            <div className={`grid size-9 place-items-center rounded-md text-sm font-black ${index === 0 ? "bg-sun/15 text-sun" : "bg-white/[0.06] text-white/55"}`}>
              {index === 0 ? <Trophy className="size-4" /> : index + 1}
            </div>
            <div className="min-w-0">
              <p className="truncate text-sm font-black text-white">{team.name}</p>
              <p className="truncate text-xs text-white/45">
                {team.commit_count} commits / Lab Level {team.house_level}
              </p>
            </div>
            <div className="flex items-center gap-2">
              <div className="text-right">
                <p className="font-mono text-base font-black text-pulse">{team.score}</p>
                <p className="text-[10px] uppercase tracking-[0.12em] text-white/35">score</p>
              </div>
              {rankIcon(index)}
            </div>
          </div>
        ))}
      </div>
    </Panel>
  );
}
