"use client";

import { type ReactNode } from "react";
import type { LucideIcon } from "lucide-react";
import { useParams, usePathname, useRouter } from "next/navigation";
import { tenants as tenantsApi } from "@uprise/api-client";
import { useApi } from "@/lib/use-api";
import { Breadcrumbs } from "@/components/ui/breadcrumbs";
import { SuperTenantSwitcher } from "@/components/super/tenant-switcher";
import { TenantTabs } from "@/components/super/tenant-tabs";

/**
 * Shared header for the super-admin tenant-scoped sub-pages (Overview / Members / Email /
 * Telephony / Feature flags). The canvass `CampaignPageHeader`, re-skinned for tenants: a
 * breadcrumb trail (Tenants › <title>) then a title row with the tenant switcher INLINE beside
 * the title + an optional actions slot. The switcher swaps the `[tenantId]` path segment in
 * place (URL is the source of truth); the tenant list is fetched through the cached `useApi`
 * (shared with the sidebar), so moving between sub-pages doesn't refetch.
 */
export function TenantPageHeader({
  title,
  icon: Icon,
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
    <>
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div className="flex min-w-0 flex-wrap items-center gap-3">
          <div className="flex items-center gap-2">
            {Icon ? <Icon className="h-6 w-6 shrink-0 text-primary" /> : null}
            <h1 className="text-2xl font-extrabold">{title}</h1>
          </div>
          {tenants.length > 0 ? (
            <SuperTenantSwitcher tenants={tenants} activeId={tenantId ?? ""} onSelect={switchTo} />
          ) : null}
        </div>
        <div className="flex flex-wrap items-center gap-3">
          {actions ? <div className="flex items-center gap-2">{actions}</div> : null}
          <Breadcrumbs className="ml-auto" items={[{ label: "Tenants", href: "/super/tenants" }, { label: title }]} />
        </div>
      </div>
      {description ? <p className="text-sm text-muted-foreground">{description}</p> : null}
      <TenantTabs />
    </>
  );
}
