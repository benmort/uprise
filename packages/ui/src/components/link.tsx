import * as React from "react";
import { Slot } from "@radix-ui/react-slot";
import { cva, type VariantProps } from "class-variance-authority";
import { cn } from "../lib/utils";

const linkVariants = cva(
  "inline-flex items-center gap-1 rounded-sm font-medium transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring",
  {
    variants: {
      variant: {
        default: "text-primary hover:text-primary/80 hover:underline",
        muted: "text-muted-foreground hover:text-foreground",
        underline: "text-foreground underline underline-offset-2 hover:text-primary",
        ghost: "text-foreground hover:text-primary",
      },
    },
    defaultVariants: { variant: "default" },
  },
);

export interface LinkProps
  extends React.AnchorHTMLAttributes<HTMLAnchorElement>,
    VariantProps<typeof linkVariants> {
  /** Render as a child element (e.g. Next's `<Link>`) so the shared package stays
   *  framework-free: `<Link asChild><NextLink href="…">…</NextLink></Link>`. */
  asChild?: boolean;
}

/**
 * Styling-only, framework-agnostic link. Renders a plain `<a>` by default, or wraps a
 * routing `<Link>` via `asChild` (Radix Slot) — so `@uprise/ui` never imports `next/*`.
 */
const Link = React.forwardRef<HTMLAnchorElement, LinkProps>(
  ({ className, variant, asChild = false, ...props }, ref) => {
    const Comp = asChild ? Slot : "a";
    return <Comp ref={ref} className={cn(linkVariants({ variant, className }))} {...props} />;
  },
);
Link.displayName = "Link";

export { Link, linkVariants };
