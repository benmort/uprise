"use client";

import { RouteTabs } from "@/components/ui/route-tabs";

/**
 * The segmented tab bar across the top of the Audience surface — the same shape the /data
 * explorers use (see data-explorer-tabs.tsx), for the same reason: four unrelated jobs were
 * stacked down one page, so reaching Searches meant scrolling past a table of every audience.
 *
 * Three tabs are states of `/audience` (`?tab=`) sharing that page's data. Data sync is the
 * exception — a real route (`/audience/sync`): it grew from one pull card into a surface with
 * its own data (connections, deliveries, sync settings) that the other tabs never touch, so
 * the shared-state argument stopped applying. `/audience?tab=sync` redirects there for old
 * bookmarks. `/audience/segments` still exists as the fuller Searches page with the builder.
 */
export type AudienceTab = "audiences" | "import" | "sync" | "searches";

const TABS: Array<{ key: AudienceTab; label: string; href: string }> = [
  { key: "audiences", label: "Segmented audiences", href: "/audience" },
  { key: "import", label: "Import subscribers", href: "/audience?tab=import" },
  { key: "sync", label: "Data sync", href: "/audience/sync" },
  { key: "searches", label: "Searches", href: "/audience?tab=searches" },
];

/** `?tab=` → a tab, defaulting to the audience list (the page's landing state).
 *  `"sync"` is still resolved so the page can redirect the legacy `?tab=sync` URL. */
export function resolveAudienceTab(raw: string | null | undefined): AudienceTab {
  return raw === "import" || raw === "sync" || raw === "searches" ? raw : "audiences";
}

export function AudienceTabs({ active }: { active: AudienceTab }) {
  return <RouteTabs tabs={TABS} active={active} scroll={false} />;
}
