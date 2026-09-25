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
          質問
        </h1>
        <p className="mt-1.5 text-sm text-muted">
          {identity?.role === "admin"
            ? "参加者どうしの質問に回答できます。全体連絡とチーム相談は「お知らせ」を開いてください。"
            : identity?.role === "judge"
              ? "学生同士の質問と解決の流れを閲覧できます。"
              : "公開で質問・回答できる場所です。運営からの連絡やチーム相談は「お知らせ」を開いてください。"}
        </p>
      </div>
      <DashboardClient initialState={state} view="help" viewer={viewer} />
    </Shell>
  );
}
