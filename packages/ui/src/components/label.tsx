"use client";

import * as React from "react";
import * as LabelPrimitive from "@radix-ui/react-label";
import { cva, type VariantProps } from "class-variance-authority";
import { cn } from "../lib/utils";

const labelVariants = cva("select-none", {
  variants: {
    variant: {
      // Canvassing handoff label — 11px bold uppercase, muted. The default.
      handoff: "block text-[11px] font-bold uppercase tracking-[0.05em] text-muted-foreground",
      // Dense form-field label — normal-case, sits directly above an input. Absorbed from the
      // retired prog/ui form kit so those forms keep their appearance on the shared component.
      form: "flex items-center gap-2 text-sm font-medium leading-none text-foreground group-data-[disabled=true]:pointer-events-none group-data-[disabled=true]:opacity-50 peer-disabled:cursor-not-allowed peer-disabled:opacity-50",
    },
  },
  defaultVariants: { variant: "handoff" },
});

/**
 * Design-system field label, backed by Radix Label (clicking it focuses the associated control).
 * `variant="handoff"` (default) is the 11px uppercase muted style; `variant="form"` is the
 * normal-case dense form-field style. Pass `htmlFor` to bind, or wrap the control as a child.
 */
const Label = React.forwardRef<
  React.ElementRef<typeof LabelPrimitive.Root>,
  React.ComponentPropsWithoutRef<typeof LabelPrimitive.Root> &
    VariantProps<typeof labelVariants> & { required?: boolean }
>(({ className, children, required, variant, ...props }, ref) => (
  <LabelPrimitive.Root
    ref={ref}
    className={cn(labelVariants({ variant }), className)}
    {...props}
  >
    {children}
    {required ? <span className="text-error"> *</span> : null}
  </LabelPrimitive.Root>
));
Label.displayName = "Label";

export { Label, labelVariants };
