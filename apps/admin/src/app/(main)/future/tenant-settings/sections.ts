// Pure segment ↔ tab mapping for the General settings tabs. Deliberately a NON-client
// module (no "use client") so the server component /settings/[section]/page.tsx can
// import `sectionToTab` and call it: a Server Component importing a value from a
// "use client" module receives a client-reference proxy, not the real function
// ("sectionToTab is not a function" at runtime). Both the server route and the client
// GeneralSettings shell import from here.

export type PageTab =
  | "tenant"
  | "organisation"
  | "branding"
  | "business"
  | "contacts"
  | "addresses"
  | "access"
  | "integrations"
  | "security"
  | "compliance"
  | "alerts"
  | "flags"
  | "queue";

// URL segment ↔ tab key. 1:1 except "flags" → "feature-flags" (because /settings/flags
// is already a separate super-admin route). Drives the /settings/[section] routing so
// every tab has a real, deep-linkable URL.
export const TAB_SEGMENT: Record<PageTab, string> = {
  tenant: "tenant",
  organisation: "organisation",
  branding: "branding",
  business: "business",
  contacts: "contacts",
  addresses: "addresses",
  access: "access",
  integrations: "integrations",
  security: "security",
  compliance: "compliance",
  alerts: "alerts",
  flags: "feature-flags",
  queue: "queue",
};

const SEGMENT_TAB = Object.fromEntries(
  Object.entries(TAB_SEGMENT).map(([key, seg]) => [seg, key as PageTab]),
) as Record<string, PageTab>;

/** Map a /settings/[section] URL segment to its tab; unknown → the first tab. */
export function sectionToTab(section: string | undefined): PageTab {
  return (section && SEGMENT_TAB[section]) || "tenant";
}
