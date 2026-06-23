import * as React from "react";
import { cn } from "@/lib/utils";

export type SectionCardProps = {
  title?: React.ReactNode;
  description?: React.ReactNode;
  action?: React.ReactNode;
  children: React.ReactNode;
  className?: string;
  bodyClassName?: string;
};

/** A titled card surface: section heading row (+ optional action) over content. */
export function SectionCard({
  title,
  description,
  action,
  children,
  className,
  bodyClassName,
}: SectionCardProps) {
  return (
    <section className={cn("rounded-2xl border border-border bg-surface shadow-card", className)}>
      {(title || action) && (
        <header className="flex items-start justify-between gap-4 border-b border-[hsl(var(--muted))] px-5 py-4">
          <div>
            {title ? (
              <h2 className="text-sm font-extrabold uppercase tracking-[0.04em] text-foreground">{title}</h2>
            ) : null}
            {description ? (
              <p className="mt-1 text-[13.5px] text-muted-foreground">{description}</p>
            ) : null}
          </div>
          {action ? <div className="shrink-0">{action}</div> : null}
        </header>
      )}
      <div className={cn("px-5 py-4", bodyClassName)}>{children}</div>
    </section>
  );
}
