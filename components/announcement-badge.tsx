"use client";

import { useCallback, useEffect, useState } from "react";

const SEEN_KEY = "hackradar-announcements-seen";
const SEEN_EVENT = "hackradar-announcements-seen";

/**
 * お知らせ画面を開いた時点までを既読にする。
 * 同じタブのバッジにもすぐ反映させたいので、イベントで知らせる。
 */
export function markAnnouncementsSeen(latestAt: string | null) {
  if (typeof window === "undefined" || !latestAt) return;

  const current = window.localStorage.getItem(SEEN_KEY);
  if (current && Date.parse(current) >= Date.parse(latestAt)) return;

  window.localStorage.setItem(SEEN_KEY, latestAt);
  window.dispatchEvent(new Event(SEEN_EVENT));
}

/**
 * ナビのタブに重ねる未読件数バッジ。
 *
 * 運営がお知らせを出したことに気づかないまま進むのを防ぐのが目的なので、
 * 数字を出して「何件たまっているか」まで分かるようにする。
 */
export function AnnouncementBadge() {
  const [unread, setUnread] = useState(0);

  const load = useCallback(async () => {
    try {
      const response = await fetch("/api/announcements", { cache: "no-store" });
      if (!response.ok) return;

      const data = (await response.json()) as {
        items?: { id: string; created_at: string }[];
      };
      const seenRaw = window.localStorage.getItem(SEEN_KEY);
      const seenAt = seenRaw ? Date.parse(seenRaw) : 0;

      setUnread(
        (data.items ?? []).filter((item) => Date.parse(item.created_at) > seenAt).length
      );
    } catch {
      // 通信に失敗してもバッジを出さないだけ。本体の邪魔はしない。
    }
  }, []);

  useEffect(() => {
    void load();

    const interval = window.setInterval(load, 8000);
    const onSeen = () => void load();
    window.addEventListener(SEEN_EVENT, onSeen);
    // 別のタブで読んだ場合にも合わせる。
    window.addEventListener("storage", onSeen);

    return () => {
      window.clearInterval(interval);
      window.removeEventListener(SEEN_EVENT, onSeen);
      window.removeEventListener("storage", onSeen);
    };
  }, [load]);

  if (unread <= 0) return null;

  return (
    <span
      aria-label={`未読のお知らせ ${unread}件`}
      className="absolute -right-1 -top-1 grid min-w-[1.15rem] place-items-center rounded-full bg-hot px-1 text-[11px] font-bold leading-[1.15rem] text-white shadow-soft ring-2 ring-paper"
    >
      {unread > 9 ? "9+" : unread}
    </span>
  );
}
