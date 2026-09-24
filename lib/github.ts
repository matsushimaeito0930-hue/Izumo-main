import { createHmac, timingSafeEqual } from "crypto";
import type { ActivityType } from "@/lib/types";

type GitHubRepository = {
  full_name?: string;
  name?: string;
};

/** どのイベントにも共通で入ってくる「操作した人」。 */
type GitHubSender = {
  login?: string;
  avatar_url?: string;
  type?: string;
};

type WithSender = {
  sender?: GitHubSender;
};

type PushPayload = WithSender & {
  repository?: GitHubRepository;
  commits?: Array<{ id?: unknown }>;
  after?: string;
  head_commit?: {
    id?: string;
    author?: { username?: string; name?: string };
  };
  pusher?: { name?: string };
};

type PullRequestPayload = WithSender & {
  action?: string;
  repository?: GitHubRepository;
  pull_request?: {
    merged?: boolean;
    number?: number;
    title?: string;
    user?: GitHubSender;
    merged_by?: GitHubSender;
  };
  number?: number;
};

type IssuesPayload = WithSender & {
  action?: string;
  repository?: GitHubRepository;
  issue?: {
    number?: number;
    title?: string;
  };
};

type ReviewPayload = WithSender & {
  action?: string;
  repository?: GitHubRepository;
  pull_request?: {
    number?: number;
    title?: string;
  };
  review?: {
    state?: string;
  };
};

export type ParsedGitHubActivity = {
  type: ActivityType;
  githubRepo: string;
  fallbackTeamName: string;
  /** 操作した人のGitHubアカウント名。取れなければ undefined。 */
  actorLogin?: string;
  actorAvatarUrl?: string | null;
  metadata: Record<string, unknown>;
};

export function verifyGitHubSignature({
  body,
  signature,
  secret
}: {
  body: string;
  signature: string | null;
  secret: string;
}): boolean {
  if (!signature?.startsWith("sha256=")) {
    return false;
  }

  const expected = `sha256=${createHmac("sha256", secret)
    .update(body)
    .digest("hex")}`;
  const expectedBuffer = Buffer.from(expected);
  const signatureBuffer = Buffer.from(signature);

  if (expectedBuffer.length !== signatureBuffer.length) {
    return false;
  }

  return timingSafeEqual(expectedBuffer, signatureBuffer);
}

function repoName(repository: GitHubRepository | undefined): {
  githubRepo: string;
  fallbackTeamName: string;
} {
  const githubRepo = repository?.full_name ?? "unknown/repository";
  const fallbackTeamName =
    repository?.name
      ?.split("-")
      .map((part) => part.charAt(0).toUpperCase() + part.slice(1))
      .join(" ") ?? githubRepo;

  return {
    githubRepo,
    fallbackTeamName
  };
}

/**
 * 操作した人を取り出す。
 *
 * どのイベントでも `sender` が「実際にその操作をしたアカウント」なので、
 * PRの作成者ではなくsenderを見る（マージは押した人を記録したいため）。
 * pushだけはsenderが取れないケースに備えて、コミットの著者名を予備にする。
 */
function actorOf(
  payload: WithSender,
  fallbackLogin?: string
): { actorLogin?: string; actorAvatarUrl?: string | null } {
  const login = payload.sender?.login?.trim() || fallbackLogin?.trim();
  if (!login) return {};

  return {
    actorLogin: login,
    actorAvatarUrl: payload.sender?.avatar_url ?? null
  };
}

/** 長いタイトルは一覧を壊すので、記録の時点で切っておく。 */
function trimTitle(value: string | undefined): string | undefined {
  const title = value?.trim();
  if (!title) return undefined;
  return title.length > 80 ? `${title.slice(0, 79)}…` : title;
}

export function parseGitHubWebhook(
  eventName: string,
  payload: unknown
): ParsedGitHubActivity | null {
  if (eventName === "push") {
    const push = payload as PushPayload;
    const commitShas = (push.commits ?? [])
      .map((commit) => (typeof commit.id === "string" ? commit.id : ""))
      .filter(Boolean);
    const commitCount = commitShas.length;
    if (commitCount <= 0) {
      return null;
    }

    const repo = repoName(push.repository);
    const commitSha = push.after ?? push.head_commit?.id;
    return {
      type: "push",
      ...repo,
      ...actorOf(push, push.head_commit?.author?.username ?? push.pusher?.name),
      metadata: {
        commitCount,
        commitShas,
        ...(commitSha ? { commitSha } : {})
      }
    };
  }

  if (eventName === "pull_request") {
    const pullRequest = payload as PullRequestPayload;
    const repo = repoName(pullRequest.repository);
    const title = trimTitle(pullRequest.pull_request?.title);

    if (pullRequest.action === "opened") {
      return {
        type: "pull_request_opened",
        ...repo,
        ...actorOf(pullRequest, pullRequest.pull_request?.user?.login),
        metadata: {
          number: pullRequest.pull_request?.number ?? pullRequest.number,
          ...(title ? { title } : {})
        }
      };
    }

    if (pullRequest.action === "closed" && pullRequest.pull_request?.merged) {
      return {
        type: "pull_request_merged",
        ...repo,
        ...actorOf(pullRequest, pullRequest.pull_request.merged_by?.login),
        metadata: {
          number: pullRequest.pull_request.number ?? pullRequest.number,
          ...(title ? { title } : {})
        }
      };
    }
  }

  if (eventName === "issues") {
    const issue = payload as IssuesPayload;
    if (issue.action !== "closed") {
      return null;
    }

    const title = trimTitle(issue.issue?.title);
    return {
      type: "issue_closed",
      ...repoName(issue.repository),
      ...actorOf(issue),
      metadata: {
        number: issue.issue?.number,
        ...(title ? { title } : {})
      }
    };
  }

  if (eventName === "pull_request_review") {
    const review = payload as ReviewPayload;
    if (review.action !== "submitted") {
      return null;
    }

    const title = trimTitle(review.pull_request?.title);
    return {
      type: "review",
      ...repoName(review.repository),
      ...actorOf(review),
      metadata: {
        number: review.pull_request?.number,
        ...(review.review?.state ? { reviewState: review.review.state } : {}),
        ...(title ? { title } : {})
      }
    };
  }

  return null;
}
