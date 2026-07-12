/**
 * A tenant's public brand — the OrgProfile columns rendered on public/tenant surfaces (logo,
 * colours, custom CSS). Shared by every public payload that carries a tenant (tenantBrandBySlug,
 * the switcher search, the public poll) so the shape and the OrgProfile lookup stay identical.
 */

/** The OrgProfile columns to `select` for a brand payload. */
export const BRAND_SELECT = {
  logoLandscapeUrl: true,
  logoBlockUrl: true,
  primaryColour: true,
  secondaryColour: true,
  customCss: true,
} as const;

export type TenantBrandFields = {
  logoLandscapeUrl: string | null;
  logoBlockUrl: string | null;
  primaryColour: string | null;
  secondaryColour: string | null;
  customCss: string | null;
};

/** Normalise an OrgProfile row (or its absence) into a full brand-fields object. */
export function brandFields(p: Partial<TenantBrandFields> | null | undefined): TenantBrandFields {
  return {
    logoLandscapeUrl: p?.logoLandscapeUrl ?? null,
    logoBlockUrl: p?.logoBlockUrl ?? null,
    primaryColour: p?.primaryColour ?? null,
    secondaryColour: p?.secondaryColour ?? null,
    customCss: p?.customCss ?? null,
  };
}
