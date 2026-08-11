import { DashboardClient } from "@/components/dashboard-client";
import { Shell } from "@/components/shell";
import { getAuthStatus } from "@/lib/session";
import { getHackVerseState } from "@/lib/store";

export const dynamic = "force-dynamic";

export default async function HelpPage() {
  const state = await getHackVerseState();
  const { identity } = getAuthStatus();
  const viewer = identity
    ? {
        login: identity.login,
        displayName: identity.displayName,
        role: identity.role
      }
    : null;

  // 運営はここでお知らせを出す側、審査員は読むだけ。参加者は質問もできる。
  const announcementOnly = identity?.role === "judge" || identity?.role === "admin";

  return (
    <Shell>
      <div className="mb-6">
        <h1 className="text-2xl font-bold tracking-tight text-ink sm:text-3xl">
          {announcementOnly ? "お知らせ" : "質問・お知らせ"}
        </h1>
        <p className="mt-1.5 text-sm text-muted">
          {identity?.role === "admin"
            ? "全チームへの連絡をここから送れます。"
            : identity?.role === "judge"
              ? "運営から全チームへ共有された連絡です。"
              : "運営からのお知らせと、みんなの質問がここに集まります。"}
        </p>
      </div>
      <DashboardClient initialState={state} view="help" viewer={viewer} />
    </Shell>
  );
}
