import { Building2, SignalHigh } from "lucide-react";
import { getNextHouseLevel, getPointsToNextLevel } from "@/lib/house";
import { HOUSE_LEVELS } from "@/lib/constants";
import type { Team } from "@/lib/types";

export function TeamHouseCard({ team }: { team: Team }) {
  const nextLevel = getNextHouseLevel(team.score);
  const points = getPointsToNextLevel(team.score);
  const currentLevel = HOUSE_LEVELS[team.house_level - 1];
  const progress = nextLevel
    ? Math.min(100, Math.round((team.score / nextLevel.minScore) * 100))
    : 100;

  return (
    <section className="rounded-lg border border-pulse/20 bg-white/[0.045] p-5 shadow-neon">
      <div className="flex items-start justify-between gap-4">
        <div>
          <p className="text-xs font-black uppercase tracking-[0.18em] text-pulse">
            Current Team Lab
          </p>
          <h1 className="mt-2 text-3xl font-black text-white">{team.name}</h1>
          <p className="mt-1 text-sm text-white/55">{team.github_repo}</p>
        </div>
        <div className="grid size-16 place-items-center rounded-md border border-pulse/35 bg-pulse/10 text-pulse">
          {team.house_level >= 4 ? (
            <SignalHigh className="size-8" />
          ) : (
            <Building2 className="size-8" />
          )}
        </div>
      </div>

      <div className="mt-6 grid gap-3 sm:grid-cols-3">
        <div className="rounded-md border border-white/10 bg-void/45 p-3">
          <p className="text-xs text-white/45">Momentum Score</p>
          <p className="text-3xl font-black text-sun">{team.score}</p>
        </div>
        <div className="rounded-md border border-white/10 bg-void/45 p-3">
          <p className="text-xs text-white/45">Lab Level</p>
          <p className="text-3xl font-black text-pulse">{team.house_level}</p>
        </div>
        <div className="rounded-md border border-white/10 bg-void/45 p-3">
          <p className="text-xs text-white/45">Commits</p>
          <p className="text-3xl font-black text-field">{team.commit_count}</p>
        </div>
      </div>

      <div className="mt-5">
        <p className="mb-2 text-sm font-bold text-white/80">
          {currentLevel?.label} <span className="text-white/40">/ {currentLevel?.englishLabel}</span>
        </p>
        <div className="mb-2 flex items-center justify-between text-xs text-white/55">
          <span>
            {nextLevel
              ? `${points} pts to Level ${nextLevel.level}`
              : "Max level reached"}
          </span>
          <span>{progress}%</span>
        </div>
        <div className="h-3 overflow-hidden rounded bg-white/10">
          <div
            className="h-full rounded bg-gradient-to-r from-pulse via-sun to-hot"
            style={{ width: `${progress}%` }}
          />
        </div>
      </div>
    </section>
  );
}
