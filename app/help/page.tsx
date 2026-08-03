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

  return (
    <Shell>
      <div className="mb-6">
        <h1 className="text-2xl font-bold tracking-tight text-ink sm:text-3xl">
          質問する
        </h1>
        <p className="mt-1.5 text-sm text-muted">
          わからないことを書けば、参加している人なら誰でも答えてくれます。
        </p>
      </div>
      <DashboardClient initialState={state} view="help" viewer={viewer} />
    </Shell>
  );
}
