"use client";

import Link from "next/link";
import { TabNav, TabNavItem } from "@uprise/ui";

/**
 * The segmented tab bar across the top of the Audience surface — the same shape the /data
 * explorers use (see data-explorer-tabs.tsx), for the same reason: four unrelated jobs were
 * stacked down one page, so reaching Searches meant scrolling past a table of every audience.
 *
 * All four are states of `/audience` (`?tab=`) rather than routes: they share one component's
 * data — the audience list, sync jobs, connection state — which would otherwise have to be
 * lifted into a layout to survive a route change. `/audience/segments` still exists as the
 * fuller Searches page with the builder under it; the Searches tab here shows the summary card
 * that links into it.
 */
export type AudienceTab = "audiences" | "import" | "sync" | "searches";

const TABS: Array<{ key: AudienceTab; label: string; href: string }> = [
  { key: "audiences", label: "Segmented audiences", href: "/audience" },
  { key: "import", label: "Import subscribers", href: "/audience?tab=import" },
  { key: "sync", label: "List sync", href: "/audience?tab=sync" },
  { key: "searches", label: "Searches", href: "/audience?tab=searches" },
];

/** `?tab=` → a tab, defaulting to the audience list (the page's landing state). */
export function resolveAudienceTab(raw: string | null | undefined): AudienceTab {
  return raw === "import" || raw === "sync" || raw === "searches" ? raw : "audiences";
}

export function AudienceTabs({ active }: { active: AudienceTab }) {
  return (
    <TabNav>
      {TABS.map((t) => (
        <TabNavItem key={t.key} active={active === t.key} asChild>
          <Link href={t.href} scroll={false}>
            {t.label}
          </Link>
        </TabNavItem>
      ))}
    </TabNav>
  );
}
