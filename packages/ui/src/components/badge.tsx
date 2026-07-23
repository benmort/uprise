import * as React from "react";
import { cva, type VariantProps } from "class-variance-authority";
import { cn } from "../lib/utils";

const badgeVariants = cva(
  "inline-flex items-center gap-1.5 whitespace-nowrap rounded-full font-label font-semibold",
  {
    variants: {
      variant: {
        default: "bg-primary text-primary-foreground",
        neutral: "bg-surface-variant text-foreground",
        secondary: "bg-secondary-container text-secondary-foreground",
        success: "bg-success-container text-success",
        warning: "bg-warning-container text-warning-foreground",
        error: "bg-error-container text-error",
        info: "bg-secondary-container text-secondary-foreground",
        outline: "border border-border text-foreground",
      },
      size: {
        sm: "px-2 py-0.5 text-[11px]",
        md: "px-2.5 py-0.5 text-xs",
      },
    },
    defaultVariants: { variant: "default", size: "md" },
  },
);

const DOT_TONE: Record<NonNullable<VariantProps<typeof badgeVariants>["variant"]>, string> = {
  default: "bg-primary-foreground",
  neutral: "bg-muted-foreground",
  secondary: "bg-secondary-foreground",
  success: "bg-success",
  warning: "bg-warning-foreground",
  error: "bg-error",
  info: "bg-secondary-foreground",
  outline: "bg-foreground",
};

export interface BadgeProps
  extends React.HTMLAttributes<HTMLSpanElement>,
    VariantProps<typeof badgeVariants> {
  /** Render a small leading status dot in the variant's tone. */
  dot?: boolean;
}

/**
 * Generic status pill. Token-driven variants (success/warning/error/info/…) with an
 * optional leading `dot`. Domain badges (StatusBadge, EventStatusBadge) build on this;
 * reach for those when the label maps to a known domain status.
 */
const Badge = React.forwardRef<HTMLSpanElement, BadgeProps>(
  ({ className, variant, size, dot = false, children, ...props }, ref) => (
    <span ref={ref} className={cn(badgeVariants({ variant, size, className }))} {...props}>
      {dot ? (
        <span className={cn("h-1.5 w-1.5 shrink-0 rounded-full", DOT_TONE[variant ?? "default"])} aria-hidden />
      ) : null}
      {children}
    </span>
  ),
);
Badge.displayName = "Badge";

export { Badge, badgeVariants };
