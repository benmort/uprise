import { cn } from "../lib/utils";

/** Deterministic gradient hue from a seed (tenant id or name) — same look as the
 *  admin tenant switcher's avatar; no uploaded logo, no schema field. */
function hashHue(seed: string): number {
  let h = 0;
  for (let i = 0; i < seed.length; i++) h = (h * 31 + seed.charCodeAt(i)) | 0;
  return Math.abs(h) % 360;
}

/** Vercel-style gradient disc keyed on a stable seed. */
export function TenantAvatar({ seed, className }: { seed: string; className?: string }) {
  const h1 = hashHue(seed || "uprise");
  const h2 = (h1 + 48) % 360;
  return (
    <span
      aria-hidden
      className={cn("inline-block shrink-0 rounded-full", className)}
      style={{ backgroundImage: `linear-gradient(135deg, hsl(${h1} 72% 56%), hsl(${h2} 76% 46%))` }}
    />
  );
}

/**
 * Static tenant brand — the admin top-left tenant-switcher visual (gradient avatar +
 * name + optional plan pill) WITHOUT the dropdown/selector. A plain read-out of the
 * tenant the user is in / canvassing for.
 */
export function TenantBrand({
  name,
  seed,
  plan,
  className,
}: {
  name: string;
  /** Avatar gradient seed — defaults to the name (use the tenant id when available). */
  seed?: string;
  plan?: string | null;
  className?: string;
}) {
  return (
    <span className={cn("flex min-w-0 items-center gap-2", className)}>
      <TenantAvatar seed={seed || name} className="h-7 w-7" />
      <span className="min-w-0 truncate text-sm font-semibold text-foreground">{name}</span>
      {plan ? (
        <span className="shrink-0 rounded-md bg-primary/10 px-1.5 py-0.5 text-[11px] font-semibold capitalize leading-none text-primary">
          {plan}
        </span>
      ) : null}
    </span>
  );
}
