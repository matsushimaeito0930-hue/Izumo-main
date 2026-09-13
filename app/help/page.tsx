import { redirect } from "next/navigation";
import { DashboardClient } from "@/components/dashboard-client";
import { Shell } from "@/components/shell";
import { getAuthStatus } from "@/lib/session";
import { getHackVerseState } from "@/lib/store";

export const dynamic = "force-dynamic";

export default async function HelpPage() {
  const { isConfigured, identity } = await getAuthStatus();
  if (isConfigured && (!identity || !identity.eventId)) redirect("/");
  const state = await getHackVerseState(
    identity?.eventId,
    identity ? { githubUsername: identity.login, role: identity.role } : undefined
  );
  const viewer = identity
    ? {
        login: identity.login,
        displayName: identity.displayName,
        role: identity.role
      }
    : null;

  return (
    <Shell>
      <div className="mb-6">
        <h1 className="text-2xl font-bold tracking-tight text-ink sm:text-3xl">
          {identity?.role === "judge" ? "お知らせ" : "質問・お知らせ"}
        </h1>
        <p className="mt-1.5 text-sm text-muted">
          {identity?.role === "admin"
            ? "全チームへの連絡を送れます。質問に答えることもできます。"
            : identity?.role === "judge"
              ? "運営から全チームへ共有された連絡です。"
              : "運営からのお知らせと、みんなの質問がここに集まります。"}
        </p>
      </div>
      <DashboardClient initialState={state} view="help" viewer={viewer} />
    </Shell>
  );
}
