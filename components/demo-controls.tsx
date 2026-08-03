"use client";

import { useState } from "react";
import {
  GitCommitHorizontal,
  GitMerge,
  GitPullRequest,
  LoaderCircle,
  Rocket,
  Wand2
} from "lucide-react";
import type { ActivityType, Team } from "@/lib/types";

const demoButtons: Array<{
  type: ActivityType;
  label: string;
  icon: React.ComponentType<{ className?: string }>;
}> = [
  { type: "push", label: "コミット +1", icon: GitCommitHorizontal },
  { type: "pull_request_opened", label: "PR作成", icon: GitPullRequest },
  { type: "pull_request_merged", label: "PRマージ", icon: GitMerge },
  { type: "issue_closed", label: "Issue解決", icon: Rocket }
];

/**
 * 審査デモ用の擬似イベント。参加者の視界に入らないよう、
 * 普段はボタン1つに畳んでおく。ENABLE_DEMO_MODE=false なら描画しない。
 */
export function DemoControls({
  teams,
  onTrigger
}: {
  teams: Team[];
  onTrigger: (teamId: string, type: ActivityType) => Promise<void>;
}) {
  const [isOpen, setIsOpen] = useState(false);
  const [teamId, setTeamId] = useState(teams[0]?.id ?? "");
  const [busyType, setBusyType] = useState<ActivityType | null>(null);

  return (
    <div className="relative">
      <button
        type="button"
        onClick={() => setIsOpen((current) => !current)}
        aria-expanded={isOpen}
        className="flex h-8 items-center gap-1.5 rounded-xl border border-line bg-surface px-2.5 text-xs font-medium text-muted shadow-soft transition-[box-shadow,color,transform] hover:text-ink active:translate-y-px active:shadow-pressed"
      >
        <Wand2 className="size-3.5" />
        デモ
      </button>

      {isOpen && (
        <div className="absolute right-0 top-10 z-20 w-64 rounded-2xl border border-line/70 bg-surface p-4 shadow-card">
          <p className="text-xs leading-5 text-muted">
            GitHub連携なしで動きを見せるための擬似イベントです。
          </p>

          <select
            value={teamId}
            onChange={(event) => setTeamId(event.target.value)}
            className="mt-3 h-9 w-full rounded-xl border border-line bg-paper px-2 text-sm text-ink shadow-inset outline-none focus:border-pulse"
          >
            {teams.map((team) => (
              <option key={team.id} value={team.id}>
                {team.name}
              </option>
            ))}
          </select>

          <div className="mt-2 grid grid-cols-2 gap-2">
            {demoButtons.map((button) => {
              const Icon = button.icon;
              const isBusy = busyType === button.type;
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
                  className="flex h-9 items-center justify-center gap-1.5 rounded-xl border border-line bg-surface px-2 text-xs font-medium text-ink2 shadow-soft transition-[box-shadow,color,transform] hover:text-pulse active:translate-y-px active:shadow-pressed disabled:opacity-45"
                >
                  {isBusy ? (
                    <LoaderCircle className="size-3.5 animate-spin" />
                  ) : (
                    <Icon className="size-3.5" />
                  )}
                  {button.label}
                </button>
              );
            })}
          </div>
        </div>
      )}
    </div>
  );
}
