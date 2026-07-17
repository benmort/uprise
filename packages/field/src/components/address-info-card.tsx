"use client";

import { useEffect, useState } from "react";
import { ArrowUpRight, Home, MapPin, UserCheck, Vote } from "lucide-react";
import { getAddressDetail, type AddressDetail, type RegionKind, type RegionRef } from "../api/geo";

/**
 * The shared door info card: address, the contact on file, the containing electoral
 * regions and a primary action. Rendered INSIDE each surface's own react-map-gl
 * `<Popup>` (the field TurfMap and the admin GeoMap use separate react-map-gl copies,
 * so this stays map-agnostic — no `<Popup>`/context import here). Colours are an
 * explicit slate scale + brand primary because it sits on mapbox's always-white
 * popup content, which ignores the app theme.
 *
 * When a `gnafPid` is given it lazily fetches the address detail (regions, nearest
 * polling) on mount; the address + contact render immediately from props. Without a
 * gnafPid (a contact not tied to a G-NAF point) it degrades to address + contact only.
 */
export function AddressInfoCard({
  gnafPid,
  address,
  contactId,
  contactName,
  detailHref,
  onKnock,
  knockLabel = "Knock at this door",
}: {
  gnafPid?: string | null;
  address?: string | null;
  contactId?: string | null;
  contactName?: string | null;
  /** "View full detail" target (admin surfaces). A full-page anchor — the field
   *  standalone PWA has no such route, so it's only passed by admin/preview. */
  detailHref?: string | null;
  /** "Knock at this door" — the live field app's primary action (preserves the knock flow). */
  onKnock?: () => void;
  knockLabel?: string;
}) {
  const [detail, setDetail] = useState<AddressDetail | null>(null);
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    if (!gnafPid) return;
    let alive = true;
    setLoading(true);
    void getAddressDetail(gnafPid)
      .then((res) => {
        if (alive && res.ok) setDetail(res.data);
      })
      .finally(() => {
        if (alive) setLoading(false);
      });
    return () => {
      alive = false;
    };
  }, [gnafPid]);

  const linkedContactId = contactId ?? detail?.contactId ?? null;
  const chips = detail ? pickRegionChips(detail.regions) : [];
  const poll = detail?.nearestPolling ?? null;

  return (
    <div className="w-[248px] space-y-2 font-sans text-slate-900">
      {/* Address — the identifier (cold doors have no contact). */}
      <div className="flex items-start gap-1.5">
        <MapPin className="mt-0.5 h-4 w-4 shrink-0 text-[#465fff]" />
        <p className="text-sm font-bold leading-snug">{address || detail?.address || "Address"}</p>
      </div>

      {/* Contact on file. */}
      <p className="flex items-center gap-1.5 text-xs">
        {linkedContactId ? (
          <>
            <UserCheck className="h-3.5 w-3.5 shrink-0 text-emerald-600" />
            <span className="text-slate-700">{contactName || "Contact on file"}</span>
          </>
        ) : (
          <span className="text-slate-500">No contact at this address yet</span>
        )}
      </p>

      {/* Containing electoral + statistical regions. */}
      {gnafPid ? (
        loading && chips.length === 0 ? (
          <p className="text-[11px] text-slate-400">Loading regions…</p>
        ) : chips.length > 0 ? (
          <div className="flex flex-wrap gap-1">
            {chips.map((c) => (
              <span
                key={`${c.kind}:${c.code}`}
                className="inline-flex items-center gap-1 rounded-md bg-slate-100 px-1.5 py-0.5 text-[10px] leading-tight"
                title={c.name}
              >
                <span className="font-bold uppercase tracking-wide text-slate-500">{REGION_LABEL[c.kind]}</span>
                <span className="max-w-[120px] truncate font-medium text-slate-700">{c.name}</span>
              </span>
            ))}
          </div>
        ) : null
      ) : null}

      {/* Nearest polling place (from the detail fetch). */}
      {poll ? (
        <p className="flex items-center gap-1.5 text-[11px] text-slate-500">
          <Vote className="h-3.5 w-3.5 shrink-0" />
          <span className="truncate">
            {poll.name || poll.premises || "Polling place"} · {(poll.distanceM / 1000).toFixed(1)} km
          </span>
        </p>
      ) : null}

      {/* Actions. Live field app → Knock (preserves the knock flow); admin/preview → detail link. */}
      {onKnock ? (
        <button
          type="button"
          onClick={onKnock}
          className="flex w-full items-center justify-center gap-1.5 rounded-lg border border-[#e4e4e7] bg-[#f4f4f5] px-3 py-2 text-sm font-bold text-[#18181b] transition hover:brightness-95"
        >
          <Home className="h-4 w-4" />
          {knockLabel}
        </button>
      ) : null}
      {detailHref ? (
        <a
          href={detailHref}
          className="flex w-full items-center justify-center gap-1 rounded-lg border border-slate-200 px-3 py-1.5 text-xs font-semibold text-[#465fff] transition hover:bg-slate-50"
        >
          View full detail
          <ArrowUpRight className="h-3.5 w-3.5" />
        </a>
      ) : null}
    </div>
  );
}

/** Compact chip labels for the popover (full names live on the detail page's tree). */
const REGION_LABEL: Partial<Record<RegionKind, string>> = {
  sa1: "SA1",
  sa2: "SA2",
  sa3: "SA3",
  ced: "Federal",
  sed: "State",
  sed_lower: "Lower",
  sed_upper: "Upper",
  lga: "Council",
  ward: "Ward",
};

// The handful of regions worth showing in a small bubble, in reading order. The full
// containment tree (SA1–SA4, First Nations, meshblock) lives on the detail page.
const CHIP_ORDER: RegionKind[] = ["ced", "sed_upper", "sed_lower", "sed", "lga", "ward", "sa2"];

function pickRegionChips(regions: RegionRef[]): RegionRef[] {
  const byKind = new Map(regions.map((r) => [r.kind, r]));
  const out: RegionRef[] = [];
  for (const kind of CHIP_ORDER) {
    const r = byKind.get(kind);
    if (r) out.push(r);
  }
  return out.slice(0, 5);
}
