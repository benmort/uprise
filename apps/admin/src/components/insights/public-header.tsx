"use client";

/**
 * The public poll viewer's header — the OWNING TENANT's identity (initials avatar + name), not
 * "Uprise". No logo field exists on Tenant, so the icon is generated initials.
 */
export function PublicHeader({ tenant }: { tenant?: { name: string; slug: string } | null }) {
  const name = tenant?.name ?? "Polling";
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
      <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-lg bg-primary/10 text-sm font-extrabold text-primary">
        {initials}
      </span>
      <div className="min-w-0">
        <p className="truncate text-sm font-extrabold tracking-tight text-foreground">{name}</p>
        <p className="font-mono text-[10px] uppercase tracking-[0.14em] text-muted-foreground">Polling</p>
      </div>
    </header>
  );
}
