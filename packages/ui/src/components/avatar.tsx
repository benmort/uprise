"use client";

import * as React from "react";
import { cn } from "../lib/utils";

/** Avatar with an image and an initials fallback (used by the topbar user dropdown). */
export function Avatar({
  src,
  name,
  className,
}: {
  src?: string | null;
  name?: string | null;
  className?: string;
}) {
  const [errored, setErrored] = React.useState(false);
  const initials = React.useMemo(() => computeInitials(name), [name]);
  const showImage = Boolean(src) && !errored;
  return (
    <span
      className={cn(
        "inline-flex h-10 w-10 shrink-0 items-center justify-center overflow-hidden rounded-full bg-surface-variant text-sm font-semibold text-muted-foreground",
        className,
      )}
    >
      {showImage ? (
        // eslint-disable-next-line @next/next/no-img-element
        <img
          src={src as string}
          alt={name ?? "Avatar"}
          className="h-full w-full object-cover"
          onError={() => setErrored(true)}
        />
      ) : (
        <span>{initials}</span>
      )}
    </span>
  );
}

export function computeInitials(name?: string | null): string {
  const trimmed = (name ?? "").trim();
  if (!trimmed) return "?";
  if (trimmed.includes("@")) return trimmed[0]!.toUpperCase();
  const parts = trimmed.split(/\s+/).filter(Boolean);
  const first = parts[0]?.[0] ?? "";
  const last = parts.length > 1 ? parts[parts.length - 1]![0] : "";
  return (first + last).toUpperCase() || "?";
}
