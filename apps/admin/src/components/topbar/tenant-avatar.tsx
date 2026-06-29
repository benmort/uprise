import { cn } from "@/lib/utils";

/**
 * Deterministic gradient avatar for a tenant, keyed on its id — tenants have no
 * uploaded logo, so we render a stable, colourful disc (Vercel-switcher style)
 * derived from the id. No asset, no schema field.
 */
function hashHue(seed: string): number {
  let h = 0;
  for (let i = 0; i < seed.length; i++) h = (h * 31 + seed.charCodeAt(i)) | 0;
  return Math.abs(h) % 360;
}

export function TenantAvatar({
  tenantId,
  className,
}: {
  tenantId: string;
  className?: string;
}) {
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
