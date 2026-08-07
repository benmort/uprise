"use client";

import { type ReactNode } from "react";
import type { LucideIcon } from "lucide-react";
import { useParams, usePathname, useRouter } from "next/navigation";
import { tenants as tenantsApi } from "@uprise/api-client";
import { useApi } from "@/lib/use-api";
import { PageHeader } from "@/components/shell/page-header";
import { SuperTenantSwitcher } from "@/components/super/tenant-switcher";
import { TenantTabs } from "@/components/super/tenant-tabs";

/**
 * Shared header for the super-admin tenant-scoped sub-pages (Overview / Members / Email /
 * Telephony / Feature flags): the unified `PageHeader` with the tenant switcher in the
 * `titleAccessory` slot, a `Tenants › <title>` trail and the tab bar as the trailing row.
 * The switcher swaps the `[tenantId]` path segment in place (URL is the source of truth);
 * the tenant list is fetched through the cached `useApi` (shared with the sidebar), so
 * moving between sub-pages doesn't refetch.
 */
export function TenantPageHeader({
  title,
  icon,
  description,
  actions,
}: {
  title: string;
  icon?: LucideIcon;
  description?: ReactNode;
  actions?: ReactNode;
}) {
  const { tenantId } = useParams<{ tenantId?: string }>();
  const pathname = usePathname();
  const router = useRouter();
  const { data } = useApi("/tenants/search", () => tenantsApi.search(), { ttlMs: 30_000 });
  const tenants = data ?? [];

  // The sub-page path after the tenant scope — "/members", "/email", "" (Overview) — preserved
  // across a switch so changing tenant keeps you on the same sub-page.
  const subPath = tenantId ? pathname.split(`/super/tenants/${tenantId}`)[1] ?? "" : "";

  const switchTo = (id: string) => {
    if (!id || id === tenantId) return;
    router.push(`/super/tenants/${id}${subPath}`);
  };

  return (
    <PageHeader
      icon={icon}
      title={title}
      description={description}
      actions={actions}
      breadcrumbs={[{ label: "Tenants", href: "/super/tenants" }, { label: title }]}
      titleAccessory={
        tenants.length > 0 ? (
          <SuperTenantSwitcher tenants={tenants} activeId={tenantId ?? ""} onSelect={switchTo} />
        ) : null
      }
    >
      <TenantTabs />
    </PageHeader>
  );
}
