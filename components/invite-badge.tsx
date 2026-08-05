"use client";

import { useState } from "react";
import { Check, Copy, Link2 } from "lucide-react";

/**
 * 運営だけに見せる参加コード。Discordにそのまま貼れる招待URLもコピーできる。
 * ヘッダーに常時出しておくことで、配布のたびに管理画面へ戻らなくて済む。
 */
export function InviteBadge({ joinCode }: { joinCode: string }) {
  const [copied, setCopied] = useState<"code" | "url" | null>(null);

  async function copy(kind: "code" | "url") {
    const text =
      kind === "code"
        ? joinCode
        : `${window.location.origin}/?code=${encodeURIComponent(joinCode)}`;

    try {
      await navigator.clipboard.writeText(text);
      setCopied(kind);
      window.setTimeout(() => setCopied(null), 1600);
    } catch {
      // クリップボードが使えない環境では何もしない（コードは画面に出ている）。
    }
  }

  return (
    <div className="flex shrink-0 items-center gap-1 rounded-xl border border-line/70 bg-surface py-1 pl-2.5 pr-1 shadow-soft">
      <span className="hidden text-[11px] text-muted md:inline">参加コード</span>
      <button
        type="button"
        onClick={() => copy("code")}
        title="参加コードをコピー"
        className="flex items-center gap-1.5 rounded-lg px-1.5 py-0.5 font-mono text-sm font-bold tracking-wider text-ink transition-colors hover:bg-paper2"
      >
        {joinCode}
        {copied === "code" ? (
          <Check className="size-3.5 text-pulse" />
        ) : (
          <Copy className="size-3.5 text-muted" />
        )}
      </button>
      <button
        type="button"
        onClick={() => copy("url")}
        title="招待URLをコピー（Discordに貼れます）"
        aria-label="招待URLをコピー"
        className="grid size-7 shrink-0 place-items-center rounded-lg text-muted transition-colors hover:bg-paper2 hover:text-ink"
      >
        {copied === "url" ? (
          <Check className="size-4 text-pulse" />
        ) : (
          <Link2 className="size-4" />
        )}
      </button>
    </div>
  );
}
