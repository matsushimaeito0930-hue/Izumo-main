import { Wifi, WifiOff } from "lucide-react";

type RealtimeStatus = "fallback-polling" | "connecting" | "connected" | "error";

const statusText: Record<RealtimeStatus, string> = {
  "fallback-polling": "Polling",
  connecting: "Realtime connecting",
  connected: "Realtime connected",
  error: "Realtime fallback"
};

export function RealtimeStatusBadge({
  status,
  isRefreshing
}: {
  status: RealtimeStatus;
  isRefreshing: boolean;
}) {
  const Icon = status === "connected" ? Wifi : WifiOff;

  return (
    <span className="inline-flex items-center gap-2 rounded-md border border-white/10 bg-white/[0.06] px-2.5 py-1 text-xs font-black uppercase tracking-[0.12em] text-white/70">
      <Icon className={status === "connected" ? "size-3.5 text-field" : "size-3.5 text-sun"} />
      <span>{isRefreshing ? "Syncing" : statusText[status]}</span>
    </span>
  );
}
