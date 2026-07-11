"use client";

import { useState } from "react";
import { cn } from "@/lib/utils";

/** First letters of the first two words — "Tanya Plibersek" → "TP". */
function initials(name: string): string {
  const parts = name.trim().split(/\s+/).filter(Boolean);
  if (parts.length === 0) return "?";
  if (parts.length === 1) return parts[0]!.slice(0, 2).toUpperCase();
  return (parts[0]![0]! + parts[parts.length - 1]![0]!).toUpperCase();
}

/**
 * A member headshot: the re-hosted Commons photo when we have one, a tidy monogram of the
 * member's initials otherwise (and if the image 404s). Commons licences require the credit to
 * travel with the photo, so `credit` rides along as the hover title. Rendered wherever a
 * politician is listed — the list table, the detail header, and the policy member table.
 */
export function MemberAvatar({
  name,
  imageUrl,
  credit,
  size = 36,
  className,
}: {
  name: string;
  imageUrl?: string | null;
  credit?: string | null;
  size?: number;
  className?: string;
}) {
  const [broken, setBroken] = useState(false);
  const showPhoto = !!imageUrl && !broken;
  return (
    <span
      className={cn(
        "inline-flex shrink-0 items-center justify-center overflow-hidden rounded-full border border-border bg-surface-variant align-middle",
        className,
      )}
      style={{ width: size, height: size }}
      title={showPhoto && credit ? `Photo: ${credit} (Wikimedia Commons)` : undefined}
    >
      {showPhoto ? (
        // Plain <img>: the source host is upload.wikimedia.org via our re-host, and a broken
        // fetch falls back to initials — no next/image remotePatterns config needed.
        // eslint-disable-next-line @next/next/no-img-element
        <img
          src={imageUrl!}
          alt=""
          width={size}
          height={size}
          loading="lazy"
          onError={() => setBroken(true)}
          className="h-full w-full object-cover"
        />
      ) : (
        <span
          className="font-semibold text-muted-foreground"
          style={{ fontSize: Math.max(10, Math.round(size * 0.34)) }}
        >
          {initials(name)}
        </span>
      )}
    </span>
  );
}
