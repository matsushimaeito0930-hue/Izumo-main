"use client";

import { useState } from "react";
import { AlertTriangle, CheckCircle2, GitMerge, GitPullRequest, LoaderCircle, Rocket, Send } from "lucide-react";
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

type FeedbackState = "idle" | "success" | "error";

export function DemoControls({
  teams,
  onTrigger
}: {
  teams: Team[];
  onTrigger: (teamId: string, type: ActivityType) => Promise<void>;
}) {
  const [teamId, setTeamId] = useState(teams[0]?.id ?? "");
  const [busyType, setBusyType] = useState<ActivityType | null>(null);
  const [feedback, setFeedback] = useState<FeedbackState>("idle");

  return (
    <Panel
      title="Demo Mode"
      action={<span className="font-mono text-xs text-white/35">simulation</span>}
    >
      <div className="space-y-3">
        <label className="block">
          <span className="mb-2 block text-xs font-bold uppercase tracking-[0.14em] text-white/55">
            Target Team
          </span>
          <select
            value={teamId}
            onChange={(event) => setTeamId(event.target.value)}
            className="h-10 w-full rounded-md border border-white/10 bg-void px-3 text-sm font-bold text-white outline-none transition-colors hover:border-white/20 focus:border-pulse"
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
            const isBusy = busyType === button.type;
            return (
              <button
                key={button.type}
                type="button"
                disabled={!teamId || busyType !== null}
                aria-busy={isBusy}
                onClick={async () => {
                  setBusyType(button.type);
                  setFeedback("idle");
                  try {
                    await onTrigger(teamId, button.type);
                    setFeedback("success");
                  } catch {
                    setFeedback("error");
                  } finally {
                    setBusyType(null);
                    window.setTimeout(() => setFeedback("idle"), 1800);
                  }
                }}
                className={`flex h-11 items-center justify-center gap-2 rounded-md border px-3 text-sm font-black transition-[background-color,border-color,transform,opacity] duration-150 hover:-translate-y-px active:translate-y-px disabled:cursor-not-allowed disabled:opacity-45 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-pulse ${
                  feedback === "error"
                    ? "border-hot/50 bg-hot/10 text-hot"
                    : feedback === "success"
                      ? "border-field/50 bg-field/10 text-field"
                      : "border-pulse/30 bg-pulse/10 text-pulse hover:border-pulse hover:bg-pulse/18"
                }`}
              >
                {isBusy ? <LoaderCircle className="size-4 animate-spin" /> : feedback === "error" ? <AlertTriangle className="size-4" /> : feedback === "success" ? <CheckCircle2 className="size-4" /> : <Icon className="size-4" />}
                <span>{isBusy ? "Sending" : feedback === "error" ? "Retry" : feedback === "success" ? "Sent" : button.label}</span>
              </button>
            );
          })}
        </div>
        <p role="status" className="min-h-4 text-xs text-white/40">
          {feedback === "success" ? "Activity added to the live feed." : feedback === "error" ? "The event could not be added." : "Use this only for judge demos without GitHub setup."}
        </p>
      </div>
    </Panel>
  );
}
