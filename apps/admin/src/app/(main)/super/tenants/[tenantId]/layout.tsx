import { type ReactNode } from "react";

/**
 * Tenant-scoped super-admin layout — a passthrough, exactly like the canvass `[campaignId]`
 * layout. The shared header (tenant switcher + breadcrumb) lives in each sub-page's own
 * `<TenantPageHeader>`, so titles/actions vary per page while the switcher stays consistent.
 */
export default function TenantScopedLayout({ children }: { children: ReactNode }) {
  return <>{children}</>;
}
