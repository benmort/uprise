"use client";

import { tenantLogoUrl } from "@uprise/api-client";

/**
 * The public poll viewer's header — the OWNING TENANT's identity: its real logo when set
 * (landscape preferred, block fallback), else a generated-initials mark.
 */
export function PublicHeader({
  tenant,
}: {
  tenant?: { name: string; slug: string; logoLandscapeUrl?: string | null; logoBlockUrl?: string | null } | null;
}) {
  const name = tenant?.name ?? "Polling";
  const logoUrl = tenantLogoUrl(tenant);
  const initials =
    name
      .split(/\s+/)
      .map((w) => w[0])
      .filter(Boolean)
      .slice(0, 2)
      .join("")
      .toUpperCase() || "•";

  return (
    <header className="flex items-center gap-3 border-b border-border pb-4">
      {logoUrl ? (
        <span className="flex h-9 w-9 shrink-0 items-center justify-center overflow-hidden rounded-lg bg-white p-0.5">
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img src={logoUrl} alt={`${name} logo`} className="h-full w-full object-contain" />
        </span>
      ) : (
        <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-lg bg-primary/10 text-sm font-extrabold text-primary">
          {initials}
        </span>
      )}
      <div className="min-w-0">
        <p className="truncate text-sm font-extrabold tracking-tight text-foreground">{name}</p>
        <p className="font-mono text-[10px] uppercase tracking-[0.14em] text-muted-foreground">Polling</p>
      </div>
    </header>
  );
}
