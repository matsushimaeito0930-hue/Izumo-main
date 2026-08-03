import {
  CheckCircle2,
  GitCommitHorizontal,
  GitMerge,
  GitPullRequest,
  MessageSquare
} from "lucide-react";
import { Panel } from "@/components/panel";
import { ACTIVITY_SHORT_LABELS } from "@/lib/constants";
import type { ActivityType, ActivityView } from "@/lib/types";

function activityIcon(type: ActivityType) {
  if (type === "push") return <GitCommitHorizontal className="size-4" />;
  if (type === "pull_request_opened") return <GitPullRequest className="size-4" />;
  if (type === "pull_request_merged") return <GitMerge className="size-4" />;
  if (type === "issue_closed") return <CheckCircle2 className="size-4" />;
  return <MessageSquare className="size-4" />;
}

function activityColor(type: ActivityType) {
  if (type === "push") return "bg-pulse/10 text-pulse";
  if (type === "pull_request_merged") return "bg-field/10 text-field";
  if (type === "issue_closed") return "bg-sun/10 text-sun";
  return "bg-hot/10 text-hot";
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
      title="みんなの動き"
      description="GitHubにプッシュすると、ここに出ます。"
      action={
        <span className="rounded-full bg-sand px-2.5 py-1 text-xs text-muted shadow-inset">
          直近 {visibleActivities.length} 件
        </span>
      }
    >
      {visibleActivities.length === 0 ? (
        <div className="rounded-xl border border-dashed border-lineStrong bg-sand/60 p-8 text-center text-sm text-muted shadow-inset">
          まだ動きがありません。GitHubにプッシュすると表示されます。
        </div>
      ) : (
        <ul className="-my-1">
          {visibleActivities.map((activity) => (
            <li
              key={activity.id}
              className={`flex gap-3 rounded-lg px-2 py-2.5 transition-colors hover:bg-sand/70 ${
                activity.id === highlightId ? "activity-flash" : ""
              }`}
            >
              <span
                className={`grid size-8 shrink-0 place-items-center rounded-xl shadow-soft ${activityColor(
                  activity.type
                )}`}
              >
                {activityIcon(activity.type)}
              </span>
              <div className="min-w-0 flex-1">
                <p className="text-sm leading-6 text-ink">{activity.message}</p>
                <div className="mt-0.5 flex flex-wrap items-center gap-x-2.5 gap-y-1 text-xs text-muted">
                  <span className="rounded bg-paper2 px-1.5 py-0.5 text-ink2">
                    {ACTIVITY_SHORT_LABELS[activity.type]}
                  </span>
                  <span>{activity.team_name}</span>
                  <span className="font-mono text-field">+{activity.score_delta} pt</span>
                  <time>
                    {new Date(activity.created_at).toLocaleTimeString("ja-JP", {
                      hour: "2-digit",
                      minute: "2-digit"
                    })}
                  </time>
                </div>
              </div>
            </li>
          ))}
        </ul>
      )}
    </Panel>
  );
}
