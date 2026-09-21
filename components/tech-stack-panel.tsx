"use client";

import { useCallback, useEffect, useState } from "react";
import { Github, RefreshCw, TriangleAlert } from "lucide-react";
import { Panel } from "@/components/panel";
import type { RepoTechStack, TechStackLanguage } from "@/lib/github-tech-stack";
import type { Team } from "@/lib/types";

type TeamTechStack = RepoTechStack & {
  teamId: string;
  teamName: string;
};

const chartColors = ["#2f80d1", "#f1df4f", "#6b3fa0", "#2b6b8f", "#e34c26", "#506784", "#a8a29e"];

function languageChart(languages: TechStackLanguage[]) {
  let cursor = 0;
  const segments = languages.map((language, index) => {
    const next = Math.min(100, cursor + language.percentage);
    const segment = `${chartColors[index % chartColors.length]} ${cursor}% ${next}%`;
    cursor = next;
    return segment;
  });
  return `conic-gradient(${segments.join(", ")})`;
}

export function TechStackPanel({ teams }: { teams: Team[] }) {
  const [stacks, setStacks] = useState<TeamTechStack[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");

  const load = useCallback(async (isManualRefresh = false) => {
    if (isManualRefresh) {
      setLoading(true);
      setError("");
    }
    try {
      const response = await fetch("/api/tech-stacks", { cache: "no-store" });
      const payload = (await response.json().catch(() => ({}))) as {
        stacks?: TeamTechStack[];
        error?: string;
      };
      if (!response.ok) throw new Error(payload.error ?? "技術スタックを取得できませんでした。");
      setStacks(payload.stacks ?? []);
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : "技術スタックを取得できませんでした。");
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    // 初回描画を先に完了させてから通信を始める。描画中の同期的なstate更新を避ける。
    const initialLoad = window.setTimeout(() => void load(false), 0);
    return () => window.clearTimeout(initialLoad);
  }, [load]);

  return (
    <Panel
      title="技術スタック"
      description="GitHubリポジトリの言語構成と依存定義から自動判定しています。評価の補助情報です。"
      action={
        <button
          type="button"
          onClick={() => void load(true)}
          disabled={loading}
          className="grid size-9 place-items-center rounded-xl border border-line bg-paper text-muted transition hover:text-ink disabled:opacity-50"
          aria-label="技術スタックを再読み込み"
          title="再読み込み"
        >
          <RefreshCw className={`size-4 ${loading ? "animate-spin" : ""}`} />
        </button>
      }
    >
      {teams.filter((team) => team.github_repo).length === 0 ? (
        <p className="text-sm leading-6 text-muted">リポジトリが設定されたチームから表示されます。</p>
      ) : error ? (
        <p className="flex items-start gap-2 text-sm leading-6 text-hot">
          <TriangleAlert className="mt-0.5 size-4 shrink-0" />
          {error}
        </p>
      ) : loading ? (
        <p className="text-sm text-muted">リポジトリの構成を読み込んでいます…</p>
      ) : (
        <div className="space-y-4">
          {stacks.map((stack) => (
            <article key={stack.teamId} className="rounded-xl border border-line bg-paper p-4 shadow-inset">
              <div className="min-w-0">
                <h3 className="truncate text-sm font-bold text-ink">{stack.teamName}</h3>
                <a
                  href={`https://github.com/${stack.repo}`}
                  target="_blank"
                  rel="noreferrer"
                  className="mt-1 inline-flex max-w-full items-center gap-1 truncate font-mono text-[11px] text-pulse underline-offset-2 hover:underline"
                >
                  <Github className="size-3 shrink-0" />
                  <span className="truncate">{stack.repo}</span>
                </a>
              </div>

              {stack.status === "unavailable" ? (
                <p className="mt-3 flex items-start gap-2 text-xs leading-5 text-muted">
                  <TriangleAlert className="mt-0.5 size-3.5 shrink-0 text-sun" />
                  {stack.detail}
                </p>
              ) : (
                <div className="mt-3 grid gap-4 sm:grid-cols-[8rem_minmax(0,1fr)] sm:items-center">
                  <div className="flex items-center gap-3 sm:block">
                    <div
                      className="relative size-24 shrink-0 rounded-full"
                      style={{ background: stack.languages.length ? languageChart(stack.languages) : "#d8d3c9" }}
                      aria-label={`${stack.teamName}の言語構成`}
                      role="img"
                    >
                      <div className="absolute inset-[22%] rounded-full bg-paper" />
                    </div>
                    {stack.languages.length === 0 && (
                      <p className="text-xs text-muted">言語構成は取得できませんでした</p>
                    )}
                  </div>
                  <div>
                    <p className="text-xs font-medium text-muted">検出した技術</p>
                    {stack.frameworks.length ? (
                      <div className="mt-1.5 flex flex-wrap gap-1.5">
                        {stack.frameworks.map((framework) => (
                          <span key={framework} className="rounded-full bg-pulse/10 px-2 py-1 text-xs font-medium text-pulse">
                            {framework}
                          </span>
                        ))}
                      </div>
                    ) : (
                      <p className="mt-1 text-xs text-muted">主要な設定ファイルからは検出できませんでした。</p>
                    )}
                    {stack.languages.length > 0 && (
                      <ul className="mt-3 flex flex-wrap gap-x-3 gap-y-1.5">
                        {stack.languages.map((language, index) => (
                          <li key={language.name} className="flex items-center gap-1.5 text-xs text-ink2">
                            <span
                              className="size-2.5 rounded-full"
                              style={{ backgroundColor: chartColors[index % chartColors.length] }}
                            />
                            {language.name} {language.percentage}%
                          </li>
                        ))}
                      </ul>
                    )}
                  </div>
                </div>
              )}
            </article>
          ))}
        </div>
      )}
    </Panel>
  );
}
