import * as React from "react";
import { cva, type VariantProps } from "class-variance-authority";
import { cn } from "../lib/utils";

const ribbonVariants = cva(
  "pointer-events-none absolute z-10 select-none px-2.5 py-1 font-label text-[11px] font-bold uppercase tracking-wide shadow-sm",
  {
    variants: {
      tone: {
        primary: "bg-primary text-primary-foreground",
        success: "bg-success text-white",
        warning: "bg-warning-container text-warning-foreground",
        error: "bg-error text-white",
        neutral: "bg-surface-variant text-foreground",
      },
      position: {
        "top-right": "right-0 top-0 rounded-bl-lg rounded-tr-[inherit]",
        "top-left": "left-0 top-0 rounded-br-lg rounded-tl-[inherit]",
        "bottom-right": "bottom-0 right-0 rounded-br-[inherit] rounded-tl-lg",
        "bottom-left": "bottom-0 left-0 rounded-bl-[inherit] rounded-tr-lg",
      },
    },
    defaultVariants: { tone: "primary", position: "top-right" },
  },
);

export interface RibbonProps
  extends React.HTMLAttributes<HTMLSpanElement>,
    VariantProps<typeof ribbonVariants> {}

/**
 * Corner label for a card/media panel — e.g. "New", "Beta", "Sold out". The parent must be
 * `relative` (and usually `overflow-hidden`) so the ribbon anchors to its corner.
 */
const Ribbon = React.forwardRef<HTMLSpanElement, RibbonProps>(
  ({ className, tone, position, ...props }, ref) => (
    <span ref={ref} className={cn(ribbonVariants({ tone, position, className }))} {...props} />
  ),
);
Ribbon.displayName = "Ribbon";

export { Ribbon, ribbonVariants };
