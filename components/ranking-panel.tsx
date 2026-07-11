import { ArrowDown, ArrowUp, Minus, Trophy } from "lucide-react";
import { Panel } from "@/components/panel";
import type { Team } from "@/lib/types";

function rankIcon(index: number) {
  if (index === 0) {
    return <ArrowUp className="size-4 text-field" />;
  }
  if (index === 1) {
    return <Minus className="size-4 text-sun" />;
  }
  return <ArrowDown className="size-4 text-hot" />;
}

export function RankingPanel({ teams }: { teams: Team[] }) {
  return (
    <Panel title="Momentum Ranking">
      <div className="space-y-3">
        {teams.map((team, index) => (
          <div
            key={team.id}
            className="grid grid-cols-[2.5rem_1fr_auto] items-center gap-3 rounded-md border border-white/10 bg-white/[0.045] p-3"
          >
            <div className="grid size-10 place-items-center rounded-md bg-sun/10 text-sm font-black text-sun">
              {index === 0 ? <Trophy className="size-5" /> : index + 1}
            </div>
            <div className="min-w-0">
              <p className="truncate text-sm font-black text-white">{team.name}</p>
              <p className="text-xs text-white/50">
                Level {team.house_level} / {team.commit_count} commits
              </p>
              <p className="truncate text-xs text-white/35">{team.github_repo}</p>
            </div>
            <div className="flex items-center gap-3">
              <div className="text-right">
                <p className="text-base font-black text-pulse">{team.score}</p>
                <p className="text-xs text-white/45">score</p>
              </div>
              {rankIcon(index)}
            </div>
          </div>
        ))}
      </div>
    </Panel>
  );
}
