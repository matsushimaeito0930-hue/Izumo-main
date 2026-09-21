/**
 * リポジトリのルート設定ファイルから、審査時に役立つ技術スタックを推定する。
 * 依存関係を全て表示すると読みづらいため、代表的なフレームワークと基盤だけを返す。
 */
export type TechStackLanguage = {
  name: string;
  bytes: number;
  percentage: number;
};

export type RepoTechStack = {
  repo: string;
  frameworks: string[];
  languages: TechStackLanguage[];
  scannedAt: string;
  status: "ready" | "unavailable";
  detail?: string;
};

const CACHE_DURATION_MS = 10 * 60 * 1000;
const readyCache = new Map<string, { expiresAt: number; value: RepoTechStack }>();

const manifestNames = [
  "package.json",
  "requirements.txt",
  "pyproject.toml",
  "pom.xml",
  "build.gradle",
  "build.gradle.kts",
  "go.mod",
  "Cargo.toml",
  "Gemfile",
  "composer.json"
];

const packageFrameworks: Array<[string, string]> = [
  ["next", "Next.js"],
  ["react", "React"],
  ["vue", "Vue.js"],
  ["nuxt", "Nuxt"],
  ["@angular/core", "Angular"],
  ["svelte", "Svelte"],
  ["astro", "Astro"],
  ["@remix-run/react", "Remix"],
  ["express", "Express"],
  ["@nestjs/core", "NestJS"],
  ["fastify", "Fastify"],
  ["hono", "Hono"],
  ["@supabase/supabase-js", "Supabase"],
  ["prisma", "Prisma"],
  ["@prisma/client", "Prisma"],
  ["drizzle-orm", "Drizzle"],
  ["tailwindcss", "Tailwind CSS"],
  ["vite", "Vite"]
];

function addIfIncludes(target: Set<string>, text: string, marker: string, label: string) {
  if (text.toLowerCase().includes(marker.toLowerCase())) target.add(label);
}

/** 設定ファイルの文字列だけで判定できるよう分離し、ネットワーク無しでテスト可能にする。 */
export function detectFrameworksFromManifests(manifests: Record<string, string>): string[] {
  const detected = new Set<string>();
  const packageJson = manifests["package.json"];

  if (packageJson) {
    try {
      const parsed = JSON.parse(packageJson) as {
        dependencies?: Record<string, string>;
        devDependencies?: Record<string, string>;
      };
      const dependencies = {
        ...(parsed.dependencies ?? {}),
        ...(parsed.devDependencies ?? {})
      };
      for (const [dependency, label] of packageFrameworks) {
        if (dependency in dependencies) detected.add(label);
      }
    } catch {
      // 壊れたpackage.jsonは無視し、他の設定ファイルの判定を続ける。
    }
  }

  const requirements = `${manifests["requirements.txt"] ?? ""}\n${manifests["pyproject.toml"] ?? ""}`;
  addIfIncludes(detected, requirements, "fastapi", "FastAPI");
  addIfIncludes(detected, requirements, "django", "Django");
  addIfIncludes(detected, requirements, "flask", "Flask");
  addIfIncludes(detected, requirements, "streamlit", "Streamlit");

  const java = `${manifests["pom.xml"] ?? ""}\n${manifests["build.gradle"] ?? ""}\n${manifests["build.gradle.kts"] ?? ""}`;
  addIfIncludes(detected, java, "spring-boot", "Spring Boot");

  const go = manifests["go.mod"] ?? "";
  addIfIncludes(detected, go, "gin-gonic/gin", "Gin");
  addIfIncludes(detected, go, "gofiber/fiber", "Fiber");
  addIfIncludes(detected, go, "labstack/echo", "Echo");

  const rust = manifests["Cargo.toml"] ?? "";
  addIfIncludes(detected, rust, "actix-web", "Actix Web");
  addIfIncludes(detected, rust, "axum", "Axum");
  addIfIncludes(detected, rust, "rocket", "Rocket");

  addIfIncludes(detected, manifests.Gemfile ?? "", "rails", "Ruby on Rails");
  addIfIncludes(detected, manifests["composer.json"] ?? "", "laravel/framework", "Laravel");

  return [...detected].sort((left, right) => left.localeCompare(right));
}

function githubHeaders(accessToken?: string) {
  return {
    accept: "application/vnd.github+json",
    "user-agent": "HackRadar",
    ...(accessToken ? { authorization: `Bearer ${accessToken}` } : {})
  };
}

function validRepositoryName(repo: string) {
  return /^[A-Za-z0-9_.-]+\/[A-Za-z0-9_.-]+$/.test(repo);
}

async function fetchJson(url: string, accessToken?: string): Promise<{ ok: boolean; body: unknown }> {
  const response = await fetch(url, {
    headers: githubHeaders(accessToken),
    cache: "no-store"
  });
  return { ok: response.ok, body: await response.json().catch(() => null) };
}

async function fetchManifest(repo: string, name: string, accessToken?: string): Promise<string | null> {
  const result = await fetchJson(
    `https://api.github.com/repos/${repo}/contents/${encodeURIComponent(name)}`,
    accessToken
  );
  if (!result.ok || !result.body || typeof result.body !== "object") return null;
  const content = (result.body as { content?: unknown; encoding?: unknown }).content;
  const encoding = (result.body as { encoding?: unknown }).encoding;
  if (typeof content !== "string" || encoding !== "base64") return null;
  return Buffer.from(content.replace(/\n/g, ""), "base64").toString("utf8");
}

function languagesFromPayload(payload: unknown): TechStackLanguage[] {
  if (!payload || typeof payload !== "object" || Array.isArray(payload)) return [];
  const entries = Object.entries(payload).filter(
    (entry): entry is [string, number] => typeof entry[1] === "number" && entry[1] > 0
  );
  const total = entries.reduce((sum, [, bytes]) => sum + bytes, 0);
  if (total === 0) return [];
  const sorted = entries.sort((left, right) => right[1] - left[1]);
  const topLanguages = sorted.slice(0, 6);
  const otherBytes = sorted.slice(6).reduce((sum, [, bytes]) => sum + bytes, 0);
  const languages = topLanguages.map(([name, bytes]) => ({
    name,
    bytes,
    percentage: Math.round((bytes / total) * 1000) / 10
  }));
  if (otherBytes > 0) {
    languages.push({
      name: "その他",
      bytes: otherBytes,
      percentage: Math.round((otherBytes / total) * 1000) / 10
    });
  }
  return languages;
}

function unavailable(repo: string, detail: string): RepoTechStack {
  return {
    repo,
    frameworks: [],
    languages: [],
    scannedAt: new Date().toISOString(),
    status: "unavailable",
    detail
  };
}

/**
 * GitHub APIで言語構成とルートの依存定義を読む。
 * 公開リポジトリならトークン無しで動き、非公開リポジトリは閲覧権限のあるトークンが必要。
 */
export async function inspectGitHubRepoTechStack(
  repoInput: string,
  accessToken?: string,
  options: { forceRefresh?: boolean } = {}
): Promise<RepoTechStack> {
  const repo = repoInput.trim();
  if (!validRepositoryName(repo)) return unavailable(repo, "リポジトリ名の形式が正しくありません。");

  const cached = readyCache.get(repo.toLowerCase());
  if (!options.forceRefresh && cached && cached.expiresAt > Date.now()) return cached.value;

  try {
    const [languagesResult, rootResult] = await Promise.all([
      fetchJson(`https://api.github.com/repos/${repo}/languages`, accessToken),
      fetchJson(`https://api.github.com/repos/${repo}/contents`, accessToken)
    ]);

    const rootFiles = Array.isArray(rootResult.body)
      ? new Set(
          rootResult.body
            .filter((entry): entry is { name: string; type?: string } =>
              Boolean(entry) && typeof entry === "object" && typeof (entry as { name?: unknown }).name === "string"
            )
            .filter((entry) => entry.type === "file")
            .map((entry) => entry.name)
        )
      : new Set<string>();
    const manifestContents = await Promise.all(
      manifestNames
        .filter((name) => rootFiles.has(name))
        .map(async (name) => [name, await fetchManifest(repo, name, accessToken)] as const)
    );
    const manifests = Object.fromEntries(
      manifestContents.filter((entry): entry is readonly [string, string] => entry[1] !== null)
    );
    const languages = languagesResult.ok ? languagesFromPayload(languagesResult.body) : [];
    const frameworks = detectFrameworksFromManifests(manifests);

    if (!languagesResult.ok && !rootResult.ok) {
      return unavailable(repo, "GitHubから読み取れません。非公開リポジトリは審査員の閲覧権限が必要です。");
    }

    const value: RepoTechStack = {
      repo,
      frameworks,
      languages,
      scannedAt: new Date().toISOString(),
      status: "ready"
    };
    readyCache.set(repo.toLowerCase(), { expiresAt: Date.now() + CACHE_DURATION_MS, value });
    return value;
  } catch {
    return unavailable(repo, "GitHubとの通信に失敗しました。時間をおいて再読み込みしてください。");
  }
}
