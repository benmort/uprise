"use client";

import { Component, type ReactNode } from "react";
import { Button } from "@/components/ui/button";

/**
 * Isolates a geo-explorer panel crash from the persistent surface (the map keeps
 * running). Keyed by `kind` in the surface so switching kind resets it — a panel
 * that threw for one kind doesn't poison the next.
 */
export class GeoPanelErrorBoundary extends Component<
  { children: ReactNode },
  { error: Error | null }
> {
  state: { error: Error | null } = { error: null };

  static getDerivedStateFromError(error: Error) {
    return { error };
  }

  render() {
    if (this.state.error) {
      return (
        <div className="rounded-2xl border border-border bg-surface p-6 text-sm">
          <p className="font-semibold text-foreground">This panel hit an error.</p>
          <p className="mt-1 text-muted-foreground">{this.state.error.message}</p>
          <Button
            variant="outline"
            size="sm"
            className="mt-3"
            onClick={() => this.setState({ error: null })}
          >
            Try again
          </Button>
        </div>
      );
    }
    return this.props.children;
  }
}
