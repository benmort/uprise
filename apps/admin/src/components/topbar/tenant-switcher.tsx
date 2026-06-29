"use client";

import { useMemo, useState } from "react";
import { Check, ChevronsUpDown, Plus, Search } from "lucide-react";
import { Dropdown, useDropdownClose } from "@uprise/ui";
import { auth, type Membership } from "@uprise/api-client";
import { cn } from "@/lib/utils";
import { TenantAvatar } from "./tenant-avatar";
import { CreateTenantDialog } from "./create-tenant-dialog";

/**
 * Plan keys that may self-serve new tenants from the switcher. Mirrors the backend
 * TENANT_CREATE_PLANS (apps/api/src/tenants/tenants.service.ts) — UI gating is advisory;
 * the API enforces it. Super-admins bypass this.
 */
const TENANT_CREATE_PLANS_UI = ["starter", "growth", "scale"];

function PlanPill({ plan }: { plan: string }) {
  const label = plan.charAt(0).toUpperCase() + plan.slice(1);
  const paid = TENANT_CREATE_PLANS_UI.includes(plan);
  return (
    <span
      className={cn(
        "shrink-0 rounded-md px-1.5 py-0.5 text-[11px] font-semibold leading-none",
        paid ? "bg-primary/10 text-primary" : "bg-surface-variant text-muted-foreground",
      )}
    >
      {label}
    </span>
  );
}

/**
 * Tenant switcher (Vercel-style) — the top-left brand element. Shows the current
 * tenant's gradient avatar + name + plan pill + a chevron; the dropdown searches
 * the caller's tenants, switches on click (reload), and offers a gated "Create
 * Tenant" action. `collapsed` renders the trigger avatar-only.
 */
export function TenantSwitcher({
  memberships,
  currentTenantId,
  isSuperAdmin = false,
  collapsed = false,
}: {
  memberships: Membership[];
  currentTenantId: string | null;
  isSuperAdmin?: boolean;
  collapsed?: boolean;
}) {
  const [switching, setSwitching] = useState(false);
  const [query, setQuery] = useState("");
  const [dialogOpen, setDialogOpen] = useState(false);

  const current = memberships.find((m) => m.tenantId === currentTenantId) ?? memberships[0];
  const seedId = current?.tenantId ?? "uprise";

  const canCreate =
    isSuperAdmin ||
    (current?.role === "OWNER" && TENANT_CREATE_PLANS_UI.includes(current?.planName ?? ""));

  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase();
    return q ? memberships.filter((m) => m.tenantName.toLowerCase().includes(q)) : memberships;
  }, [memberships, query]);

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
    <>
      <Dropdown
        align="start"
        contentClassName="w-80 p-0 overflow-hidden"
        trigger={({ toggle }) => (
          <button
            type="button"
            onClick={toggle}
            title={current?.tenantName ?? "Select tenant"}
            aria-label="Switch tenant"
            className={cn(
              "flex min-w-0 items-center gap-2 rounded-lg px-2 py-1.5 text-left transition-colors hover:bg-surface-variant",
              collapsed && "lg:justify-center lg:px-1",
            )}
          >
            <TenantAvatar tenantId={seedId} className="h-7 w-7" />
            <span className={cn("flex min-w-0 flex-1 items-center gap-2", collapsed && "lg:hidden")}>
              <span className="min-w-0 flex-1 truncate text-sm font-semibold text-foreground">
                {current?.tenantName ?? "Select tenant"}
              </span>
              {current?.planName ? <PlanPill plan={current.planName} /> : null}
              <span className="flex h-7 w-7 shrink-0 items-center justify-center rounded-md border border-border text-muted-foreground">
                <ChevronsUpDown className="h-4 w-4" />
              </span>
            </span>
          </button>
        )}
      >
        {/* Search */}
        <div className="flex items-center gap-2 border-b border-border px-3 py-2.5">
          <Search className="h-4 w-4 shrink-0 text-muted-foreground" />
          <input
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder="Find Tenant…"
            autoFocus
            className="min-w-0 flex-1 bg-transparent text-sm text-foreground placeholder:text-muted-foreground focus:outline-none"
          />
          <kbd className="shrink-0 rounded border border-border px-1.5 py-0.5 text-[11px] text-muted-foreground">
            Esc
          </kbd>
        </div>

        {/* Tenant list */}
        <div className="max-h-72 overflow-y-auto p-1.5">
          {filtered.length === 0 ? (
            <p className="px-3 py-6 text-center text-sm text-muted-foreground">No tenants found</p>
          ) : (
            filtered.map((m) => {
              const active = m.tenantId === currentTenantId;
              return (
                <button
                  key={m.tenantId}
                  type="button"
                  disabled={switching}
                  onClick={() => void switchTo(m.tenantId)}
                  className="flex w-full items-center gap-2.5 rounded-lg px-2.5 py-2 text-left transition-colors hover:bg-surface-variant disabled:opacity-60"
                >
                  <TenantAvatar tenantId={m.tenantId} className="h-7 w-7" />
                  <span className="min-w-0 flex-1 truncate text-sm font-medium text-foreground">
                    {m.tenantName}
                  </span>
                  {m.planName ? <PlanPill plan={m.planName} /> : null}
                  {active ? <Check className="h-4 w-4 shrink-0 text-success" /> : null}
                </button>
              );
            })
          )}
        </div>

        {/* Create tenant (gated) */}
        {canCreate ? <CreateFooter onCreate={() => setDialogOpen(true)} /> : null}
      </Dropdown>

      <CreateTenantDialog open={dialogOpen} onClose={() => setDialogOpen(false)} />
    </>
  );
}

/** Footer row; closes the dropdown then opens the create dialog. */
function CreateFooter({ onCreate }: { onCreate: () => void }) {
  const close = useDropdownClose();
  return (
    <button
      type="button"
      onClick={() => {
        close();
        onCreate();
      }}
      className="flex w-full items-center gap-3 border-t border-border px-3 py-3 text-left transition-colors hover:bg-surface-variant"
    >
      <span className="flex h-7 w-7 shrink-0 items-center justify-center text-muted-foreground">
        <Plus className="h-5 w-5" />
      </span>
      <span className="min-w-0">
        <span className="block text-sm font-semibold text-foreground">Create Tenant</span>
        <span className="block truncate text-xs text-muted-foreground">
          Collaborate with others in a shared workspace
        </span>
      </span>
    </button>
  );
}
