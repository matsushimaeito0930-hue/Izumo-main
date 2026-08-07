import Image from "next/image";
import { Users } from "lucide-react";
import type { TeamMemberView } from "@/lib/types";

/**
 * チームに入っている人のGitHubアカウント一覧。
 * 同じ部屋番号で複数人が参加するので、誰が入れているのかを見えるようにする。
 */
export function TeamMembers({
  members,
  viewerLogin = null,
  compact = false
}: {
  members: TeamMemberView[];
  /** 自分の行に目印を付けるためのGitHubユーザー名。 */
  viewerLogin?: string | null;
  /** 一覧の行内に埋め込むときは、アイコンを省いて1行にまとめる。 */
  compact?: boolean;
}) {
  if (members.length === 0) {
    return (
      <p className="text-xs leading-5 text-muted">
        まだ誰も参加していません。部屋番号を共有してください。
      </p>
    );
  }

  if (compact) {
    return (
      <p className="truncate text-xs text-muted">
        <Users className="mr-1 inline size-3 align-[-1px]" />
        {members.map((member) => `@${member.github_username}`).join("  ")}
      </p>
    );
  }

  return (
    <ul className="flex flex-wrap gap-1.5">
      {members.map((member) => {
        const isViewer =
          viewerLogin !== null &&
          member.github_username.toLowerCase() === viewerLogin.toLowerCase();

        return (
          <li
            key={member.github_username}
            title={member.display_name}
            className={`flex items-center gap-1.5 rounded-full border py-1 pl-1 pr-2.5 shadow-soft ${
              isViewer ? "border-pulse/30 bg-pulse/10" : "border-line bg-paper"
            }`}
          >
            {member.avatar_url ? (
              <Image
                src={member.avatar_url}
                alt=""
                width={20}
                height={20}
                className="size-5 rounded-full"
              />
            ) : (
              <span className="grid size-5 place-items-center rounded-full bg-paper2 text-[10px] text-muted">
                {member.display_name.slice(0, 1)}
              </span>
            )}
            <span
              className={`font-mono text-xs ${isViewer ? "font-bold text-ink" : "text-ink2"}`}
            >
              @{member.github_username}
            </span>
          </li>
        );
      })}
    </ul>
  );
}
