"use client";

import { useEffect, useState } from "react";
import { usePathname } from "next/navigation";
import { useQueryParams } from "@/lib/use-query";
import { BrandStyle, LogoMark, TenantAvatar, type BrandStyleFields } from "@uprise/ui";
import { auth, tenants, tenantLogoUrl } from "@uprise/api-client";
import { GridShape } from "./grid-shape";

type Brand = { name: string; seed: string; logoUrl: string | null } & BrandStyleFields;

// App subdomains that are NOT tenants (so we don't treat field/auth/etc. as a tenant slug).
const APP_SUBDOMAINS = new Set(["field", "auth", "admin", "www", "api", "action", "app", "marketing"]);

/** Tenant slug from the link: an explicit ?tenant/?org, else parsed from the redirect
 *  (a nested ?tenant/?org, or a `<slug>.uprise.org.au` subdomain). */
function tenantSlugFromUrl(params: URLSearchParams): string | null {
  const direct = params.get("tenant") || params.get("org");
  if (direct) return direct;
  const ret = params.get("return_to");
  if (!ret) return null;
  try {
    const u = new URL(ret);
    const nested = u.searchParams.get("tenant") || u.searchParams.get("org");
    if (nested) return nested;
    const m = u.hostname.match(/^([a-z0-9-]+)\.(?:dev\.)?uprise\.org\.au$/i);
    if (m && !APP_SUBDOMAINS.has(m[1].toLowerCase())) return m[1];
  } catch {
    /* not a URL */
  }
  return null;
}

/**
 * Right-hand brand panel for the volunteer flow (lg+ only) — the admin tenant-switcher
 * visual (gradient avatar + name, keyed on the tenant id) instead of the Uprise mark.
 * The tenant is resolved from the redirect/link (slug) or the invite token; falls back
 * to the Uprise brand when there's no tenant context.
 */
export function VolunteerBrandSidebar() {
  const params = useQueryParams();
  const pathname = usePathname();
  const [brand, setBrand] = useState<Brand | null>(null);

  useEffect(() => {
    let alive = true;
    void (async () => {
      // 1. tenant slug from the link/redirect → real brand (id seeds the gradient = admin parity).
      const slug = tenantSlugFromUrl(params);
      if (slug) {
        const res = await tenants.brandBySlug(slug);
        if (alive && res.ok && res.data) {
          setBrand({
            name: res.data.name,
            seed: res.data.id,
            logoUrl: tenantLogoUrl(res.data),
            primaryColour: res.data.primaryColour,
            secondaryColour: res.data.secondaryColour,
            customCss: res.data.customCss,
          });
          return;
        }
      }
      // 2. invite token in the path → tenant name + logo (no id, so seed the gradient on the name).
      const m = pathname?.match(/\/v\/invite\/([^/]+)/);
      if (m) {
        const res = await auth.previewInvite(decodeURIComponent(m[1]));
        if (alive && res.ok && res.data.tenantName) {
          setBrand({ name: res.data.tenantName, seed: res.data.tenantName, logoUrl: res.data.logoUrl });
          return;
        }
      }
      if (alive) setBrand(null);
    })();
    return () => {
      alive = false;
    };
  }, [params, pathname]);

  return (
    <>
      {/* Brand colours + custom CSS apply to the whole volunteer flow (all viewports), so this
          lives OUTSIDE the desktop-only panel below. */}
      <BrandStyle brand={brand} />
      <div className="relative hidden w-1/2 items-center justify-center overflow-hidden bg-brand-950 lg:flex">
      <GridShape />
      <div className="relative z-10 flex max-w-xs flex-col items-start gap-4 text-left">
        {brand ? (
          <>
            <TenantAvatar seed={brand.seed} logoUrl={brand.logoUrl} name={brand.name} className="h-20 w-20" />
            <span className="text-2xl font-bold text-white">{brand.name}</span>
            <p className="font-medium text-gray-300">
              Join your neighbours — knock, talk, and log every door.
            </p>
          </>
        ) : (
          <>
            <div className="flex items-center justify-center gap-2">
              <LogoMark className="h-8 w-8 text-brand-500" />
              <span className="text-2xl font-bold text-white">Uprise</span>
            </div>
            <p className="font-medium text-gray-300">Built for Progress. Ready for Power.</p>
          </>
        )}
      </div>
      </div>
    </>
  );
}
