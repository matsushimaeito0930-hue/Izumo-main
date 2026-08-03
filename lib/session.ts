import { cookies } from "next/headers";
import {
  SESSION_COOKIE,
  isGitHubAuthConfigured,
  parseIdentity,
  type GitHubIdentity
} from "@/lib/github-auth";

/** Server Component / Route Handler から現在のログイン状態を読む。 */
export function getCurrentIdentity(): GitHubIdentity | null {
  return parseIdentity(cookies().get(SESSION_COOKIE)?.value);
}

export type AuthStatus = {
  isConfigured: boolean;
  identity: GitHubIdentity | null;
};

export function getAuthStatus(): AuthStatus {
  return {
    isConfigured: isGitHubAuthConfigured(),
    identity: getCurrentIdentity()
  };
}
