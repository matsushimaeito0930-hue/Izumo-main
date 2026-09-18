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

  return (
    <span
      role="status"
      aria-live="polite"
      className={`fixed right-3 top-[4.5rem] z-40 inline-flex items-center gap-1.5 rounded-full border bg-paper/95 px-2.5 py-1 text-xs font-medium shadow-soft backdrop-blur sm:right-6 ${
        isConnected ? "border-field/50 text-field" : "border-sun/50 text-sun"
      }`}
    >
      {/* 接続状態と取得中かどうかは別の話。片方で上書きすると、
          遅いのが回線なのか取得処理なのか切り分けられなくなる。 */}
      {isConnected ? <Wifi className="size-3.5" /> : <WifiOff className="size-3.5" />}
      <span>{statusText[status]}</span>
      {isRefreshing && <RefreshCw className="size-3 animate-spin opacity-70" />}
    </span>
  );
}
