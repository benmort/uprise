"use client";

import * as React from "react";
import { Loader2 } from "lucide-react";
import { cn } from "../lib/utils";
import { LogoMark } from "./logo";

/**
 * Branded boot/transition loading indicator — the tenant's logo (falling back to the Uprise
 * mark) with a small spinner badge and a short message. Mirrors the admin tenant-switch
 * loader so every uprise surface loads the same way. A centred block that fills its container
 * (drop it in a full-height wrapper, or over a skeleton). Isomorphic-safe (no effects).
 */
export function BrandLoadingScreen({
  logoUrl,
  name,
  message = "Loading…",
  className,
}: {
  /** The tenant's logo — shown when present, else the Uprise mark. */
  logoUrl?: string | null;
  /** Tenant name, for the logo's alt text. */
  name?: string | null;
  message?: string;
  className?: string;
}) {
  return (
    <div
      role="status"
      aria-label={message}
      className={cn("flex flex-col items-center justify-center gap-4 py-12 text-center", className)}
    >
      <div className="relative">
        <span className="flex h-16 w-16 items-center justify-center overflow-hidden rounded-2xl bg-surface-variant">
          {logoUrl ? (
            // eslint-disable-next-line @next/next/no-img-element
            <img src={logoUrl} alt={name ? `${name} logo` : "Loading"} className="h-full w-full object-contain" />
          ) : (
            <LogoMark className="h-9 w-9 text-primary" />
          )}
        </span>
        <span className="absolute -bottom-1 -right-1 flex h-6 w-6 items-center justify-center rounded-full border border-border bg-surface">
          <Loader2 className="h-4 w-4 animate-spin text-primary" />
        </span>
      </div>
      <p className="text-sm font-medium text-muted-foreground">{message}</p>
    </div>
  );
}
