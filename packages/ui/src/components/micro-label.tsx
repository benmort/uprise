import * as React from "react";
import { cn } from "../lib/utils";

/**
 * The canonical micro-label: tiny, bold, uppercase, `0.06em` tracking — the one
 * treatment for table heads, section eyebrows and stat captions. `<span>` by
 * default; set `as` for a different tag (e.g. `as="p"`).
 */
export const MicroLabel = React.forwardRef<
  HTMLElement,
  React.HTMLAttributes<HTMLElement> & { as?: "span" | "p" | "div" }
>(({ as: Comp = "span", className, ...rest }, ref) => (
  <Comp
    ref={ref as React.Ref<never>}
    className={cn("text-[11px] font-bold uppercase tracking-[0.06em] text-muted-foreground", className)}
    {...rest}
  />
));
MicroLabel.displayName = "MicroLabel";
