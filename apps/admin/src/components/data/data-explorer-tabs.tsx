"use client";

import Link from "next/link";
import { cn } from "@/lib/utils";

/**
 * The segmented tab bar across the top of every /data explorer.
 *
 * Six of these are geo layers that share one persistent map shell (the `(geo)` route
 * group); "Politicians" is a plain reference table that lives OUTSIDE that group. So the
 * bar can't be owned by the geo layout alone — it is rendered by both the geo layout and
 * the politicians page, which is why it lives here as a shared component. Adding a tab is
 * a one-line edit that both surfaces pick up.
 */
export type DataTab =
  | "divisions"
  | "states"
  | "areas"
  | "addresses"
  | "polling-places"
  | "first-nations"
  | "referendum"
  | "politicians"
  | "policies";

const TABS: Array<{ key: DataTab; label: string; href: string }> = [
  { key: "divisions", label: "Divisions", href: "/data/divisions" },
  { key: "states", label: "States", href: "/data/states" },
  { key: "areas", label: "Areas", href: "/data/areas" },
  { key: "addresses", label: "Addresses", href: "/data/addresses" },
  { key: "polling-places", label: "Polling places", href: "/data/polling-places" },
  { key: "first-nations", label: "First Nations", href: "/data/first-nations" },
  { key: "referendum", label: "Referendum", href: "/data/referendum" },
  { key: "politicians", label: "Politicians", href: "/data/politicians" },
  { key: "policies", label: "Policies", href: "/data/policies" },
];

/** The tabs that leave the geo route group — their own pages, not the shared-map shell. */
export const NON_GEO_TABS: ReadonlySet<DataTab> = new Set(["politicians", "policies"]);

/**
 * `hrefFor` lets the geo layout carry its explorer state (`?q&state&view&density`) across
 * a geo→geo switch. It is only meaningful between the six geo tabs, so the layout returns
 * the plain href for the Politicians tab, and the politicians page omits it entirely.
 */
export function DataExplorerTabs({
  active,
  hrefFor,
}: {
  active: DataTab;
  hrefFor?: (tab: DataTab, href: string) => string;
}) {
  return (
    <div className="flex flex-wrap rounded-xl border border-border p-0.5">
      {TABS.map((t) => (
        <Link
          key={t.key}
          href={hrefFor ? hrefFor(t.key, t.href) : t.href}
          scroll={false}
          aria-current={active === t.key ? "page" : undefined}
          className={cn(
            "rounded-lg px-3 py-1.5 text-sm font-semibold transition",
            active === t.key ? "bg-primary text-white" : "text-foreground hover:bg-surface-variant",
          )}
        >
          {t.label}
        </Link>
      ))}
    </div>
  );
}
