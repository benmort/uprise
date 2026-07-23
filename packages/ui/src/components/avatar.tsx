"use client";

import * as React from "react";
import { cn } from "../lib/utils";

export type AvatarSize = "xs" | "sm" | "md" | "lg" | "xl";

const AVATAR_SIZES: Record<AvatarSize, string> = {
  xs: "h-6 w-6 text-[10px]",
  sm: "h-8 w-8 text-xs",
  md: "h-10 w-10 text-sm",
  lg: "h-12 w-12 text-base",
  xl: "h-16 w-16 text-xl",
};

/** Avatar with an image and an initials fallback. `size` sets a preset; `className` still
 *  wins if you need a bespoke dimension. `computeInitials` is the one shared initials util. */
export function Avatar({
  src,
  name,
  size = "md",
  className,
}: {
  src?: string | null;
  name?: string | null;
  size?: AvatarSize;
  className?: string;
}) {
  const [errored, setErrored] = React.useState(false);
  const initials = React.useMemo(() => computeInitials(name), [name]);
  const showImage = Boolean(src) && !errored;
  return (
    <span
      className={cn(
        "inline-flex shrink-0 items-center justify-center overflow-hidden rounded-full bg-surface-variant font-semibold text-muted-foreground",
        AVATAR_SIZES[size],
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
