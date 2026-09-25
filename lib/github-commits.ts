/** GitHub上で確認できる、イベント期間中のユニークなコミットを数える。 */

type GitHubBranch = { name?: unknown };
type GitHubCommit = {
  sha?: unknown;
  author?: { login?: unknown } | null;
};

export type UniqueCommitSummary = {
  total: number;
  /** GitHubログイン名（小文字）ごとの、重複排除済みコミット数。 */
  byLogin: Record<string, number>;
  /** GitHubアカウントに紐付けられず、誰のものか安全に判断できないコミット数。 */
  unattributedCount: number;
};

type FetchLike = (input: string, init?: RequestInit) => Promise<Response>;

const MAX_BRANCHES = 100;
const MAX_PAGES_PER_BRANCH = 20;
const CACHE_DURATION_MS = 5 * 60 * 1000;
const summaryCache = new Map<string, { expiresAt: number; value: UniqueCommitSummary }>();

function isValidRepo(repo: string) {
  return /^[A-Za-z0-9_.-]+\/[A-Za-z0-9_.-]+$/.test(repo);
}

function headers(accessToken?: string) {
  return {
    accept: "application/vnd.github+json",
    "user-agent": "HackRadar",
    ...(accessToken ? { authorization: `Bearer ${accessToken}` } : {})
  };
}

function nextPage(link: string | null): string | null {
  if (!link) return null;
  const match = link.split(",").find((part) => /rel="next"/.test(part));
  return match?.match(/<([^>]+)>/)?.[1] ?? null;
}

async function fetchJson(url: string, accessToken: string | undefined, fetcher: FetchLike) {
  const response = await fetcher(url, { headers: headers(accessToken), cache: "no-store" });
  if (!response.ok) {
    throw new Error(response.status === 404 ? "リポジトリを読み取れません。" : "GitHubからコミットを取得できませんでした。");
  }
  return { body: await response.json(), next: nextPage(response.headers.get("link")) };
}

/** 配列を受け取る部分は分離し、重複排除の仕様をネットワーク無しで検証できる。 */
export function countUniqueCommitShas(branchCommitLists: Array<Array<{ sha?: unknown }>>) {
  const shas = new Set<string>();
  for (const commits of branchCommitLists) {
    for (const commit of commits) {
      if (typeof commit.sha === "string" && commit.sha.trim()) shas.add(commit.sha);
    }
  }
  return shas.size;
}

/**
 * 同じSHAを複数ブランチで見つけても一度だけ数え、GitHub上の著者へ割り当てる。
 * author.login がないコミットを推測でメンバーへ割り当てると誤表示になるため、別枠にする。
 */
export function summarizeUniqueCommitsByGitHubLogin(
  branchCommitLists: Array<Array<GitHubCommit>>
): UniqueCommitSummary {
  const commitsBySha = new Map<string, string | null>();

  for (const commits of branchCommitLists) {
    for (const commit of commits) {
      const sha = typeof commit.sha === "string" ? commit.sha.trim() : "";
      if (!sha || commitsBySha.has(sha)) continue;

      const login = typeof commit.author?.login === "string"
        ? commit.author.login.trim().toLowerCase()
        : "";
      commitsBySha.set(sha, login || null);
    }
  }

  const byLogin: Record<string, number> = {};
  let unattributedCount = 0;
  for (const login of commitsBySha.values()) {
    if (!login) {
      unattributedCount += 1;
      continue;
    }
    byLogin[login] = (byLogin[login] ?? 0) + 1;
  }

  return { total: commitsBySha.size, byLogin, unattributedCount };
}

export async function fetchUniqueRepoCommitSummary(
  repo: string,
  since: string,
  accessToken?: string,
  fetcher: FetchLike = fetch
): Promise<UniqueCommitSummary> {
  if (!isValidRepo(repo)) throw new Error("リポジトリ名の形式が正しくありません。");

  const cacheKey = `${repo.toLowerCase()}:${since}`;
  const cached = summaryCache.get(cacheKey);
  if (fetcher === fetch && cached && cached.expiresAt > Date.now()) return cached.value;

  const encodedRepo = repo.split("/").map(encodeURIComponent).join("/");
  const branchesResult = await fetchJson(
    `https://api.github.com/repos/${encodedRepo}/branches?per_page=${MAX_BRANCHES}`,
    accessToken,
    fetcher
  );
  const branchNames = Array.isArray(branchesResult.body)
    ? (branchesResult.body as GitHubBranch[])
        .map((branch) => (typeof branch.name === "string" ? branch.name : ""))
        .filter(Boolean)
    : [];

  const lists: GitHubCommit[][] = [];
  for (const branch of branchNames) {
    let url: string | null = `https://api.github.com/repos/${encodedRepo}/commits?sha=${encodeURIComponent(
      branch
    )}&since=${encodeURIComponent(since)}&per_page=100`;
    let pages = 0;
    while (url && pages < MAX_PAGES_PER_BRANCH) {
      const result = await fetchJson(url, accessToken, fetcher);
      if (Array.isArray(result.body)) lists.push(result.body as GitHubCommit[]);
      url = result.next;
      pages += 1;
    }
  }

  const value = summarizeUniqueCommitsByGitHubLogin(lists);
  if (fetcher === fetch) {
    summaryCache.set(cacheKey, { value, expiresAt: Date.now() + CACHE_DURATION_MS });
  }
  return value;
}

/**
 * mainだけでなく、まだマージされていない機能ブランチも含める。
 * 同じSHAが複数ブランチに現れても Set で一度だけ数える。
 */
export async function fetchUniqueRepoCommitCount(
  repo: string,
  since: string,
  accessToken?: string,
  fetcher: FetchLike = fetch
): Promise<number> {
  return (await fetchUniqueRepoCommitSummary(repo, since, accessToken, fetcher)).total;
}
