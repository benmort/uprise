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
  | "domains"
  | "integrations"
  | "security"
  | "compliance"
  | "alerts"
  | "team"
  | "flags"
  | "queue";

// URL segment ↔ tab key. 1:1 except "flags" → "feature-flags" (because /super/flags
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
  domains: "domains",
  integrations: "integrations",
  security: "security",
  compliance: "compliance",
  alerts: "alerts",
  team: "team",
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

// The Settings tab bar, in display order. Shared by the tab-bar component (SettingsTabs)
// and kept in sync with the sidebar (buildNav's settings group). "Team" is appended last
// per the design; it owns its own /settings/team page rather than a GeneralSettings content
// case — exactly like the Data explorer's Politicians/Policies tabs, which are separate
// pages that still render the shared DataExplorerTabs bar.
export const SETTINGS_PRIMARY_TABS: readonly { key: PageTab; label: string; ownerOnly?: boolean }[] = [
  { key: "tenant", label: "General" },
  { key: "organisation", label: "Organisation" },
  { key: "branding", label: "Branding" },
  { key: "business", label: "Business & Legal", ownerOnly: true },
  { key: "contacts", label: "Contacts", ownerOnly: true },
  { key: "addresses", label: "Addresses", ownerOnly: true },
  { key: "access", label: "Access", ownerOnly: true },
  { key: "domains", label: "Domains" },
  { key: "integrations", label: "Integrations" },
  { key: "security", label: "Security", ownerOnly: true },
  { key: "compliance", label: "Compliance" },
  { key: "alerts", label: "Alerts" },
  { key: "team", label: "Team" },
];
/** Tabs only a workspace OWNER (or super-admin) may view/change — see SETTINGS_PRIMARY_TABS. */
export const OWNER_ONLY_TABS: ReadonlySet<PageTab> = new Set(
  SETTINGS_PRIMARY_TABS.filter((t) => t.ownerOnly).map((t) => t.key),
);

/** The display label for a settings tab (falls back gracefully for the super-admin row). */
export function settingsTabLabel(tab: PageTab): string {
  return (
    SETTINGS_PRIMARY_TABS.find((t) => t.key === tab)?.label ??
    SETTINGS_SUPERADMIN_TABS.find((t) => t.key === tab)?.label ??
    "This section"
  );
}
// Row 2 — super-admin only, rendered lock-badged + greyed by SettingsTabs.
export const SETTINGS_SUPERADMIN_TABS: readonly { key: PageTab; label: string }[] = [
  { key: "flags", label: "Feature Flags" },
  { key: "queue", label: "Queue & Redis" },
];
