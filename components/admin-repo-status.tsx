import { CircleAlert, CircleCheck } from "lucide-react";
import { Panel } from "@/components/panel";
import type { Team } from "@/lib/types";

/**
 * 運営だけに見せる、チームごとのリポジトリ設定状況。
 * 未設定のチームはスコアが動かないので、運営が声をかけられるように先頭へ出す。
 */
export function AdminRepoStatus({ teams }: { teams: Team[] }) {
  const unset = teams.filter((team) => !team.github_repo);
  const sorted = [...teams].sort((a, b) => {
    if (Boolean(a.github_repo) !== Boolean(b.github_repo)) {
      return a.github_repo ? 1 : -1;
    }
    return a.name.localeCompare(b.name, "ja");
  });

  return (
    <Panel
      title="リポジトリの設定状況"
      description={
        unset.length > 0
          ? `${unset.length} チームが未設定です。設定するまでスコアは動きません。`
          : "すべてのチームがリポジトリを設定済みです。"
      }
    >
      {teams.length === 0 ? (
        <p className="rounded-xl border border-line bg-paper px-3 py-6 text-center text-sm text-muted shadow-inset">
          まだチームが登録されていません。
        </p>
      ) : (
        <ul className="divide-y divide-line rounded-xl border border-line bg-paper shadow-inset">
          {sorted.map((team) => (
            <li key={team.id} className="flex items-center gap-3 px-3 py-2.5">
              {team.github_repo ? (
                <CircleCheck className="size-4 shrink-0 text-pulse" />
              ) : (
                <CircleAlert className="size-4 shrink-0 text-hot" />
              )}
              <span className="min-w-0 flex-1 truncate text-sm font-medium text-ink">
                {team.name}
              </span>
              <span
                className={`shrink-0 truncate font-mono text-xs ${
                  team.github_repo ? "text-muted" : "font-sans font-medium text-hot"
                }`}
              >
                {team.github_repo ?? "未設定"}
              </span>
            </li>
          ))}
        </ul>
      )}
    </Panel>
  );
}
