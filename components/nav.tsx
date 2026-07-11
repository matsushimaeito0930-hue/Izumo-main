import Link from "next/link";
import { Activity, CircleHelp, Home, Orbit, Trophy } from "lucide-react";

const navItems = [
  { href: "/", label: "Lobby", icon: Activity },
  { href: "/plaza", label: "Plaza", icon: Orbit },
  { href: "/home", label: "Home", icon: Home },
  { href: "/help", label: "Help", icon: CircleHelp },
  { href: "/ranking", label: "Ranking", icon: Trophy }
];

export function Nav() {
  return (
    <nav className="sticky top-0 z-30 border-b border-white/10 bg-void/86 backdrop-blur-xl">
      <div className="mx-auto flex max-w-7xl items-center justify-between px-5 py-3">
        <Link href="/" className="flex items-center gap-3">
          <span className="grid size-9 place-items-center rounded-md border border-pulse/40 bg-pulse/10 text-lg shadow-neon">
            HV
          </span>
          <span>
            <span className="block text-sm font-black uppercase tracking-[0.18em] text-white">
              HackVerse
            </span>
            <span className="block text-xs text-white/55">Realtime hackathon lobby</span>
          </span>
        </Link>
        <div className="flex items-center gap-1 rounded-md border border-white/10 bg-white/[0.04] p-1">
          {navItems.map((item) => {
            const Icon = item.icon;
            return (
              <Link
                key={item.href}
                href={item.href}
                className="flex h-9 items-center gap-2 rounded px-3 text-sm font-semibold text-white/70 transition hover:bg-white/10 hover:text-white"
              >
                <Icon className="size-4" />
                <span className="hidden sm:inline">{item.label}</span>
              </Link>
            );
          })}
        </div>
      </div>
    </nav>
  );
}
