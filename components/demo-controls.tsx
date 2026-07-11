"use client";

import { useState } from "react";
import { GitMerge, GitPullRequest, Rocket, Send } from "lucide-react";
import { Panel } from "@/components/panel";
import type { ActivityType, Team } from "@/lib/types";

const demoButtons: Array<{
  type: ActivityType;
  label: string;
  icon: React.ComponentType<{ className?: string }>;
}> = [
  { type: "push", label: "Push +1", icon: Send },
  { type: "pull_request_opened", label: "PR Open", icon: GitPullRequest },
  { type: "pull_request_merged", label: "PR Merge", icon: GitMerge },
  { type: "issue_closed", label: "Issue Close", icon: Rocket }
];

export function DemoControls({
  teams,
  onTrigger
}: {
  teams: Team[];
  onTrigger: (teamId: string, type: ActivityType) => Promise<void>;
}) {
  const [teamId, setTeamId] = useState(teams[0]?.id ?? "");
  const [busyType, setBusyType] = useState<ActivityType | null>(null);

  return (
    <Panel title="Demo Mode">
      <div className="space-y-3">
        <label className="block">
          <span className="mb-2 block text-xs font-bold uppercase tracking-[0.14em] text-white/55">
            Target Team
          </span>
          <select
            value={teamId}
            onChange={(event) => setTeamId(event.target.value)}
            className="h-10 w-full rounded-md border border-white/10 bg-void px-3 text-sm font-bold text-white outline-none transition focus:border-pulse"
          >
            {teams.map((team) => (
              <option key={team.id} value={team.id}>
                {team.name}
              </option>
            ))}
          </select>
        </label>

        <div className="grid grid-cols-2 gap-2">
          {demoButtons.map((button) => {
            const Icon = button.icon;
            return (
              <button
                key={button.type}
                type="button"
                disabled={!teamId || busyType !== null}
                onClick={async () => {
                  setBusyType(button.type);
                  try {
                    await onTrigger(teamId, button.type);
                  } finally {
                    setBusyType(null);
                  }
                }}
                className="flex h-11 items-center justify-center gap-2 rounded-md border border-pulse/30 bg-pulse/10 px-3 text-sm font-black text-pulse transition hover:border-pulse hover:bg-pulse/18 disabled:cursor-not-allowed disabled:opacity-45"
              >
                <Icon className="size-4" />
                <span>{busyType === button.type ? "Sending" : button.label}</span>
              </button>
            );
          })}
        </div>
      </div>
    </Panel>
  );
}
