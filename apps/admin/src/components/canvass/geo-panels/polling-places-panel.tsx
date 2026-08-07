"use client";

import { useEffect, useMemo, useState } from "react";
import { MapPin, Vote } from "lucide-react";
import {
  browsePollingPlaces,
  getPollingPlace,
  listPollingPlacePoints,
  type PollingPlace,
  type PollingPlaceDetail,
} from "@/lib/api/geo";
import { useApi } from "@/lib/use-api";
import { useGeoExplorer } from "@/lib/canvass/geo-explorer-state";
import { useGeoExplorerUrlState } from "@/components/canvass/use-geo-explorer-url-state";
import { StateRegion } from "@/components/shell/state-region";
import { Skeleton } from "@/components/ui/skeleton";
import { Card, CardContent } from "@/components/ui/card";
import { PaginationControls } from "@/components/ui/pagination-controls";
import { cn } from "@/lib/utils";
import { AutoAccordionGroup, CollapsibleCard } from "./collapsible-card";
import { type WalkMode } from "@uprise/field";
import { DataTable } from "@uprise/ui";

/** Jurisdiction filter pills — "all" plus federal and each state/territory. The dot
 *  colour matches the map's booth palette (see turf-draw-map.tsx). */
const JURISDICTIONS: Array<{ key: string; label: string; color: string }> = [
  { key: "all", label: "All", color: "#64748b" },
  { key: "federal", label: "Federal", color: "#dc2626" },
  { key: "nsw", label: "NSW", color: "#0ea5e9" },
  { key: "vic", label: "VIC", color: "#2563eb" },
  { key: "qld", label: "QLD", color: "#7c3aed" },
  { key: "wa", label: "WA", color: "#d97706" },
  { key: "sa", label: "SA", color: "#db2777" },
  { key: "tas", label: "TAS", color: "#059669" },
  { key: "act", label: "ACT", color: "#0891b2" },
  { key: "nt", label: "NT", color: "#ea580c" },
];

const PAGE_SIZE = 10;

/**
 * Polling-places panel for the unified geo surface. Renders only the non-map
 * content (jurisdiction pills, the paged/searchable booth list, the selected-booth
 * detail); the persistent map lives in the surface and reads the booth points +
 * the selection back from `useGeoExplorer()`. Federal booths come from the AEC;
 * state/territory booths from The Tally Room (see the loader + Datasets page).
 */
export function PollingPlacesPanel({ view }: { view: WalkMode }) {
  const { q, tab, state, setTab } = useGeoExplorerUrlState({ viewStorageKey: "uprise.pollingPlacesView" });
  const jurisdiction = tab && JURISDICTIONS.some((j) => j.key === tab) ? tab : "all";
  const { pollingPlaces, setPollingPlaces, pollingSelectedId, setPollingSelectedId, mapBounds } =
    useGeoExplorer();

  /**
   * Scope the list to what the map is showing. On by default: opening the booths map over a city
   * and reading a national list underneath it is the confusing default this replaces. Only
   * applies in map view — in list view there is no viewport to scope to, and a stale one from a
   * previous map visit would silently hide rows.
   */
  const [scopeToMap, setScopeToMap] = useState(true);
  const scoping = view === "map" && scopeToMap && !!mapBounds;
  const bbox = scoping && mapBounds ? mapBounds.map((v) => v.toFixed(5)).join(",") : "";

  const [page, setPage] = useState(0);
  useEffect(() => setPage(0), [jurisdiction, state, q, bbox]);

  // Booth points for the map — one cached request per jurisdiction/state filter;
  // pushed into the provider so the surface can plot them (mapbox clusters).
  const points = useApi(
    `/geo/polling-places/points?j=${jurisdiction}&s=${state}`,
    () => listPollingPlacePoints({ jurisdiction, state }),
    { ttlMs: 300_000 },
  );
  useEffect(() => {
    if (points.data) setPollingPlaces(points.data);
  }, [points.data, setPollingPlaces]);

  // The paged, filterable list (server-side).
  const offset = page * PAGE_SIZE;
  const list = useApi(
    `/geo/polling-places?j=${jurisdiction}&s=${state}&q=${q}&o=${offset}&b=${bbox}`,
    () => browsePollingPlaces({ jurisdiction, state, q, bbox, limit: PAGE_SIZE, offset }),
    { ttlMs: 120_000 },
  );
  const rows: PollingPlace[] = useMemo(() => list.data?.rows ?? [], [list.data]);
  const total = list.data?.total ?? 0;

  const detailKey = pollingSelectedId ? `/geo/polling-places/${pollingSelectedId}` : null;
  const detail = useApi<PollingPlaceDetail>(detailKey, () => getPollingPlace(pollingSelectedId), {
    ttlMs: 300_000,
  });

  const select = (id: string) => setPollingSelectedId(pollingSelectedId === id ? "" : id);

  const jurisdictionPills = (
    <div className="flex flex-wrap gap-1.5">
      {JURISDICTIONS.map((j) => (
        <button
          key={j.key}
          type="button"
          aria-pressed={jurisdiction === j.key}
          onClick={() => setTab(j.key)}
          className={cn(
            "flex items-center gap-1.5 rounded-lg border px-2.5 py-1 text-sm font-semibold transition",
            jurisdiction === j.key
              ? "border-primary bg-primary text-white"
              : "border-border text-foreground hover:bg-surface-variant",
          )}
        >
          <span className="h-2 w-2 shrink-0 rounded-full" style={{ backgroundColor: j.color }} />
          {j.label}
        </button>
      ))}
    </div>
  );

  // Only offered in map view — see `scoping`. The count is deliberately part of the label:
  // "showing 12" next to a map is the confirmation that the toggle did something.
  const scopeToggle =
    view === "map" ? (
      <label className="flex items-center gap-2 text-sm text-muted-foreground">
        <input
          type="checkbox"
          className="h-4 w-4 rounded border-border accent-primary"
          checked={scopeToMap}
          onChange={(e) => setScopeToMap(e.target.checked)}
        />
        <span className="text-foreground">Scope to map</span>
        <span className="text-xs">
          {scoping ? `${total.toLocaleString()} in view` : "showing all"}
        </span>
      </label>
    ) : null;

  const detailCard = detail.data ? (
    <CollapsibleCard id={`booth:${detail.data.id}`} title={detail.data.name ?? "Polling place"}>
      <ul className="space-y-1 text-sm text-muted-foreground">
        {detail.data.premises ? <li className="text-foreground">{detail.data.premises}</li> : null}
        {detail.data.address ? <li>{detail.data.address}</li> : null}
        <li>
          {[detail.data.suburb, detail.data.state, detail.data.postcode].filter(Boolean).join(" ")}
        </li>
        <li className="pt-1">
          <span className="font-medium text-foreground">Jurisdiction:</span>{" "}
          {detail.data.jurisdiction === "federal" ? "Federal" : detail.data.jurisdiction.toUpperCase()}
        </li>
        {detail.data.divisionName ? (
          <li>
            <span className="font-medium text-foreground">Electorate (source):</span> {detail.data.divisionName}
          </li>
        ) : null}
        {detail.data.cedName ? (
          <li>
            <span className="font-medium text-foreground">Federal division:</span> {detail.data.cedName}
          </li>
        ) : null}
        {detail.data.sedName ? (
          <li>
            <span className="font-medium text-foreground">State electorate:</span> {detail.data.sedName}
          </li>
        ) : null}
        <li className="tabular-nums">
          {detail.data.lat.toFixed(5)}, {detail.data.lng.toFixed(5)}
        </li>
      </ul>
    </CollapsibleCard>
  ) : null;

  const pagination = (
    <div className="flex flex-wrap items-center justify-between gap-2">
      <p className="text-xs text-muted-foreground">
        {total.toLocaleString()} booth{total === 1 ? "" : "s"}
        {q ? ` matching “${q.trim()}”` : ""}
      </p>
      <PaginationControls
        page={page}
        pageSize={PAGE_SIZE}
        total={total}
        onPrev={() => setPage((p) => Math.max(0, p - 1))}
        onNext={() => setPage((p) => p + 1)}
      />
    </div>
  );

  // ── Map view: jurisdiction pills, a clickable booth list + the selected card ──
  if (view === "map") {
    return (
      <div className="space-y-4">
        {jurisdictionPills}
        {scopeToggle}
        <AutoAccordionGroup
          defaultOpen="booths"
          follow={pollingSelectedId && detail.data ? `booth:${detail.data.id}` : ""}
        >
        <CollapsibleCard id="booths" title={`Booths (${total.toLocaleString()})`}>
          <StateRegion
            loading={list.loading}
            error={list.error}
            noPermission={list.noPermission}
            onRetry={() => void list.refetch()}
            empty={rows.length === 0}
            emptyTitle={q ? "No booths match" : "No polling places loaded"}
          >
            <ul className="space-y-1">
              {rows.map((r) => (
                <li key={r.id}>
                  <button
                    type="button"
                    onClick={() => select(r.id)}
                    aria-pressed={pollingSelectedId === r.id}
                    className={cn(
                      "flex w-full items-start gap-2 rounded-lg px-2 py-1.5 text-left text-sm hover:bg-surface-variant",
                      pollingSelectedId === r.id && "bg-primary-container/20",
                    )}
                  >
                    <MapPin className="mt-0.5 h-3.5 w-3.5 shrink-0 text-muted-foreground" />
                    <span className="min-w-0">
                      <span className="block truncate font-medium text-foreground">{r.name ?? r.premises ?? r.id}</span>
                      <span className="block truncate text-xs text-muted-foreground">
                        {[r.divisionName, r.suburb, r.state].filter(Boolean).join(" · ")}
                      </span>
                    </span>
                  </button>
                </li>
              ))}
            </ul>
            <div className="mt-3">{pagination}</div>
          </StateRegion>
        </CollapsibleCard>
        {detailCard}
        </AutoAccordionGroup>
      </div>
    );
  }

  // ── List view: jurisdiction pills + the full paged booth table ──
  return (
    <div className="section-stack">
      {jurisdictionPills}
      <StateRegion
        loading={list.loading}
        error={list.error}
        noPermission={list.noPermission}
        onRetry={() => void list.refetch()}
        errorTitle="Polling places not loaded"
        skeleton={<Skeleton className="h-64 w-full" />}
      >
        <Card>
          <CardContent className="space-y-4 pt-6">
            <DataTable
              aria-label="Polling places"
              rows={rows}
              rowKey={(r) => r.id}
              pageSize={0}
              onRowClick={(r) => select(r.id)}
              rowClassName={(r) => (pollingSelectedId === r.id ? "bg-primary-container/20" : undefined)}
              empty={`No polling places${q ? ` match “${q.trim()}”` : ""}.`}
              columns={[
                {
                  key: "booth",
                  header: "Booth",
                  cell: (r) => (
                    <div>
                      <span className="font-medium text-foreground">{r.name ?? r.premises ?? r.id}</span>
                      {r.premises && r.name ? <p className="text-xs text-muted-foreground">{r.premises}</p> : null}
                    </div>
                  ),
                },
                { key: "electorate", header: "Electorate", cell: (r) => <span className="text-muted-foreground">{r.divisionName ?? "–"}</span> },
                { key: "suburb", header: "Suburb", cell: (r) => <span className="text-muted-foreground">{r.suburb ?? "–"}</span> },
                { key: "state", header: "State", cell: (r) => <span className="text-muted-foreground">{r.state ?? "–"}</span> },
                {
                  key: "jurisdiction",
                  header: "Jurisdiction",
                  cell: (r) => (
                    <span className="text-muted-foreground">
                      {r.jurisdiction === "federal" ? "Federal" : r.jurisdiction.toUpperCase()}
                    </span>
                  ),
                },
              ]}
            />
            {pagination}
          </CardContent>
        </Card>
      </StateRegion>

      {detailCard}

      <p className="flex items-center gap-1.5 text-xs text-muted-foreground">
        <Vote className="h-3.5 w-3.5" />
        Federal booths from the AEC; state &amp; territory booths from The Tally Room. Switch to the map to plot them.
      </p>
    </div>
  );
}
