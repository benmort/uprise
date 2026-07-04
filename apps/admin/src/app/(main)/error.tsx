"use client";

import { useEffect } from "react";
import { AlertTriangle, RotateCcw } from "lucide-react";
import { Button } from "@/components/ui/button";

/**
 * Segment error boundary for the organiser shell – before this existed, ANY
 * render/runtime throw in a page white-screened the whole app with no recovery.
 * The sidebar/topbar (the parent layout) stay mounted; only the page area swaps
 * for this fallback.
 */
export default function MainError({
  error,
  reset,
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  useEffect(() => {
    // Surface in the console for dev + error tooling; never swallow silently.
    console.error("[admin] page error boundary", error);
  }, [error]);

  return (
    <div className="flex min-h-[50vh] items-center justify-center p-8">
      <div className="max-w-md text-center">
        <span className="mx-auto mb-4 flex h-12 w-12 items-center justify-center rounded-2xl bg-error-container text-error">
          <AlertTriangle className="h-6 w-6" />
        </span>
        <h1 className="text-xl font-bold text-foreground">Something went wrong</h1>
        <p className="mt-2 text-sm text-muted-foreground">
          This page hit an unexpected error. Your work elsewhere is unaffected – try again, or head
          back to the dashboard.
        </p>
        {error.digest ? (
          <p className="mt-2 font-mono text-xs text-muted-foreground">Ref: {error.digest}</p>
        ) : null}
        <div className="mt-5 flex justify-center gap-2">
          <Button onClick={() => reset()}>
            <RotateCcw className="mr-1.5 h-4 w-4" />
            Try again
          </Button>
          <Button variant="outline" onClick={() => (window.location.href = "/dashboard")}>
            Go to dashboard
          </Button>
        </div>
      </div>
    </div>
  );
}
