import * as React from "react";
import { cva, type VariantProps } from "class-variance-authority";
import { cn } from "../lib/utils";

const listVariants = cva("text-sm text-foreground", {
  variants: {
    variant: {
      plain: "",
      divided: "divide-y divide-border [&>li]:py-2",
    },
    marker: {
      none: "",
      disc: "list-disc pl-5 marker:text-muted-foreground",
      decimal: "list-decimal pl-5 marker:text-muted-foreground",
    },
    spacing: { none: "", sm: "space-y-1", md: "space-y-2" },
  },
  defaultVariants: { variant: "plain", marker: "none", spacing: "sm" },
});

export interface ListProps
  extends Omit<React.HTMLAttributes<HTMLUListElement>, "children">,
    VariantProps<typeof listVariants> {
  /** Renders an ordered `<ol>` (forced when `marker="decimal"`). */
  ordered?: boolean;
  children?: React.ReactNode;
}

/** Semantic list wrapper (ul/ol) with divided / marker / spacing variants. */
const List = React.forwardRef<HTMLUListElement, ListProps>(
  ({ className, variant, marker, spacing, ordered, ...props }, ref) => {
    const Comp = (ordered || marker === "decimal" ? "ol" : "ul") as "ul";
    return (
      <Comp
        ref={ref}
        className={cn(listVariants({ variant, marker, spacing, className }))}
        {...(props as React.HTMLAttributes<HTMLUListElement>)}
      />
    );
  },
);
List.displayName = "List";

const ListItem = React.forwardRef<HTMLLIElement, React.LiHTMLAttributes<HTMLLIElement>>(
  ({ className, ...props }, ref) => <li ref={ref} className={cn(className)} {...props} />,
);
ListItem.displayName = "ListItem";

export { List, ListItem, listVariants };
