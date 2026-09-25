import Image from "next/image";
import { GitCommitHorizontal, UserRound } from "lucide-react";
import { Panel } from "@/components/panel";
import { formatShortDateTime } from "@/lib/datetime";
import type { ContributorView, Team } from "@/lib/types";

/**
 * 誰がどれだけ動いたかの一覧。
 *
 * チームの合計だけだと「一人が全部やったチーム」と「全員で分担したチーム」が
 * 同じに見える。運営が状況をつかむにも、参加者が自分の位置を知るにも要る。
 *
 * 数字はGitHubから届いた操作の記録がもとで、自己申告ではない。
 */
export function ContributorPanel({
  contributors,
  teams,
  teamId = null,
  title = "メンバー別の動き",
  description = "GitHubの操作をアカウントごとに集計しています。",
  verifiedCommitCounts = null,
  unattributedCommitCount = 0
}: {
  contributors: ContributorView[];
  teams: Team[];
  /** 指定するとそのチームだけ。null なら全チームをまとめて出す。 */
  teamId?: string | null;
  title?: string;
  description?: string;
  /** GitHub APIでSHA単位に重複排除した、対象チームのメンバー別コミット数。 */
  verifiedCommitCounts?: Record<string, number> | null;
  /** GitHubアカウントが分からず、特定のメンバーへ割り当てられないコミット数。 */
  unattributedCommitCount?: number;
}) {
  const teamNameById = new Map(teams.map((team) => [team.id, team.name]));
  const rows = (teamId ? contributors.filter((c) => c.team_id === teamId) : contributors)
    .slice(0, 20);
  const total = rows.reduce((sum, row) => sum + row.score, 0);

  return (
    <Panel
      title={title}
      description={description}
      action={
        rows.length > 0 ? (
          <span className="rounded-full bg-sand px-2.5 py-1 text-xs text-muted shadow-inset">
            {rows.length} 人
          </span>
        ) : null
      }
    >
      {rows.length === 0 ? (
        <div className="rounded-xl border border-dashed border-lineStrong bg-sand/60 p-8 text-center text-sm text-muted shadow-inset">
          まだ記録がありません。プッシュすると、誰がやったかも一緒に残ります。
        </div>
      ) : (
        <ul className="space-y-2">
          {rows.map((row, index) => {
            // 合計に対する割合。偏りが一目で分かるようにバーで出す。
            const share = total > 0 ? Math.round((row.score / total) * 100) : 0;
            const isVerified = teamId !== null && verifiedCommitCounts !== null;
            const commitCount = isVerified
              ? (verifiedCommitCounts[row.github_username.toLowerCase()] ?? 0)
              : row.commit_count;

            return (
              <li
                key={`${row.team_id}-${row.github_username}`}
                className="rounded-xl border border-line bg-paper p-3 shadow-inset"
              >
                <div className="flex items-center gap-2.5">
                  <span className="w-5 shrink-0 text-center font-mono text-xs text-muted">
                    {index + 1}
                  </span>
                  {row.avatar_url ? (
                    <Image
                      src={row.avatar_url}
                      alt=""
                      width={28}
                      height={28}
                      className="size-7 shrink-0 rounded-full"
                    />
                  ) : (
                    <span className="grid size-7 shrink-0 place-items-center rounded-full bg-paper2 text-muted">
                      <UserRound className="size-3.5" />
                    </span>
                  )}
                  <div className="min-w-0 flex-1">
                    <p className="truncate text-sm font-medium text-ink">
                      {row.display_name}
                    </p>
                    <p className="truncate font-mono text-[11px] text-muted">
                      @{row.github_username}
                      {teamId ? null : ` ・ ${teamNameById.get(row.team_id) ?? "不明"}`}
                    </p>
                  </div>
                  <span className="shrink-0 font-mono text-sm font-bold text-ink">
                    {row.score}
                    <span className="ml-0.5 font-sans text-xs font-normal text-muted">
                      pt
                    </span>
                  </span>
                </div>

                <div className="mt-2 h-1.5 overflow-hidden rounded-full bg-sand">
                  <div
                    className="h-full rounded-full bg-pulse"
                    style={{ width: `${Math.max(share, 2)}%` }}
                  />
                </div>

                <div className="mt-1.5 flex flex-wrap items-center gap-x-3 gap-y-0.5 text-[11px] text-muted">
                  <span>{share}%</span>
                  <span className="flex items-center gap-1">
                    <GitCommitHorizontal className="size-3" />
                    {commitCount} コミット
                  </span>
                  <span>{row.activity_count} 回の操作</span>
                  <span>最終 {formatShortDateTime(row.last_active_at)}</span>
                </div>
              </li>
            );
          })}
        </ul>
      )}
      {teamId !== null && verifiedCommitCounts !== null && (
        <p className="mt-3 text-xs leading-5 text-muted">
          GitHub上のユニークなSHAで照合済みです。
          {unattributedCommitCount > 0
            ? ` GitHubアカウントに紐付けられないコミットが${unattributedCommitCount}件あります。`
            : null}
        </p>
      )}
    </Panel>
  );
}
