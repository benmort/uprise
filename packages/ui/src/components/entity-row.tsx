import * as React from "react";
import { Slot } from "@radix-ui/react-slot";
import { cn } from "../lib/utils";

export interface EntityRowProps extends Omit<React.HTMLAttributes<HTMLDivElement>, "title"> {
  /** Leading icon/avatar slot. */
  icon?: React.ReactNode;
  /** Primary line. */
  title: React.ReactNode;
  /** Secondary line under the title. */
  meta?: React.ReactNode;
  /** Right-aligned slot — badges, buttons, a chevron. */
  trailing?: React.ReactNode;
  /**
   * Render into the child element instead of a `<div>` (Radix Slot) — e.g.
   * `<EntityRow asChild …><button type="button" onClick={…} /></EntityRow>` keeps a
   * clickable row a real `<button>` for keyboard + a11y.
   */
  asChild?: boolean;
}

/**
 * A list row for an entity: icon · title + meta · trailing controls — the shape the
 * settings/integrations/domains/telephony lists all hand-rolled. Layout only; make
 * the row interactive by passing your own `<button>`/`<a>` via `asChild`.
 */
export const EntityRow = React.forwardRef<HTMLDivElement, EntityRowProps>(
  ({ icon, title, meta, trailing, asChild, className, children, ...rest }, ref) => {
    const Comp = asChild ? Slot : "div";
    const content = (
      <>
        {icon ? <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-lg bg-surface-variant text-muted-foreground">{icon}</span> : null}
        <span className="min-w-0 flex-1 text-left">
          <span className="block truncate text-sm font-semibold text-foreground">{title}</span>
          {meta ? <span className="block truncate text-xs text-muted-foreground">{meta}</span> : null}
        </span>
        {trailing ? <span className="flex shrink-0 items-center gap-2">{trailing}</span> : null}
      </>
    );
    return (
      <Comp
        ref={ref}
        className={cn(
          "flex w-full items-center gap-3 rounded-xl border border-border bg-surface px-3 py-2.5",
          className,
        )}
        {...rest}
      >
        {asChild
          ? React.isValidElement(children)
            ? React.cloneElement(children as React.ReactElement, undefined, content)
            : children
          : content}
      </Comp>
    );
  },
);
EntityRow.displayName = "EntityRow";
