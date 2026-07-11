"use client";

import { FormEvent, useState } from "react";
import { Send } from "lucide-react";
import { Panel } from "@/components/panel";
import type { Team } from "@/lib/types";

export function HelpComposer({
  teams,
  onSubmit
}: {
  teams: Team[];
  onSubmit: (input: {
    teamId: string;
    title: string;
    body: string;
    category: string;
  }) => Promise<void>;
}) {
  const [teamId, setTeamId] = useState(teams[0]?.id ?? "");
  const [title, setTitle] = useState("");
  const [body, setBody] = useState("");
  const [category, setCategory] = useState("Frontend");
  const [isSubmitting, setIsSubmitting] = useState(false);

  async function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setIsSubmitting(true);
    try {
      await onSubmit({ teamId, title, body, category });
      setTitle("");
      setBody("");
    } finally {
      setIsSubmitting(false);
    }
  }

  return (
    <Panel title="Post Help">
      <form onSubmit={handleSubmit} className="space-y-3">
        <div className="grid gap-3 sm:grid-cols-2">
          <label className="block">
            <span className="mb-2 block text-xs font-bold uppercase tracking-[0.14em] text-white/55">
              Team
            </span>
            <select
              value={teamId}
              onChange={(event) => setTeamId(event.target.value)}
              className="h-10 w-full rounded-md border border-white/10 bg-void px-3 text-sm text-white outline-none focus:border-pulse"
            >
              {teams.map((team) => (
                <option key={team.id} value={team.id}>
                  {team.name}
                </option>
              ))}
            </select>
          </label>
          <label className="block">
            <span className="mb-2 block text-xs font-bold uppercase tracking-[0.14em] text-white/55">
              Category
            </span>
            <select
              value={category}
              onChange={(event) => setCategory(event.target.value)}
              className="h-10 w-full rounded-md border border-white/10 bg-void px-3 text-sm text-white outline-none focus:border-pulse"
            >
              <option>Frontend</option>
              <option>Backend</option>
              <option>Realtime</option>
              <option>UI/UX</option>
              <option>Pitch</option>
            </select>
          </label>
        </div>
        <label className="block">
          <span className="mb-2 block text-xs font-bold uppercase tracking-[0.14em] text-white/55">
            Title
          </span>
          <input
            value={title}
            onChange={(event) => setTitle(event.target.value)}
            required
            placeholder="Firebase auth is not returning a session"
            className="h-10 w-full rounded-md border border-white/10 bg-void px-3 text-sm text-white outline-none placeholder:text-white/30 focus:border-pulse"
          />
        </label>
        <label className="block">
          <span className="mb-2 block text-xs font-bold uppercase tracking-[0.14em] text-white/55">
            Details
          </span>
          <textarea
            value={body}
            onChange={(event) => setBody(event.target.value)}
            required
            rows={4}
            placeholder="What did you try, and where are you blocked?"
            className="w-full resize-none rounded-md border border-white/10 bg-void px-3 py-2 text-sm text-white outline-none placeholder:text-white/30 focus:border-pulse"
          />
        </label>
        <button
          type="submit"
          disabled={isSubmitting || !teamId}
          className="flex h-11 w-full items-center justify-center gap-2 rounded-md bg-hot px-4 text-sm font-black text-white shadow-hot transition hover:bg-hot/90 disabled:cursor-not-allowed disabled:opacity-50"
        >
          <Send className="size-4" />
          <span>{isSubmitting ? "Posting" : "Post Help"}</span>
        </button>
      </form>
    </Panel>
  );
}
