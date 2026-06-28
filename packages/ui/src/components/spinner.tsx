import * as React from "react";
import { Loader2 } from "lucide-react";
import { cn } from "../lib/utils";

/**
 * Loading spinner (lucide Loader2 + spin), ported from prog's loading indicators.
 * Inline default (h-4 w-4) — drop into a Button while it's busy:
 *   {busy ? (<><Spinner className="mr-2" />Saving…</>) : "Save"}
 */
export function Spinner({ className, ...props }: React.ComponentPropsWithoutRef<typeof Loader2>) {
  return <Loader2 aria-hidden className={cn("h-4 w-4 animate-spin", className)} {...props} />;
}

/** Centred full-area spinner for page / section / provider loading states (prog's h-8 loader). */
export function PageSpinner({ className, label = "Loading…" }: { className?: string; label?: string }) {
  return (
    <div
      role="status"
      aria-live="polite"
      className={cn("flex min-h-[40vh] w-full items-center justify-center", className)}
    >
      <Loader2 className="h-8 w-8 animate-spin text-muted-foreground" aria-hidden />
      <span className="sr-only">{label}</span>
    </div>
  );
}
