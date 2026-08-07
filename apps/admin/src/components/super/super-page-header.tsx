import { ShieldCheck } from "lucide-react";
import type { ComponentProps } from "react";
import { PageHeader } from "@/components/shell/page-header";

/**
 * Header for the platform-level super-admin pages (Feature flags, Plans, Queues,
 * Tenants …): the unified `PageHeader` with the ShieldCheck badge that marks a
 * super-only surface. Tenant-scoped sub-pages use `TenantPageHeader` instead.
 */
export function SuperPageHeader(props: Omit<ComponentProps<typeof PageHeader>, "icon">) {
  return <PageHeader icon={ShieldCheck} {...props} />;
}
