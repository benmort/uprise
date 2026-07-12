import { cn } from "../lib/utils";

/** Deterministic gradient hue from a seed (tenant id or name) — same look as the
 *  admin tenant switcher's avatar; no uploaded logo, no schema field. */
function hashHue(seed: string): number {
  let h = 0;
  for (let i = 0; i < seed.length; i++) h = (h * 31 + seed.charCodeAt(i)) | 0;
  return Math.abs(h) % 360;
}

/**
 * The tenant's real logo when one is set, else a Vercel-style gradient disc keyed on the seed.
 * The logo renders inside a WHITE rounded chip (`object-contain`) so a single asset stays legible
 * on a white surface (the admin) AND on a dark one (the auth/volunteer panel) — the sourced logos
 * are the white-background variants. `name` alt-labels the image.
 */
export function TenantAvatar({
  seed,
  logoUrl,
  name,
  className,
}: {
  seed: string;
  logoUrl?: string | null;
  name?: string;
  className?: string;
}) {
  if (logoUrl) {
    return (
      <span className={cn("inline-flex shrink-0 items-center justify-center overflow-hidden rounded-lg bg-white p-0.5", className)}>
        <img src={logoUrl} alt={name ? `${name} logo` : "Logo"} className="h-full w-full object-contain" />
      </span>
    );
  }
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
  logoUrl,
  plan,
  className,
}: {
  name: string;
  /** Avatar gradient seed — defaults to the name (use the tenant id when available). */
  seed?: string;
  /** The tenant's logo (landscape preferred, block fallback); gradient disc when absent. */
  logoUrl?: string | null;
  plan?: string | null;
  className?: string;
}) {
  return (
    <span className={cn("flex min-w-0 items-center gap-2", className)}>
      <TenantAvatar seed={seed || name} logoUrl={logoUrl} name={name} className="h-7 w-7" />
      <span className="min-w-0 truncate text-sm font-semibold text-foreground">{name}</span>
      {plan ? (
        <span className="shrink-0 rounded-md bg-primary/10 px-1.5 py-0.5 text-[11px] font-semibold capitalize leading-none text-primary">
          {plan}
        </span>
      ) : null}
    </span>
  );
}
