import { GraduationCap } from "lucide-react";
import { Panel } from "@/components/panel";
import type { MentorProfile } from "@/lib/types";

const availabilityLabels = {
  available: "対応可能",
  busy: "対応中",
  offline: "離席中"
};

const availabilityClasses = {
  available: "border-field/30 bg-field/10 text-field",
  busy: "border-sun/30 bg-sun/10 text-sun",
  offline: "border-line bg-paper2 text-muted"
};

export function MentorList({ mentors }: { mentors: MentorProfile[] }) {
  return (
    <Panel title="メンター" description="いま相談できる人。">
      <ul className="space-y-2">
        {mentors.map((mentor) => (
          <li
            key={mentor.id}
            className="flex items-center justify-between gap-3 rounded-xl border border-line/70 bg-surface p-3 shadow-soft"
          >
            <div className="flex min-w-0 items-center gap-3">
              <span className="grid size-9 shrink-0 place-items-center rounded-xl bg-pulse/10 text-pulse shadow-soft">
                <GraduationCap className="size-5" />
              </span>
              <div className="min-w-0">
                <p className="truncate text-sm font-bold text-ink">{mentor.display_name}</p>
                <p className="truncate text-xs text-muted">{mentor.specialty}</p>
              </div>
            </div>
            <span
              className={`shrink-0 rounded-full border px-2.5 py-1 text-xs font-medium ${
                availabilityClasses[mentor.availability]
              }`}
            >
              {availabilityLabels[mentor.availability]}
            </span>
          </li>
        ))}
      </ul>
    </Panel>
  );
}
