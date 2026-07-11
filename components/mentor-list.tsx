import { GraduationCap } from "lucide-react";
import { Panel } from "@/components/panel";
import type { MentorProfile } from "@/lib/types";

const availabilityClasses = {
  available: "bg-field text-void",
  busy: "bg-hot text-white",
  offline: "bg-white/20 text-white/70"
};

export function MentorList({ mentors }: { mentors: MentorProfile[] }) {
  return (
    <Panel title="Mentors">
      <div className="space-y-3">
        {mentors.map((mentor) => (
          <div
            key={mentor.id}
            className="flex items-center justify-between gap-3 rounded-md border border-white/10 bg-white/[0.045] p-3"
          >
            <div className="flex min-w-0 items-center gap-3">
              <span className="grid size-10 shrink-0 place-items-center rounded-md bg-pulse/10 text-pulse">
                <GraduationCap className="size-5" />
              </span>
              <div className="min-w-0">
                <p className="truncate text-sm font-black text-white">
                  {mentor.display_name}
                </p>
                <p className="truncate text-xs text-white/50">{mentor.specialty}</p>
              </div>
            </div>
            <span
              className={`rounded px-2 py-1 text-xs font-black uppercase ${availabilityClasses[mentor.availability]}`}
            >
              {mentor.availability}
            </span>
          </div>
        ))}
      </div>
    </Panel>
  );
}
