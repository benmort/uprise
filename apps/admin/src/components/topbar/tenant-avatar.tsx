import { cn } from "@/lib/utils";

/**
 * Tenant brand mark. When the tenant has an uploaded block logo we render it;
 * otherwise we fall back to a deterministic, colourful gradient disc keyed on the
 * tenant id (Vercel-switcher style) so every tenant still has a stable mark.
 */
function hashHue(seed: string): number {
  let h = 0;
  for (let i = 0; i < seed.length; i++) h = (h * 31 + seed.charCodeAt(i)) | 0;
  return Math.abs(h) % 360;
}

export function TenantAvatar({
  tenantId,
  logoUrl,
  name,
  className,
}: {
  tenantId: string;
  /** The tenant's uploaded block logo; when present it replaces the gradient disc. */
  logoUrl?: string | null;
  /** Tenant name, for the logo's alt text. */
  name?: string;
  className?: string;
}) {
  if (logoUrl) {
    return (
      // eslint-disable-next-line @next/next/no-img-element
      <img
        src={logoUrl}
        alt={name ? `${name} logo` : "Tenant logo"}
        className={cn("inline-block shrink-0 rounded-md bg-white object-contain p-0.5", className)}
      />
    );
  }
  const h1 = hashHue(tenantId);
  const h2 = (h1 + 48) % 360;
  return (
    <span
      aria-hidden
      className={cn("inline-block shrink-0 rounded-full", className)}
      style={{
        backgroundImage: `linear-gradient(135deg, hsl(${h1} 72% 56%), hsl(${h2} 76% 46%))`,
      }}
    />
  );
}
