"use client";

import { useState } from "react";
import { Check, Share2 } from "lucide-react";

/**
 * 運営だけに見せる招待コード。
 *
 * ボタンは1つだけ。共有シートが使える環境ではDiscordなどへ直接送れ、
 * 使えない環境では招待URLをクリップボードにコピーする。
 * コード自体は隣に出しているので、口頭で伝えたいときはそれを読めばよい。
 */
export function InviteBadge({ joinCode }: { joinCode: string }) {
  const [copied, setCopied] = useState(false);

  async function share() {
    const url = `${window.location.origin}/?code=${encodeURIComponent(joinCode)}`;

    if (navigator.share) {
      try {
        await navigator.share({
          title: "HackRadar への招待",
          text: "このリンクから参加できます。",
          url
        });
        return;
      } catch {
        // キャンセルされたときはコピーに切り替える。
      }
    }

    try {
      await navigator.clipboard.writeText(url);
      setCopied(true);
      window.setTimeout(() => setCopied(false), 1600);
    } catch {
      // クリップボードが使えない環境では何もしない（コードは画面に出ている）。
    }
  }

  return (
    <div className="flex shrink-0 items-center gap-1.5 rounded-xl border border-line/70 bg-surface py-1 pl-2.5 pr-1 shadow-soft">
      <span className="hidden text-[11px] text-muted md:inline">招待コード</span>
      <span className="font-mono text-sm font-bold tracking-wider text-ink">
        {joinCode}
      </span>
      <button
        type="button"
        onClick={share}
        title="招待URLを送る"
        aria-label="招待URLを送る"
        className="grid size-7 shrink-0 place-items-center rounded-lg text-muted transition-colors hover:bg-paper2 hover:text-ink"
      >
        {copied ? (
          <Check className="size-4 text-pulse" />
        ) : (
          <Share2 className="size-4" />
        )}
      </button>
    </div>
  );
}
