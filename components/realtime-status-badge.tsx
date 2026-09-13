import { RefreshCw, Wifi, WifiOff } from "lucide-react";

type RealtimeStatus = "fallback-polling" | "connecting" | "connected" | "error";

const statusText: Record<RealtimeStatus, string> = {
  "fallback-polling": "定期更新中",
  connecting: "接続中",
  connected: "リアルタイム接続中",
  error: "定期更新に切替"
};

export function RealtimeStatusBadge({
  status,
  isRefreshing
}: {
  status: RealtimeStatus;
  isRefreshing: boolean;
}) {
  const isConnected = status === "connected";
  const Icon = isRefreshing ? RefreshCw : isConnected ? Wifi : WifiOff;

  return (
    <span
      role="status"
      aria-live="polite"
      className={`fixed right-3 top-[4.5rem] z-40 inline-flex items-center gap-1.5 rounded-full border bg-paper/95 px-2.5 py-1 text-xs font-medium shadow-soft backdrop-blur sm:right-6 ${
        isConnected
          ? "border-field/50 text-field"
          : "border-sun/50 text-sun"
      }`}
    >
      <Icon className={`size-3.5 ${isRefreshing ? "animate-spin" : ""}`} />
      <span>{isRefreshing ? "更新中" : statusText[status]}</span>
    </span>
  );
}
