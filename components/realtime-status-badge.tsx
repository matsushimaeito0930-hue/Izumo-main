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
      className={`inline-flex items-center gap-1.5 rounded-full border px-2.5 py-1 text-xs font-medium shadow-soft ${
        isConnected
          ? "border-field/30 bg-field/10 text-field"
          : "border-sun/30 bg-sun/10 text-sun"
      }`}
    >
      <Icon className={`size-3.5 ${isRefreshing ? "animate-spin" : ""}`} />
      <span>{isRefreshing ? "更新中" : statusText[status]}</span>
    </span>
  );
}
