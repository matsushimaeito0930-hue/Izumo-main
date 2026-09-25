"use client";

import { Moon, Sun } from "lucide-react";
import { useSyncExternalStore } from "react";

type Theme = "light" | "navy";

function applyTheme(theme: Theme) {
  if (theme === "navy") {
    document.documentElement.dataset.theme = "navy";
  } else {
    delete document.documentElement.dataset.theme;
  }
  window.localStorage.setItem("hackradar-theme", theme);
  window.dispatchEvent(new Event("hackradar-theme-change"));
}

function subscribeToThemeChange(callback: () => void) {
  window.addEventListener("hackradar-theme-change", callback);
  return () => window.removeEventListener("hackradar-theme-change", callback);
}

function getThemeSnapshot(): Theme {
  return document.documentElement.dataset.theme === "navy" ? "navy" : "light";
}

export function ThemeToggle() {
  // サーバー描画は常に白で始め、初期スクリプトが適用済みの実テーマへ安全に同期する。
  const theme = useSyncExternalStore(subscribeToThemeChange, getThemeSnapshot, () => "light");
  const isNavy = theme === "navy";
  const nextTheme: Theme = isNavy ? "light" : "navy";

  return (
    <button
      type="button"
      onClick={() => {
        applyTheme(nextTheme);
      }}
      aria-label={`背景を${nextTheme === "navy" ? "ネイビー" : "白"}に切り替え`}
      title={`背景を${nextTheme === "navy" ? "ネイビー" : "白"}に切り替え`}
      className="flex h-9 shrink-0 items-center gap-1.5 rounded-xl border border-line bg-surface px-2 text-muted shadow-soft transition-[box-shadow,color,transform] hover:text-ink active:translate-y-px active:shadow-pressed lg:px-2.5"
    >
      {isNavy ? <Moon className="size-4 text-sun" /> : <Sun className="size-4 text-sun" />}
      <span className="hidden text-xs font-medium lg:inline">{isNavy ? "ネイビー" : "白"}</span>
    </button>
  );
}
