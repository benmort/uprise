"use client";

import Link from "next/link";
import { Rocket } from "lucide-react";

/**
 * Topbar Getting Started launcher — a rocket icon button (same shape as the notifications
 * bell, sits to its right) linking to the onboarding tracker. Carries a pulsing count of the
 * steps still to do as a circular badge at the top-right corner.
 */
export function GettingStartedButton({ remaining }: { remaining: number }) {
  return (
    <Link
      href="/getting-started"
      aria-label={remaining > 0 ? `Getting started — ${remaining} steps left` : "Getting started"}
      className="relative flex h-11 w-11 items-center justify-center rounded-full border border-border bg-surface text-muted-foreground transition-colors hover:bg-surface-variant hover:text-foreground"
    >
      {remaining > 0 ? (
        // Pulsing count of steps still to do — a circular badge with an expanding ping ring.
        <span className="absolute -right-1 -top-1 inline-flex">
          <span className="absolute inset-0 animate-ping rounded-full bg-primary opacity-60" aria-hidden />
          <span className="relative inline-flex h-[18px] min-w-[18px] items-center justify-center rounded-full bg-primary px-1 text-[10px] font-semibold text-primary-foreground ring-2 ring-surface">
            {remaining}
          </span>
        </span>
      ) : null}
      <Rocket className="h-[18px] w-[18px]" />
    </Link>
  );
}
