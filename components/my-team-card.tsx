import { GitBranch, GitCommitHorizontal, Trophy } from "lucide-react";
import type { ActivityView, Team } from "@/lib/types";

/**
 * 参加者の画面のいちばん上。自分のチームの状態だけを大きく出す。
 * 全チーム一覧の中から自分を探させないためのカード。
 */
export function MyTeamCard({
  team,
  rank,
  totalTeams,
  latestActivity
}: {
  team: Team;
  rank: number;
  totalTeams: number;
  latestActivity: ActivityView | null;
}) {
  return (
    <section className="rounded-2xl border border-pulse/25 bg-surface p-5 shadow-card sm:p-6">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div className="min-w-0">
          <span className="text-xs font-medium text-pulse">自分のチーム</span>
          <h2 className="mt-0.5 truncate text-2xl font-bold tracking-tight text-ink sm:text-3xl">
            {team.name}
          </h2>
        </div>
        <span className="shrink-0 rounded-xl bg-sun/10 px-3 py-1.5 text-sm font-bold text-sun shadow-soft">
          <Trophy className="mr-1.5 inline size-4 align-[-2px]" />
          {totalTeams > 0 ? `${rank} / ${totalTeams} 位` : "-"}
        </span>
      </div>

      <dl className="mt-5 grid grid-cols-2 gap-3">
        <div className="rounded-xl border border-line bg-paper p-3 shadow-inset">
          <dt className="text-xs text-muted">スコア</dt>
          <dd className="mt-1 font-mono text-2xl font-bold tracking-tight text-ink">
            {team.score}
            <span className="ml-1 font-sans text-sm font-normal text-muted">pt</span>
          </dd>
        </div>
        <div className="rounded-xl border border-line bg-paper p-3 shadow-inset">
          <dt className="flex items-center gap-1.5 text-xs text-muted">
            <GitCommitHorizontal className="size-3.5" />
            コミット
          </dt>
          <dd className="mt-1 font-mono text-2xl font-bold tracking-tight text-ink">
            {team.commit_count}
            <span className="ml-1 font-sans text-sm font-normal text-muted">件</span>
          </dd>
        </div>
      </dl>

      <div className="mt-4 space-y-1.5 text-sm">
        <p className="flex items-center gap-2 text-muted">
          <GitBranch className="size-4 shrink-0" />
          <span className="truncate font-mono text-xs">
            {team.github_repo ?? "リポジトリ未設定"}
          </span>
        </p>
        <p className="truncate text-xs leading-5 text-muted">
          {latestActivity?.message ?? "まだ活動がありません。プッシュすると反映されます。"}
        </p>
      </div>
    </section>
  );
}
