"use client";

import { useEffect } from "react";
import { AlertTriangle, RotateCcw } from "lucide-react";
import { Button } from "@/components/ui/button";

/**
 * Error boundary for the geo-explorer panels. The (geo) layout – the segmented
 * control, search box and view toggle – stays mounted above this, so a panel
 * throw (bad geometry, map init failure) degrades to a retry card while the
 * user can still switch kind or clear the search.
 */
export default function GeoExplorerError({
  error,
  reset,
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  useEffect(() => {
    console.error("[admin] geo explorer error boundary", error);
  }, [error]);

  return (
    <div className="flex min-h-[40vh] items-center justify-center rounded-2xl border border-border p-8">
      <div className="max-w-md text-center">
        <span className="mx-auto mb-4 flex h-12 w-12 items-center justify-center rounded-2xl bg-error-container text-error">
          <AlertTriangle className="h-6 w-6" />
        </span>
        <h2 className="text-lg font-bold text-foreground">This panel hit an error</h2>
        <p className="mt-2 text-sm text-muted-foreground">
          The explorer above still works – switch between Divisions, Areas and Addresses, adjust
          the search, or retry the panel.
        </p>
        {error.digest ? (
          <p className="mt-2 font-mono text-xs text-muted-foreground">Ref: {error.digest}</p>
        ) : null}
        <Button className="mt-5" onClick={() => reset()}>
          <RotateCcw className="mr-1.5 h-4 w-4" />
          Try again
        </Button>
      </div>
    </div>
  );
}
