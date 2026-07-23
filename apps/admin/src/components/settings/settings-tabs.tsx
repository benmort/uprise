"use client";

import Link from "next/link";
import { Lock } from "lucide-react";
import { TabNav, TabNavItem } from "@uprise/ui";
import { cn } from "@/lib/utils";
import {
  SETTINGS_PRIMARY_TABS,
  SETTINGS_SUPERADMIN_TABS,
  TAB_SEGMENT,
  type PageTab,
} from "@/app/(main)/future/tenant-settings/sections";

/**
 * The segmented tab bar across the top of Settings — the direct sibling of the Data
 * explorer's DataExplorerTabs. Row 1 is every settings section (Team last); row 2 is the
 * super-admin-only tabs, lock-badged + greyed, rendered only when `isSuperAdmin`.
 *
 * Rendered by both the GeneralSettings shell and the standalone /settings/team page, so
 * every settings surface shows the same bar — mirroring how Politicians/Policies each
 * render DataExplorerTabs from their own pages. Adding a tab is a one-line edit in
 * ./sections (SETTINGS_PRIMARY_TABS), which both this bar and the sidebar pick up.
 */
export function SettingsTabs({
  active,
  isSuperAdmin = false,
  isOwner = false,
}: {
  active: PageTab;
  isSuperAdmin?: boolean;
  /** Whether the viewer is a workspace OWNER (super-admins count as owners) — owner-only
   *  tabs render lock-badged + non-navigable for everyone else. */
  isOwner?: boolean;
}) {
  return (
    <div className="space-y-2">
      <TabNav>
        {SETTINGS_PRIMARY_TABS.map((t) => {
          // Owner-only tabs are locked (greyed + padlock, not a link) for non-owners.
          if (t.ownerOnly && !isOwner) {
            return (
              <span
                key={t.key}
                title={`${t.label} — workspace owners only`}
                aria-disabled="true"
                className="flex cursor-not-allowed items-center gap-1.5 rounded-lg px-3 py-1.5 text-sm font-medium text-muted-foreground/60"
              >
                <Lock className="h-3 w-3" />
                {t.label}
              </span>
            );
          }
          return (
            <TabNavItem key={t.key} active={active === t.key} asChild>
              <Link href={`/settings/${TAB_SEGMENT[t.key]}`}>{t.label}</Link>
            </TabNavItem>
          );
        })}
      </TabNav>
      {isSuperAdmin ? (
        <div className="flex flex-wrap items-center gap-1 rounded-xl border border-dashed border-border/70 bg-surface-variant/30 p-0.5">
          <span className="px-2 text-[11px] font-semibold uppercase tracking-[0.06em] text-muted-foreground">
            Super-admin
          </span>
          {SETTINGS_SUPERADMIN_TABS.map((t) => (
            <Link
              key={t.key}
              href={`/settings/${TAB_SEGMENT[t.key]}`}
              aria-current={active === t.key ? "page" : undefined}
              className={cn(
                "flex items-center gap-1.5 rounded-lg px-3 py-1.5 text-sm font-semibold transition",
                active === t.key
                  ? "bg-primary text-white"
                  : "text-muted-foreground hover:bg-surface-variant hover:text-foreground",
              )}
            >
              <Lock className="h-3 w-3" />
              {t.label}
            </Link>
          ))}
        </div>
      ) : null}
    </div>
  );
}
