"use client";

import Image from "next/image";
import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import { CircleHelp, Github, LayoutDashboard, LogOut } from "lucide-react";
import { AnnouncementBadge } from "@/components/announcement-badge";
import { HackRadarLogo } from "@/components/hackradar-logo";
import type { UserRole } from "@/lib/types";

type Viewer = {
  login: string;
  displayName: string;
  avatarUrl: string | null;
  role: UserRole;
};

const roleLabels: Record<UserRole, string> = {
  participant: "参加者",
  mentor: "メンター",
  admin: "運営",
  judge: "審査員"
};

// ナビは2つだけ。増やすと初参加者がどこを見ればいいか分からなくなる。
// 2つ目には運営からのお知らせも並ぶので、ラベルにその旨を出しておく。
const navItems = [
  { href: "/dashboard", label: "開発状況", icon: LayoutDashboard },
  { href: "/help", label: "質問・お知らせ", icon: CircleHelp }
];

// 審査員は投稿できないので、2つ目は「お知らせ」と呼ぶ。
const judgeNavItems = [
  { href: "/dashboard", label: "開発状況", icon: LayoutDashboard },
  { href: "/help", label: "お知らせ", icon: CircleHelp }
];

export function Nav({
  authConfigured = false,
  viewer = null
}: {
  authConfigured?: boolean;
  viewer?: Viewer | null;
}) {
  const pathname = usePathname();
  const router = useRouter();

  async function logout() {
    await fetch("/api/auth/logout", { method: "POST" });
    window.localStorage.removeItem("hackverse-session");
    router.push("/");
    router.refresh();
  }

  return (
    <nav className="sticky top-0 z-30 border-b border-line bg-paper/90 backdrop-blur">
      <div className="mx-auto flex min-w-0 max-w-5xl items-center justify-between gap-4 px-4 py-3 sm:px-6">
        {/* ロゴはトップへ。ここから役割を選び直せるようにしておく。 */}
        <Link href="/" className="flex shrink-0 items-center gap-2.5">
          <HackRadarLogo className="size-9" />
          <span className="hidden text-sm font-bold tracking-tight text-ink sm:block">
            HackRadar
          </span>
        </Link>

        <div className="flex items-center gap-1">
          {(viewer?.role === "judge" ? judgeNavItems : navItems).map((item) => {
            const Icon = item.icon;
            const isActive = pathname === item.href;
            return (
              <Link
                key={item.href}
                href={item.href}
                aria-current={isActive ? "page" : undefined}
                className={`relative flex h-9 shrink-0 items-center gap-2 rounded-xl px-3.5 text-sm font-medium transition-[box-shadow,background-color,color] ${
                  isActive
                    ? "bg-ink text-white shadow-btn"
                    : "text-ink2 hover:bg-paper2 hover:text-ink"
                }`}
              >
                <Icon className="size-4" />
                {item.label}
                {/* 運営のお知らせに気づかないまま進むのを防ぐ。 */}
                {item.href === "/help" && <AnnouncementBadge />}
              </Link>
            );
          })}
        </div>

        {viewer ? (
          <div className="flex shrink-0 items-center gap-2">
            <span className="hidden items-center gap-2 rounded-xl border border-line/70 bg-surface py-1 pl-1.5 pr-3 shadow-soft sm:flex">
              {viewer.avatarUrl ? (
                <Image
                  src={viewer.avatarUrl}
                  alt=""
                  width={24}
                  height={24}
                  className="size-6 rounded-full"
                />
              ) : (
                <span className="grid size-6 place-items-center rounded-full bg-paper2 text-xs text-muted">
                  {viewer.displayName.slice(0, 1)}
                </span>
              )}
              <span className="min-w-0">
                <span className="block truncate text-xs font-medium text-ink">
                  {viewer.displayName}
                </span>
                <span className="block truncate text-[11px] text-muted">
                  {roleLabels[viewer.role]}
                </span>
              </span>
            </span>
            <button
              type="button"
              onClick={logout}
              aria-label="ログアウト"
              className="grid size-9 shrink-0 place-items-center rounded-xl border border-line bg-surface text-muted shadow-soft transition-[box-shadow,color,transform] hover:text-ink active:translate-y-px active:shadow-pressed"
            >
              <LogOut className="size-4" />
            </button>
          </div>
        ) : authConfigured ? (
          <a
            href="/api/auth/github"
            className="flex h-9 shrink-0 items-center gap-2 rounded-xl bg-ink px-3 text-sm font-medium text-white shadow-btn transition-[box-shadow,background-color,transform] hover:bg-ink2 active:translate-y-px active:shadow-pressed"
          >
            <Github className="size-4" />
            <span className="hidden sm:inline">ログイン</span>
          </a>
        ) : (
          <span className="w-9" />
        )}
      </div>
    </nav>
  );
}
