"use client";

import { useMemo, useState } from "react";
import { Check, ChevronsUpDown, Search, X } from "lucide-react";
import { Dropdown, useDropdownClose } from "@uprise/ui";
import type { TenantSearchRow, TenantStatus } from "@uprise/api-client";
import { TenantAvatar } from "@/components/topbar/tenant-avatar";
import { cn } from "@/lib/utils";

const STATUS_LABEL: Record<TenantStatus, string> = {
  ACTIVE: "Active",
  SUSPENDED: "Suspended",
  ARCHIVED: "Archived",
};

/** Lifecycle pill — ACTIVE reads primary, SUSPENDED warns, ARCHIVED is muted. Mirrors the
 *  campaign switcher's status pill; the plan (when present) trails it as muted text. */
export function TenantStatusPill({ status, planName }: { status: TenantStatus; planName?: string | null }) {
  return (
    <span className="flex shrink-0 items-center gap-1.5">
      <span
        className={cn(
          "rounded-md px-1.5 py-0.5 text-[11px] font-semibold leading-none",
          status === "ACTIVE"
            ? "bg-primary/10 text-primary"
            : status === "SUSPENDED"
              ? "bg-warning-container text-warning-foreground"
              : "bg-surface-variant text-muted-foreground",
        )}
      >
        {STATUS_LABEL[status] ?? status}
      </span>
      {planName ? <span className="text-[11px] font-medium text-muted-foreground">{planName}</span> : null}
    </span>
  );
}

/** A tenant row — closes the dropdown after selecting (no page reload, unlike the topbar tenant
 *  switcher which re-scopes the whole session), so we close it ourselves. */
function TenantRow({
  tenant,
  active,
  onSelect,
}: {
  tenant: TenantSearchRow;
  active: boolean;
  onSelect: (id: string) => void;
}) {
  const close = useDropdownClose();
  return (
    <button
      type="button"
      onClick={() => {
        onSelect(tenant.id);
        close();
      }}
      className="flex w-full cursor-pointer items-center gap-2.5 rounded-lg px-2.5 py-2 text-left transition-colors hover:bg-surface-variant"
    >
      <TenantAvatar tenantId={tenant.id} logoUrl={tenant.logoBlockUrl} name={tenant.name} className="h-6 w-6 text-[11px]" />
      <span className="block min-w-0 flex-1 truncate text-sm font-medium text-foreground">{tenant.name}</span>
      <TenantStatusPill status={tenant.status} planName={tenant.planName} />
      {active ? <Check className="h-4 w-4 shrink-0 text-success" /> : null}
    </button>
  );
}

/**
 * Super-admin tenant selector — the canvass campaign switcher re-skinned for tenants: a trigger
 * (tenant name + chevron) opening a portalled, searchable list with a status + plan pill and a
 * check on the active row. Selecting a tenant just calls `onSelect` (the page reflects it in the
 * `[tenantId]` URL segment), so there is NO reload — deliberately unlike the topbar TenantSwitcher,
 * which re-scopes the session and reloads. Drives the /super/tenants/[tenantId] sub-pages.
 */
export function SuperTenantSwitcher({
  tenants,
  activeId,
  onSelect,
}: {
  tenants: TenantSearchRow[];
  activeId: string;
  onSelect: (id: string) => void;
}) {
  const [query, setQuery] = useState("");
  const active = tenants.find((t) => t.id === activeId) ?? null;
  const activeName = active?.name ?? "Select tenant";

  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase();
    if (!q) return tenants;
    return tenants.filter((t) => t.name.toLowerCase().includes(q) || t.slug.toLowerCase().includes(q));
  }, [tenants, query]);

  const handleSelect = (id: string) => {
    onSelect(id);
    setQuery("");
  };

  return (
    <Dropdown
      align="start"
      portal
      contentClassName="w-72 p-0 overflow-hidden"
      trigger={({ toggle }) => (
        <button
          type="button"
          onClick={toggle}
          title={activeName}
          aria-label="Select tenant"
          className="flex h-9 min-w-0 max-w-[20rem] items-center gap-2 rounded-[11px] border border-border bg-surface px-2.5 text-left transition-colors hover:bg-surface-variant"
        >
          <span className="shrink-0 text-xs font-semibold uppercase tracking-wide text-muted-foreground">Tenant</span>
          <span className="min-w-0 flex-1 truncate text-sm font-semibold text-foreground">{activeName}</span>
          <ChevronsUpDown className="h-4 w-4 shrink-0 text-muted-foreground" />
        </button>
      )}
    >
      <div className="flex items-center gap-2 border-b border-border px-3 py-2.5">
        <Search className="h-4 w-4 shrink-0 text-muted-foreground" />
        <input
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          placeholder="Find tenant…"
          autoFocus
          className="min-w-0 flex-1 bg-transparent text-sm text-foreground placeholder:text-muted-foreground focus:outline-none"
        />
        {query ? (
          <button
            type="button"
            aria-label="Clear search"
            onClick={() => setQuery("")}
            className="shrink-0 text-muted-foreground transition hover:text-foreground"
          >
            <X className="h-4 w-4" />
          </button>
        ) : null}
        <kbd className="shrink-0 rounded border border-border px-1.5 py-0.5 text-[11px] text-muted-foreground">Esc</kbd>
      </div>

      <div className="max-h-72 overflow-y-auto p-1.5">
        {filtered.length === 0 ? (
          <p className="px-3 py-6 text-center text-sm text-muted-foreground">No tenants found</p>
        ) : (
          filtered.map((t) => <TenantRow key={t.id} tenant={t} active={t.id === activeId} onSelect={handleSelect} />)
        )}
      </div>
    </Dropdown>
  );
}
