"use client";

import Link from "next/link";
import { useParams, usePathname } from "next/navigation";
import { TabNav, TabNavItem } from "@uprise/ui";

/**
 * The segmented tab bar across the super-admin tenant-scoped pages — the same control the
 * /data and canvass explorers use, re-skinned for tenants. Rendered once by `TenantPageHeader`
 * so all five sub-pages (Overview / Members / Email / Telephony / Feature flags) navigate
 * between each other. The active tab is derived from the path segment after the tenant scope,
 * so it stays correct as the tenant switcher swaps the `[tenantId]` segment in place.
 */
export type TenantTab = "overview" | "members" | "email" | "telephony" | "flags";

/** `suffix` is appended to `/super/tenants/{id}` — Overview is the bare scope. */
const TABS: Array<{ key: TenantTab; label: string; suffix: string }> = [
  { key: "overview", label: "Overview", suffix: "" },
  { key: "members", label: "Members", suffix: "/members" },
  { key: "email", label: "Email", suffix: "/email" },
  { key: "telephony", label: "Telephony", suffix: "/telephony" },
  { key: "flags", label: "Feature flags", suffix: "/flags" },
];

export function TenantTabs() {
  const { tenantId } = useParams<{ tenantId?: string }>();
  const pathname = usePathname();
  if (!tenantId) return null;

  const base = `/super/tenants/${tenantId}`;
  const subPath = pathname.split(base)[1] ?? "";
  const active: TenantTab =
    TABS.find((t) => t.suffix && subPath.startsWith(t.suffix))?.key ?? "overview";

  return (
    <TabNav>
      {TABS.map((t) => (
        <TabNavItem key={t.key} active={active === t.key} asChild>
          <Link href={`${base}${t.suffix}`}>{t.label}</Link>
        </TabNavItem>
      ))}
    </TabNav>
  );
}
