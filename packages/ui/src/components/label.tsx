"use client";

import * as React from "react";
import * as LabelPrimitive from "@radix-ui/react-label";
import { cn } from "../lib/utils";

/**
 * Design-system field label, backed by Radix Label (clicking it focuses the
 * associated control). Matches the canvassing handoff label style: 11px bold
 * uppercase, muted. Pass `htmlFor` to bind, or wrap the control as a child.
 */
const Label = React.forwardRef<
  React.ElementRef<typeof LabelPrimitive.Root>,
  React.ComponentPropsWithoutRef<typeof LabelPrimitive.Root> & { required?: boolean }
>(({ className, children, required, ...props }, ref) => (
  <LabelPrimitive.Root
    ref={ref}
    className={cn(
      "block text-[11px] font-bold uppercase tracking-[0.05em] text-muted-foreground",
      className,
    )}
    {...props}
  >
    {children}
    {required ? <span className="text-error"> *</span> : null}
  </LabelPrimitive.Root>
));
Label.displayName = "Label";

export { Label };
