import { clsx } from "clsx";

export function Panel({
  title,
  description,
  action,
  children,
  className
}: {
  title?: string;
  description?: string;
  action?: React.ReactNode;
  children: React.ReactNode;
  className?: string;
}) {
  return (
    <section
      className={clsx("rounded-2xl border border-line/70 bg-surface shadow-card", className)}
    >
      {(title || action) && (
        <div className="flex items-start justify-between gap-4 border-b border-line px-5 py-4">
          <div className="min-w-0">
            {title ? (
              <h2 className="text-base font-bold tracking-tight text-ink">{title}</h2>
            ) : (
              <span />
            )}
            {description ? (
              <p className="mt-1 text-xs leading-5 text-muted">{description}</p>
            ) : null}
          </div>
          {action ? <div className="shrink-0">{action}</div> : null}
        </div>
      )}
      <div className="p-5">{children}</div>
    </section>
  );
}
