import { Trophy } from "lucide-react";
import { Panel } from "@/components/panel";
import type { Team } from "@/lib/types";

export function RankingPanel({
  teams,
  myTeamId = null
}: {
  teams: Team[];
  myTeamId?: string | null;
}) {
  const topScore = Math.max(...teams.map((team) => team.score), 1);

  return (
    <Panel
      title="ランキング"
      description="コミットやPRの数から計算したスコア順です。"
    >
      <ol className="space-y-2">
        {teams.map((team, index) => {
          const isMine = team.id === myTeamId;
          return (
          <li
            key={team.id}
            className={`grid grid-cols-[2rem_minmax(0,1fr)_auto] items-center gap-3 rounded-xl border p-3 ${
              isMine
                ? "border-pulse/40 bg-pulse/5 shadow-card"
                : index === 0
                  ? "border-sun/30 bg-sun/5 shadow-card"
                  : "border-line/70 bg-surface shadow-soft"
            }`}
          >
            <span
              className={`grid size-8 place-items-center rounded-xl text-sm font-bold ${
                index === 0
                  ? "bg-sun/15 text-sun shadow-soft"
                  : "bg-paper2 text-muted shadow-inset"
              }`}
            >
              {index === 0 ? <Trophy className="size-4" /> : index + 1}
            </span>
            <div className="min-w-0">
              <p className="flex items-center gap-1.5 truncate text-sm font-bold text-ink">
                {team.name}
                {isMine && (
                  <span className="shrink-0 rounded-full bg-pulse/15 px-1.5 py-0.5 text-[10px] font-medium text-pulse">
                    自分
                  </span>
                )}
              </p>
              <p className="truncate text-xs text-muted">
                {team.commit_count} コミット
              </p>
            </div>
            <div className="text-right">
              <p className="font-mono text-base font-bold text-ink">{team.score}</p>
              <p className="text-xs text-muted">
                {index === 0 ? "1位" : `1位まで ${topScore - team.score}`}
              </p>
            </div>
          </li>
          );
        })}
      </ol>
    </Panel>
  );
}
