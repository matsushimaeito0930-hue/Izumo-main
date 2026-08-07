import { ChevronRight, GraduationCap, Settings, Users } from "lucide-react";

export type OnboardingRole = "participant" | "mentor" | "admin";

const roleCards: {
  role: OnboardingRole;
  label: string;
  detail: string;
  note: string;
  icon: typeof Users;
}[] = [
  {
    role: "participant",
    label: "参加者",
    detail: "チームで開発する人",
    note: "GitHubログインが必要です",
    icon: Users
  },
  {
    role: "mentor",
    label: "メンター",
    detail: "質問に答える人",
    note: "コードと名前だけで入れます",
    icon: GraduationCap
  },
  {
    role: "admin",
    label: "運営",
    detail: "イベントとチームを管理する人",
    note: "GitHubログインが必要です",
    icon: Settings
  }
];

/**
 * 最初の画面。立場を選んでから、その立場の入口だけを見せる。
 * 3つの入口を1画面に並べると初参加の人がどれを触ればいいか分からなくなるため。
 */
export function RolePicker({ onSelect }: { onSelect: (role: OnboardingRole) => void }) {
  return (
    <div className="space-y-3">
      <p className="text-center text-sm leading-6 text-ink2">
        役割を選択してください
      </p>

      {roleCards.map((card) => {
        const Icon = card.icon;
        return (
          <button
            key={card.role}
            type="button"
            onClick={() => onSelect(card.role)}
            className="flex w-full items-center gap-3.5 rounded-2xl border border-line bg-paper p-4 text-left shadow-soft transition-[box-shadow,border-color,transform] hover:border-lineStrong hover:shadow-card active:translate-y-px active:shadow-pressed"
          >
            <span className="grid size-11 shrink-0 place-items-center rounded-xl bg-paper2 text-ink2 shadow-inset">
              <Icon className="size-5" />
            </span>
            <span className="min-w-0 flex-1">
              <span className="block text-base font-bold tracking-tight text-ink">
                {card.label}
              </span>
              <span className="block text-xs leading-5 text-muted">{card.detail}</span>
              <span className="mt-0.5 block text-[11px] leading-4 text-muted/80">
                {card.note}
              </span>
            </span>
            <ChevronRight className="size-4 shrink-0 text-muted" />
          </button>
        );
      })}
    </div>
  );
}
