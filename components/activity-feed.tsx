import { GitCommitHorizontal } from "lucide-react";
import { Panel } from "@/components/panel";
import type { ActivityView } from "@/lib/types";

export function ActivityFeed({
  activities,
  highlightId
}: {
  activities: ActivityView[];
  highlightId?: string;
}) {
  return (
    <Panel title="Live Activity">
      <div className="space-y-3">
        {activities.slice(0, 8).map((activity) => (
          <div
            key={activity.id}
            className={`rounded-md border border-white/10 bg-white/[0.045] p-3 ${
              activity.id === highlightId ? "activity-flash" : ""
            }`}
          >
            <div className="flex items-start gap-3">
              <span className="grid size-9 shrink-0 place-items-center rounded-md bg-pulse/10 text-lg">
                {activity.message.slice(0, 2)}
              </span>
              <div className="min-w-0 flex-1">
                <p className="text-sm font-bold text-white">{activity.message}</p>
                <div className="mt-1 flex items-center gap-2 text-xs text-white/50">
                  <GitCommitHorizontal className="size-3.5" />
                  <span>{activity.team_name}</span>
                  <span>+{activity.score_delta} pts</span>
                  <span>{new Date(activity.created_at).toLocaleTimeString()}</span>
                </div>
              </div>
            </div>
          </div>
        ))}
      </div>
    </Panel>
  );
}
