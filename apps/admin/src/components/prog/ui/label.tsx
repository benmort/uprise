"use client";

// Retiring prog/ui → @uprise/ui. The shared `Label` uses the 11px-uppercase handoff style,
// which would visually regress the form kit's normal-case labels — so this keeps prog's
// label styling but drops the prog/cn dependency (uses the shared `cn`). A form-label
// variant can be folded into the shared Label later; behaviour/appearance unchanged for now.
import * as React from "react";
import { Label as LabelPrimitive } from "radix-ui";
import { cn } from "@uprise/ui";

function Label({ className, ...props }: React.ComponentProps<typeof LabelPrimitive.Root>) {
  return (
    <LabelPrimitive.Root
      data-slot="label"
      className={cn(
        "flex items-center gap-2 text-sm font-medium leading-none select-none group-data-[disabled=true]:pointer-events-none group-data-[disabled=true]:opacity-50 peer-disabled:cursor-not-allowed peer-disabled:opacity-50",
        className,
      )}
      {...props}
    />
  );
}

export { Label };
