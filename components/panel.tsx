import { clsx } from "clsx";

export function Panel({
  title,
  action,
  children,
  className
}: {
  title?: string;
  action?: React.ReactNode;
  children: React.ReactNode;
  className?: string;
}) {
  return (
    <section
      className={clsx(
        "scanline rounded-lg border border-white/10 bg-panel/82 p-4 shadow-[0_14px_42px_rgba(0,0,0,0.26)] backdrop-blur",
        className
      )}
    >
      {(title || action) && (
        <div className="mb-4 flex items-center justify-between gap-4">
          {title ? (
            <h2 className="text-sm font-black uppercase tracking-[0.16em] text-white/72">
              {title}
            </h2>
          ) : (
            <span />
          )}
          {action}
        </div>
      )}
      {children}
    </section>
  );
}
