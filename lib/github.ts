import { createHmac, timingSafeEqual } from "crypto";
import type { ActivityType } from "@/lib/types";

type GitHubRepository = {
  full_name?: string;
  name?: string;
};

type PushPayload = {
  repository?: GitHubRepository;
  commits?: unknown[];
};

type PullRequestPayload = {
  action?: string;
  repository?: GitHubRepository;
  pull_request?: {
    merged?: boolean;
    number?: number;
  };
  number?: number;
};

type IssuesPayload = {
  action?: string;
  repository?: GitHubRepository;
  issue?: {
    number?: number;
  };
};

type ReviewPayload = {
  action?: string;
  repository?: GitHubRepository;
  pull_request?: {
    number?: number;
  };
};

export type ParsedGitHubActivity = {
  type: ActivityType;
  githubRepo: string;
  fallbackTeamName: string;
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

export function parseGitHubWebhook(
  eventName: string,
  payload: unknown
): ParsedGitHubActivity | null {
  if (eventName === "push") {
    const push = payload as PushPayload;
    const commitCount = push.commits?.length ?? 0;
    if (commitCount <= 0) {
      return null;
    }

    const repo = repoName(push.repository);
    return {
      type: "push",
      ...repo,
      metadata: {
        commitCount
      }
    };
  }

  if (eventName === "pull_request") {
    const pullRequest = payload as PullRequestPayload;
    const repo = repoName(pullRequest.repository);

    if (pullRequest.action === "opened") {
      return {
        type: "pull_request_opened",
        ...repo,
        metadata: {
          number: pullRequest.pull_request?.number ?? pullRequest.number
        }
      };
    }

    if (pullRequest.action === "closed" && pullRequest.pull_request?.merged) {
      return {
        type: "pull_request_merged",
        ...repo,
        metadata: {
          number: pullRequest.pull_request.number ?? pullRequest.number
        }
      };
    }
  }

  if (eventName === "issues") {
    const issue = payload as IssuesPayload;
    if (issue.action !== "closed") {
      return null;
    }

    return {
      type: "issue_closed",
      ...repoName(issue.repository),
      metadata: {
        number: issue.issue?.number
      }
    };
  }

  if (eventName === "pull_request_review") {
    const review = payload as ReviewPayload;
    if (review.action !== "submitted") {
      return null;
    }

    return {
      type: "review",
      ...repoName(review.repository),
      metadata: {
        number: review.pull_request?.number
      }
    };
  }

  return null;
}
