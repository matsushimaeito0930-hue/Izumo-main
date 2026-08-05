"use client";

import { FormEvent, useEffect, useState } from "react";
import { GitBranch, LoaderCircle } from "lucide-react";
import { Panel } from "@/components/panel";
import type { Team } from "@/lib/types";

/**
 * 参加後にリポジトリを紐づけるための欄。
 * 自分のチームにリポジトリが設定されていないときだけ表示する。
 */
export function TeamRepoSetup({ team, onDone }: { team: Team; onDone: () => void }) {
  const [repos, setRepos] = useState<{ fullName: string }[]>([]);
  const [state, setState] = useState<"loading" | "ready" | "error">("loading");
  const [manual, setManual] = useState(false);
  const [githubRepo, setGithubRepo] = useState("");
  const [isBusy, setIsBusy] = useState(false);
  const [error, setError] = useState("");

  useEffect(() => {
    let cancelled = false;

    fetch("/api/github/repos")
      .then(async (response) => {
        const payload = (await response.json().catch(() => ({}))) as {
          repos?: { fullName: string }[];
        };
        if (cancelled) return;

        if (!response.ok || !payload.repos) {
          setState("error");
          setManual(true);
          return;
        }

        setRepos(payload.repos);
        setState("ready");
        if (payload.repos.length === 0) setManual(true);
      })
      .catch(() => {
        if (cancelled) return;
        setState("error");
        setManual(true);
      });

    return () => {
      cancelled = true;
    };
  }, []);

  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!githubRepo.trim()) return;

    setIsBusy(true);
    setError("");

    try {
      const response = await fetch("/api/teams/repo", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ teamId: team.id, githubRepo })
      });
      const payload = (await response.json().catch(() => ({}))) as { error?: string };

      if (!response.ok) throw new Error(payload.error ?? "設定できませんでした。");

      onDone();
    } catch (submitError) {
      setError(submitError instanceof Error ? submitError.message : "設定できませんでした。");
    } finally {
      setIsBusy(false);
    }
  }

  const fieldClass =
    "h-11 w-full rounded-xl border border-line bg-paper px-3 text-sm text-ink shadow-inset outline-none transition-colors placeholder:text-muted/70 hover:border-lineStrong focus:border-pulse";

  return (
    <Panel
      title="リポジトリを設定してください"
      description={`「${team.name}」にGitHubリポジトリが紐づいていません。設定するとpushが反映されます。`}
    >
      <form onSubmit={submit} className="space-y-3">
        {state === "loading" ? (
          <p className="flex h-11 items-center gap-2 rounded-xl border border-line bg-paper px-3 text-sm text-muted shadow-inset">
            <LoaderCircle className="size-4 animate-spin" />
            リポジトリを読み込んでいます...
          </p>
        ) : manual ? (
          <input
            value={githubRepo}
            onChange={(event) => setGithubRepo(event.target.value)}
            className={fieldClass}
            placeholder="owner/repository"
            required
          />
        ) : (
          <select
            value={githubRepo}
            onChange={(event) => setGithubRepo(event.target.value)}
            className={fieldClass}
            required
          >
            <option value="">選んでください</option>
            {repos.map((repo) => (
              <option key={repo.fullName} value={repo.fullName}>
                {repo.fullName}
              </option>
            ))}
          </select>
        )}

        {state === "ready" && (
          <button
            type="button"
            onClick={() => {
              setManual((current) => !current);
              setGithubRepo("");
            }}
            className="text-xs text-muted underline underline-offset-2 transition-colors hover:text-ink"
          >
            {manual ? "一覧から選ぶ" : "一覧に無い（手入力する）"}
          </button>
        )}

        <button
          type="submit"
          disabled={isBusy || !githubRepo.trim()}
          className="flex h-11 w-full items-center justify-center gap-2 rounded-xl bg-ink px-4 text-sm font-bold text-white shadow-btn transition-[box-shadow,background-color,transform] hover:bg-ink2 active:translate-y-px active:shadow-pressed disabled:cursor-not-allowed disabled:opacity-40 disabled:shadow-none"
        >
          <GitBranch className="size-4" />
          {isBusy ? "設定中..." : "このリポジトリにする"}
        </button>

        {error && <p className="text-xs font-medium text-hot">{error}</p>}
      </form>
    </Panel>
  );
}
