import { CircleHelp } from "lucide-react";
import { Panel } from "@/components/panel";
import type { HelpPostView } from "@/lib/types";

const statusClasses = {
  open: "border-hot/35 bg-hot/10 text-hot",
  helping: "border-sun/35 bg-sun/10 text-sun",
  solved: "border-field/35 bg-field/10 text-field"
};

export function HelpBoard({ posts }: { posts: HelpPostView[] }) {
  const openPosts = posts.filter((post) => post.status !== "solved");

  return (
    <Panel title="Help Board">
      <div className="space-y-3">
        {openPosts.slice(0, 6).map((post) => (
          <article
            key={post.id}
            className="rounded-md border border-white/10 bg-white/[0.045] p-3"
          >
            <div className="mb-2 flex items-start justify-between gap-3">
              <div className="flex min-w-0 items-center gap-2">
                <CircleHelp className="size-4 shrink-0 text-hot" />
                <h3 className="truncate text-sm font-black text-white">{post.title}</h3>
              </div>
              <span
                className={`rounded border px-2 py-0.5 text-xs font-bold ${statusClasses[post.status]}`}
              >
                {post.status}
              </span>
            </div>
            <p className="line-clamp-2 text-sm text-white/62">{post.body}</p>
            <p className="mt-2 text-xs text-white/45">
              {post.category} / {post.team_name} / {post.author_name}
            </p>
          </article>
        ))}
      </div>
    </Panel>
  );
}
