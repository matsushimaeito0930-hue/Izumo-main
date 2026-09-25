import { cookies } from "next/headers";
import {
  SESSION_COOKIE,
  isGitHubAuthConfigured,
  parseIdentity,
  type GitHubIdentity
} from "@/lib/github-auth";
import { getEventMemberRole, getMembershipInEvent, isEventOwner } from "@/lib/store";

/** Server Component / Route Handler から現在のログイン状態を読む。 */
export async function getCurrentIdentity(): Promise<GitHubIdentity | null> {
  const identity = parseIdentity((await cookies()).get(SESSION_COOKIE)?.value);
  if (!identity?.eventId) return identity;

  const allowed = identity.role === "admin"
    ? await isEventOwner({ eventId: identity.eventId, githubUsername: identity.login })
    : (await getEventMemberRole({
        eventId: identity.eventId,
        githubUsername: identity.login
      })) === identity.role &&
      (identity.role !== "participant" || Boolean(await getMembershipInEvent({
        eventId: identity.eventId,
        githubUsername: identity.login
      })));

  // 古いcookieや、所属が削除された後のcookieはイベント権限として使わない。
  // GitHubログイン自体は残し、役割とイベントだけを選び直せる状態へ戻す。
  return allowed ? identity : { ...identity, role: "participant", eventId: undefined };
}

export type AuthStatus = {
  isConfigured: boolean;
  identity: GitHubIdentity | null;
};

export async function getAuthStatus(): Promise<AuthStatus> {
  return {
    isConfigured: isGitHubAuthConfigured(),
    identity: await getCurrentIdentity()
  };
}
