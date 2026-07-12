"use client";

import { useMemo, useState } from "react";
import { Check, ChevronsUpDown, Search, X } from "lucide-react";
import { Dropdown, useDropdownClose } from "@uprise/ui";
import { cn } from "@/lib/utils";
import type { CampaignStatus, CampaignSummary } from "@/lib/api/campaigns";

const STATUS_LABEL: Record<CampaignStatus, string> = {
  ACTIVE: "Active",
  DRAFT: "Draft",
  ARCHIVED: "Archived",
};

/** Status pill, mirroring the tenant switcher's plan pill: primary for the live
 *  (Active) campaign, muted otherwise. */
function StatusPill({ status }: { status: CampaignStatus }) {
  return (
    <span
      className={cn(
        "shrink-0 rounded-md px-1.5 py-0.5 text-[11px] font-semibold leading-none",
        status === "ACTIVE" ? "bg-primary/10 text-primary" : "bg-surface-variant text-muted-foreground",
      )}
    >
      {STATUS_LABEL[status] ?? status}
    </span>
  );
}

/** A campaign row; closes the dropdown after selecting (no page reload, unlike the
 *  tenant switch — so we must close it ourselves, exactly like the create footer does). */
function CampaignRow({
  campaign,
  active,
  onSelect,
}: {
  campaign: CampaignSummary;
  active: boolean;
  onSelect: (id: string) => void;
}) {
  const close = useDropdownClose();
  return (
    <button
      type="button"
      onClick={() => {
        onSelect(campaign.id);
        close();
      }}
      className="flex w-full cursor-pointer items-center gap-2.5 rounded-lg px-2.5 py-2 text-left transition-colors hover:bg-surface-variant"
    >
      <span className="block min-w-0 flex-1 truncate text-sm font-medium text-foreground">{campaign.name}</span>
      <StatusPill status={campaign.status} />
      {active ? <Check className="h-4 w-4 shrink-0 text-success" /> : null}
    </button>
  );
}

/**
 * Campaign selector — the tenant switcher's dropdown re-skinned for campaigns: a trigger
 * (campaign name + chevron) opening a portalled, searchable list with a status pill and a
 * check on the active row. Deliberately WITHOUT the switcher's "create" footer — new campaigns are
 * made from the header button beside it. Selecting a campaign just calls `onSelect` (the
 * page reflects it in the URL), so there's no reload.
 */
export function CampaignSwitcher({
  campaigns,
  activeId,
  onSelect,
}: {
  campaigns: CampaignSummary[];
  activeId: string;
  onSelect: (id: string) => void;
}) {
  const [query, setQuery] = useState("");
  const active = campaigns.find((c) => c.id === activeId) ?? null;
  const activeName = active?.name ?? "Select campaign";

  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase();
    return q ? campaigns.filter((c) => c.name.toLowerCase().includes(q)) : campaigns;
  }, [campaigns, query]);

  const handleSelect = (id: string) => {
    onSelect(id);
    setQuery("");
  };

  return (
    <Dropdown
      align="start"
      // Portal out so the page's overflow can't clip the menu (same reason as the switcher).
      portal
      contentClassName="w-72 p-0 overflow-hidden"
      trigger={({ toggle }) => (
        <button
          type="button"
          onClick={toggle}
          title={activeName}
          aria-label="Select campaign"
          className="flex h-9 min-w-0 max-w-[16rem] items-center gap-2 rounded-[11px] border border-border bg-surface px-2.5 text-left transition-colors hover:bg-surface-variant"
        >
          <span className="min-w-0 flex-1 truncate text-sm font-semibold text-foreground">{activeName}</span>
          <ChevronsUpDown className="h-4 w-4 shrink-0 text-muted-foreground" />
        </button>
      )}
    >
      {/* Search */}
      <div className="flex items-center gap-2 border-b border-border px-3 py-2.5">
        <Search className="h-4 w-4 shrink-0 text-muted-foreground" />
        <input
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          placeholder="Find campaign…"
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

      {/* Campaign list */}
      <div className="max-h-72 overflow-y-auto p-1.5">
        {filtered.length === 0 ? (
          <p className="px-3 py-6 text-center text-sm text-muted-foreground">No campaigns found</p>
        ) : (
          filtered.map((c) => (
            <CampaignRow key={c.id} campaign={c} active={c.id === activeId} onSelect={handleSelect} />
          ))
        )}
      </div>
    </Dropdown>
  );
}
