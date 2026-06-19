import * as React from "react";
import { cn } from "@/lib/utils";

/**
 * Styled native <select>. Native keeps it dependency-free + merge-safe and matches
 * existing usage across the app. Pass <option> children.
 */
const Select = React.forwardRef<HTMLSelectElement, React.ComponentProps<"select">>(
  ({ className, children, ...props }, ref) => {
    return (
      <select
        className={cn(
          "flex h-11 w-full cursor-pointer rounded-md border border-input bg-background px-3 text-sm ring-offset-background focus-visible:border-primary focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary/35 disabled:cursor-not-allowed disabled:opacity-50",
          className,
        )}
        ref={ref}
        {...props}
      >
        {children}
      </select>
    );
  },
);
Select.displayName = "Select";

export { Select };
