"use client";

import { useState } from "react";
import { Check, Share2 } from "lucide-react";

/**
 * 招待URLを渡すためのボタン。
 *
 * ボタンを2つ並べても「どっちを押せばいいのか」が増えるだけなので、これ1つにまとめた。
 * 共有シートが使える環境（スマホなど）ではDiscordやLINEへ直接送れる。
 * 使えない環境ではクリップボードにコピーする。
 */
export function ShareLinkButton({
  url,
  label = "招待URLを送る",
  title = "HackRadar への招待",
  text,
  variant = "primary",
  onDone
}: {
  url: string;
  label?: string;
  title?: string;
  text?: string;
  variant?: "primary" | "quiet";
  onDone?: (message: string) => void;
}) {
  const [copied, setCopied] = useState(false);

  async function share() {
    // 相対パスで渡されても、共有先で開けるよう絶対URLにしておく。
    const absoluteUrl = new URL(url, window.location.origin).toString();

    // 共有シートがあれば、そのまま他のアプリへ渡す。
    if (typeof navigator !== "undefined" && navigator.share) {
      try {
        await navigator.share({ title, text, url: absoluteUrl });
        onDone?.("共有しました。");
        return;
      } catch {
        // キャンセルされた場合などはコピーにフォールバックする。
      }
    }

    try {
      await navigator.clipboard.writeText(absoluteUrl);
      setCopied(true);
      window.setTimeout(() => setCopied(false), 1600);
      onDone?.("招待URLをコピーしました。");
    } catch {
      onDone?.("コピーできませんでした。URLを手動で選択してください。");
    }
  }

  if (variant === "quiet") {
    return (
      <button
        type="button"
        onClick={share}
        className="inline-flex items-center gap-1 text-[11px] font-medium text-pulse underline underline-offset-2"
      >
        {copied ? <Check className="size-3" /> : <Share2 className="size-3" />}
        {copied ? "コピーしました" : label}
      </button>
    );
  }

  return (
    <button
      type="button"
      onClick={share}
      className="flex h-10 w-full items-center justify-center gap-2 rounded-xl bg-ink px-4 text-sm font-bold text-white shadow-btn transition-[box-shadow,background-color,transform] hover:bg-ink2 active:translate-y-px active:shadow-pressed"
    >
      {copied ? <Check className="size-4" /> : <Share2 className="size-4" />}
      {copied ? "コピーしました" : label}
    </button>
  );
}
