import * as React from "react";
import { cn } from "../lib/utils";

/**
 * Attaches a row of `Button`s (or links) into one segmented control — collapses the
 * shared borders and squares the inner corners so they read as a single unit. Best with
 * `variant="outline"` buttons. Renders `role="group"`.
 */
const ButtonGroup = React.forwardRef<HTMLDivElement, React.HTMLAttributes<HTMLDivElement>>(
  ({ className, ...props }, ref) => (
    <div
      ref={ref}
      role="group"
      className={cn(
        "inline-flex items-center",
        // Square the inner corners, round the ends, and overlap borders so there's no double line.
        "[&>*]:rounded-none [&>*:first-child]:rounded-l-md [&>*:last-child]:rounded-r-md",
        "[&>*:not(:first-child)]:-ml-px [&>*]:focus-visible:relative [&>*]:focus-visible:z-10",
        className,
      )}
      {...props}
    />
  ),
);
ButtonGroup.displayName = "ButtonGroup";

export { ButtonGroup };
