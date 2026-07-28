import {
  CheckCircle2,
  GitCommitHorizontal,
  GitMerge,
  GitPullRequest,
  MessageSquare,
  Rocket
} from "lucide-react";
import { Panel } from "@/components/panel";
import type { ActivityType, ActivityView } from "@/lib/types";

function activityIcon(type: ActivityType) {
  if (type === "push") return <GitCommitHorizontal className="size-4" />;
  if (type === "pull_request_opened") return <GitPullRequest className="size-4" />;
  if (type === "pull_request_merged") return <GitMerge className="size-4" />;
  if (type === "issue_closed") return <CheckCircle2 className="size-4" />;
  return <MessageSquare className="size-4" />;
}

function activityColor(type: ActivityType) {
  if (type === "push") return "border-pulse/30 bg-pulse/10 text-pulse";
  if (type === "pull_request_merged") return "border-field/30 bg-field/10 text-field";
  if (type === "issue_closed") return "border-sun/30 bg-sun/10 text-sun";
  return "border-hot/30 bg-hot/10 text-hot";
}

export function ActivityFeed({
  activities,
  highlightId
}: {
  activities: ActivityView[];
  highlightId?: string;
}) {
  const visibleActivities = activities.slice(0, 8);

  return (
    <Panel
      title="Live Activity"
      action={<span className="font-mono text-xs text-white/35">{visibleActivities.length} latest</span>}
    >
      <div className="relative space-y-2">
        <div className="absolute bottom-4 left-[1.1rem] top-4 w-px bg-white/10" />
        {visibleActivities.length === 0 ? (
          <div className="rounded-md border border-dashed border-white/15 p-6 text-center text-sm text-white/45">
            Waiting for the first GitHub event.
          </div>
        ) : (
          visibleActivities.map((activity) => (
            <div
              key={activity.id}
              className={`relative flex gap-3 rounded-md border border-transparent p-2 transition-colors hover:border-white/10 hover:bg-white/[0.035] ${
                activity.id === highlightId ? "activity-flash" : ""
              }`}
            >
              <span className={`relative z-10 grid size-9 shrink-0 place-items-center rounded-full border ${activityColor(activity.type)}`}>
                {activityIcon(activity.type)}
              </span>
              <div className="min-w-0 flex-1 py-0.5">
                <p className="text-sm font-bold leading-5 text-white">{activity.message}</p>
                <div className="mt-1 flex flex-wrap items-center gap-x-2 gap-y-1 text-xs text-white/45">
                  <span className="font-semibold text-white/65">{activity.team_name}</span>
                  <span>+{activity.score_delta} pts</span>
                  <span>{new Date(activity.created_at).toLocaleTimeString()}</span>
                </div>
              </div>
            </div>
          ))
        )}
      </div>
    </Panel>
  );
}
