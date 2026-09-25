import Image from "next/image";
import { useState } from "react";
import {
  ChevronDown,
  ChevronUp,
  CheckCircle2,
  GitCommitHorizontal,
  GitMerge,
  GitPullRequest,
  MessageSquare
} from "lucide-react";
import { Panel } from "@/components/panel";
import { ACTIVITY_SHORT_LABELS } from "@/lib/constants";
import { formatShortDateTime } from "@/lib/datetime";
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
  const [isExpanded, setIsExpanded] = useState(false);
  const recentActivities = activities.slice(0, 8);
  // 普段は最後の1件だけ。必要なときだけ直近の流れを開ける。
  const visibleActivities = isExpanded ? recentActivities : recentActivities.slice(0, 1);

  return (
    <Panel
      title="みんなの動き"
      description={isExpanded ? "直近8件のGitHub活動です。" : "最後にあったGitHub活動を表示しています。"}
      action={
        recentActivities.length > 1 ? (
          <button
            type="button"
            onClick={() => setIsExpanded((current) => !current)}
            aria-expanded={isExpanded}
            className="flex h-8 items-center gap-1 rounded-lg border border-line bg-paper px-2.5 text-xs font-medium text-ink2 shadow-inset transition-colors hover:text-ink"
          >
            {isExpanded ? <ChevronUp className="size-3.5" /> : <ChevronDown className="size-3.5" />}
            {isExpanded ? "閉じる" : `ほか ${recentActivities.length - 1} 件`}
          </button>
        ) : (
          <span className="rounded-full bg-sand px-2.5 py-1 text-xs text-muted shadow-inset">最新 1 件</span>
        )
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
                  {/* 誰の操作かはGitHubから届いた値。自己申告ではない。 */}
                  {activity.actor_login && (
                    <span className="flex items-center gap-1">
                      {activity.actor_avatar_url ? (
                        <Image
                          src={activity.actor_avatar_url}
                          alt=""
                          width={16}
                          height={16}
                          className="size-4 rounded-full"
                        />
                      ) : null}
                      <span className="font-mono text-ink2">@{activity.actor_login}</span>
                    </span>
                  )}
                  <span>{activity.team_name}</span>
                  <span className="font-mono text-field">+{activity.score_delta} pt</span>
                  <time>
                    {formatShortDateTime(activity.created_at)}
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
