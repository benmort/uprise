"use client";

import { useState } from "react";
import { Building2, Check } from "lucide-react";
import { Dropdown, DropdownItem } from "@uprise/ui";
import { auth, type Membership } from "@uprise/api-client";

/**
 * Tenant switcher (prog parity). Rendered only when the principal belongs to more than
 * one tenant. Switching calls the IAM select-tenant flow then reloads so every surface
 * re-resolves under the new tenant scope.
 */
export function TenantSwitcher({
  memberships,
  currentTenantId,
}: {
  memberships: Membership[];
  currentTenantId: string | null;
}) {
  const [switching, setSwitching] = useState(false);

  if (memberships.length <= 1) return null;

  const current = memberships.find((m) => m.tenantId === currentTenantId);

  const switchTo = async (tenantId: string) => {
    if (switching || tenantId === currentTenantId) return;
    setSwitching(true);
    const res = await auth.selectTenant(tenantId);
    if (res.ok) {
      window.location.reload();
      return;
    }
    setSwitching(false);
  };

  return (
    <Dropdown
      align="end"
      contentClassName="w-72"
      trigger={({ toggle }) => (
        <button
          type="button"
          onClick={toggle}
          title={current?.tenantName ?? "Switch tenant"}
          aria-label="Switch tenant"
          className="flex h-11 w-11 items-center justify-center rounded-full border border-border bg-surface text-muted-foreground transition-colors hover:bg-surface-variant hover:text-foreground"
        >
          <Building2 className="h-[18px] w-[18px]" />
        </button>
      )}
    >
      <p className="px-3 pb-2 pt-1 text-xs font-semibold uppercase tracking-wide text-muted-foreground">
        Tenants
      </p>
      {memberships.map((m) => {
        const active = m.tenantId === currentTenantId;
        return (
          <DropdownItem
            key={m.tenantId}
            disabled={switching}
            onClick={() => void switchTo(m.tenantId)}
            className="justify-between"
          >
            <span className="flex items-center gap-2.5">
              <span className="flex h-7 w-7 items-center justify-center rounded-full bg-primary/10 text-primary">
                <Building2 className="h-3.5 w-3.5" />
              </span>
              <span className="min-w-0">
                <span className="block truncate text-sm font-medium text-foreground">{m.tenantName}</span>
                <span className="block text-xs text-muted-foreground">{m.role}</span>
              </span>
            </span>
            {active ? <Check className="h-4 w-4 text-success" /> : null}
          </DropdownItem>
        );
      })}
    </Dropdown>
  );
}
