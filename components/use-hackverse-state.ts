"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { createBrowserSupabaseClient } from "@/lib/supabase-browser";
import type {
  ActivityType,
  ChatChannel,
  ChatMessage,
  HackVerseState
} from "@/lib/types";

type RealtimeStatus = "fallback-polling" | "connecting" | "connected" | "error";

export function useHackVerseState(initialState: HackVerseState) {
  const [state, setState] = useState(initialState);
  const [isRefreshing, setIsRefreshing] = useState(false);
  // 初回表示では光らせない。あとから届いたイベントだけをハイライトする。
  const [lastActivityId, setLastActivityId] = useState("");
  const newestActivityIdRef = useRef(initialState.activities[0]?.id ?? "");
  const [realtimeStatus, setRealtimeStatus] =
    useState<RealtimeStatus>("fallback-polling");

  const refresh = useCallback(async () => {
    setIsRefreshing(true);
    try {
      const response = await fetch("/api/state", { cache: "no-store" });
      if (!response.ok) {
        return;
      }
      const nextState = (await response.json()) as HackVerseState;
      const newestId = nextState.activities[0]?.id ?? "";

      if (newestId && newestId !== newestActivityIdRef.current) {
        newestActivityIdRef.current = newestId;
        setLastActivityId(newestId);
      }

      setState(nextState);
    } finally {
      setIsRefreshing(false);
    }
  }, []);

  useEffect(() => {
    const supabase = createBrowserSupabaseClient();

    if (!supabase) {
      setRealtimeStatus("fallback-polling");
      const interval = window.setInterval(refresh, 2200);
      return () => window.clearInterval(interval);
    }

    setRealtimeStatus("connecting");
    let refreshTimeout: number | undefined;

    const scheduleRefresh = () => {
      if (refreshTimeout) {
        window.clearTimeout(refreshTimeout);
      }

      refreshTimeout = window.setTimeout(() => {
        void refresh();
      }, 160);
    };

    const channel = supabase
      .channel("hackverse-lobby")
      .on(
        "postgres_changes",
        { event: "*", schema: "public", table: "activities" },
        scheduleRefresh
      )
      .on(
        "postgres_changes",
        { event: "*", schema: "public", table: "teams" },
        scheduleRefresh
      )
      .on(
        "postgres_changes",
        { event: "*", schema: "public", table: "help_posts" },
        scheduleRefresh
      )
      .on(
        "postgres_changes",
        { event: "*", schema: "public", table: "help_replies" },
        scheduleRefresh
      )
      .on(
        "postgres_changes",
        { event: "*", schema: "public", table: "chat_messages" },
        scheduleRefresh
      )
      .subscribe((status: string) => {
        if (status === "SUBSCRIBED") {
          setRealtimeStatus("connected");
          return;
        }

        if (status === "CHANNEL_ERROR" || status === "TIMED_OUT") {
          setRealtimeStatus("error");
        }
      });

    const safetyPoll = window.setInterval(refresh, 12000);

    return () => {
      if (refreshTimeout) {
        window.clearTimeout(refreshTimeout);
      }
      window.clearInterval(safetyPoll);
      void supabase.removeChannel(channel);
    };
  }, [refresh]);

  const triggerDemoEvent = useCallback(
    async (teamId: string, type: ActivityType) => {
      const response = await fetch("/api/demo/event", {
        method: "POST",
        headers: {
          "content-type": "application/json"
        },
        body: JSON.stringify({ teamId, type })
      });

      if (!response.ok) {
        throw new Error("Demo event failed.");
      }

      await refresh();
    },
    [refresh]
  );

  const createHelp = useCallback(
    async (input: {
      teamId: string;
      title: string;
      body: string;
      category: string;
    }) => {
      const response = await fetch("/api/help", {
        method: "POST",
        headers: {
          "content-type": "application/json"
        },
        body: JSON.stringify(input)
      });

      if (!response.ok) {
        const payload = (await response.json().catch(() => ({}))) as { error?: string };
        throw new Error(payload.error ?? "質問を投稿できませんでした。");
      }

      await refresh();
    },
    [refresh]
  );

  const createHelpReply = useCallback(
    async (input: { helpPostId: string; body: string; authorName?: string }) => {
      const response = await fetch("/api/help/replies", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify(input)
      });

      if (!response.ok) {
        const payload = (await response.json().catch(() => ({}))) as { error?: string };
        throw new Error(payload.error ?? "回答を投稿できませんでした。");
      }

      await refresh();
    },
    [refresh]
  );

  const acceptHelpReply = useCallback(
    async (input: { helpPostId: string; replyId: string }) => {
      const response = await fetch("/api/help/replies/accept", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify(input)
      });

      if (!response.ok) {
        const payload = (await response.json().catch(() => ({}))) as { error?: string };
        throw new Error(payload.error ?? "採用できませんでした。");
      }

      await refresh();
    },
    [refresh]
  );

  const createChatMessage = useCallback(
    async (input: {
      channel: ChatChannel;
      teamId?: string;
      authorName: string;
      authorRole: ChatMessage["author_role"];
      body: string;
    }) => {
      const response = await fetch("/api/chat", {
        method: "POST",
        headers: {
          "content-type": "application/json"
        },
        body: JSON.stringify(input)
      });

      if (!response.ok) {
        const payload = (await response.json().catch(() => ({}))) as { error?: string };
        throw new Error(payload.error ?? "Message could not be sent.");
      }

      await refresh();
    },
    [refresh]
  );

  return useMemo(
    () => ({
      state,
      isRefreshing,
      realtimeStatus,
      lastActivityId,
      refresh,
      triggerDemoEvent,
      createHelp,
      createHelpReply,
      acceptHelpReply,
      createChatMessage
    }),
    [
      state,
      isRefreshing,
      realtimeStatus,
      lastActivityId,
      refresh,
      triggerDemoEvent,
      createHelp,
      createHelpReply,
      acceptHelpReply,
      createChatMessage
    ]
  );
}
