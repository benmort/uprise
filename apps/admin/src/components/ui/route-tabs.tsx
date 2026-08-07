"use client";

import Link from "next/link";
import { Lock } from "lucide-react";
import { TabNav, TabNavItem } from "@uprise/ui";

export type RouteTab<K extends string> = {
  key: K;
  label: React.ReactNode;
  href: string;
  /** Lock-badged + non-navigable (greyed, padlock) — e.g. owner-only settings tabs. */
  locked?: boolean;
  /** Tooltip on a locked tab explaining why. */
  lockedTitle?: string;
};

/**
 * The one route-navigating tab bar (TabNav + next/link) that the Data explorer,
 * Audience, Settings and tenant sub-page bars all render. Domain wrappers keep their
 * names, exported types and active-tab derivation; their bodies become one of these.
 * `hrefFor` lets a caller rewrite hrefs to carry cross-tab state (the geo explorer's
 * `?q&state&view&density`).
 */
export function RouteTabs<K extends string>({
  tabs,
  active,
  hrefFor,
  scroll,
}: {
  tabs: ReadonlyArray<RouteTab<K>>;
  active: K;
  hrefFor?: (key: K, href: string) => string;
  /** next/link `scroll` — pass `false` when switching tabs must not jump the page. */
  scroll?: boolean;
}) {
  return (
    <TabNav>
      {tabs.map((t) =>
        t.locked ? (
          <span
            key={t.key}
            title={t.lockedTitle}
            aria-disabled="true"
            className="flex cursor-not-allowed items-center gap-1.5 rounded-lg px-3 py-1.5 text-sm font-medium text-muted-foreground/60"
          >
            <Lock className="h-3 w-3" />
            {t.label}
          </span>
        ) : (
          <TabNavItem key={t.key} active={active === t.key} asChild>
            <Link href={hrefFor ? hrefFor(t.key, t.href) : t.href} scroll={scroll}>
              {t.label}
            </Link>
          </TabNavItem>
        ),
      )}
    </TabNav>
  );
}
