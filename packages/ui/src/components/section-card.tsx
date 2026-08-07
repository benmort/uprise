import * as React from "react";
import { cn } from "../lib/utils";

/** `title` is a ReactNode slot, so HTMLAttributes' string `title` (the tooltip) is omitted
 *  from the rest-spread — the two would collide. Everything else (id, data-*, aria-*)
 *  forwards to the root `<section>`, which is what lets tour anchors and e2e ids ride a
 *  SectionCard instead of forcing callers back to a raw div. */
export interface SectionCardProps extends Omit<React.HTMLAttributes<HTMLElement>, "title"> {
  title?: React.ReactNode;
  description?: React.ReactNode;
  action?: React.ReactNode;
  bodyClassName?: string;
}

/** A titled card surface: section heading row (+ optional action) over content. */
export const SectionCard = React.forwardRef<HTMLElement, SectionCardProps>(
  ({ title, description, action, children, className, bodyClassName, ...rest }, ref) => (
    <section
      ref={ref}
      className={cn("rounded-2xl border border-border bg-surface shadow-card", className)}
      {...rest}
    >
      {(title || action) && (
        <header className="flex items-start justify-between gap-4 border-b border-muted px-5 py-4">
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
  ),
);
SectionCard.displayName = "SectionCard";
