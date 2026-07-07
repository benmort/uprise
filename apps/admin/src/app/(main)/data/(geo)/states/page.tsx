"use client";

import { useMemo, useState } from "react";
import dynamic from "next/dynamic";
import { useSearchParams } from "next/navigation";
import { Check, Map as MapIcon, Plus, Scissors } from "lucide-react";
import {
  createTurfFromSources,
  getState,
  listStates,
  type Division,
  type DivisionDetail,
  type TurfUniverse,
} from "@/lib/api/geo";
import { getApiUrl } from "@/lib/api";
import { useApi } from "@/lib/use-api";
import { useCutTurf } from "@/lib/canvass/use-cut-turf";
import { useTurfBasket } from "@/lib/canvass/turf-basket";
import { MyTurfPanel } from "@/components/canvass/my-turf-panel";
import { RegionHierarchy } from "@/components/canvass/region-hierarchy";
import { UniverseCards, UniverseSelect } from "@/components/canvass/universe-select";
import { useGeoExplorerUrlState, writeGeoParam } from "@/components/canvass/use-geo-explorer-url-state";
import { stateAbbrevToAsgsDigit, stateAsgsDigitToAbbrev, stateBounds, stateNameToAbbrev } from "@/lib/canvass/states";
import { StateRegion } from "@/components/shell/state-region";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import { Card, CardContent } from "@/components/ui/card";
import { cn } from "@/lib/utils";
import { Spinner } from "@uprise/ui";
import { AU_BOUNDS, SectionCard } from "@uprise/field";

// mapbox-gl touches window — never statically imported into the shell.
const TurfMap = dynamic(() => import("@uprise/field").then((m) => m.TurfMap), {
  ssr: false,
  loading: () => <Skeleton className="h-full w-full" />,
});

/**
 * States explorer panel — a full replica of the shared geo-explorer interface
 * (Divisions/Areas/Addresses) for the derived State/Territory layer. The chrome
 * (kind switcher, search box, list/map toggle, "My turf" basket) lives in the
 * persistent (geo) layout; this page reads ?q/?view and renders the panels.
 * States are a small fixed set (8 states + territories), so search is a client
 * filter and there are no sub-tabs or pagination.
 */
export default function StatesPage() {
  const { q, view, state } = useGeoExplorerUrlState({ viewStorageKey: "uprise.statesView" });
  const [universe, setUniverse] = useState<TurfUniverse>("hybrid");
  const { cutTurf, busy } = useCutTurf(universe);
  const { addDivision, hasDivision, removeDivision } = useTurfBasket();

  // Cached 5 min: the derived state set changes only with a geo re-ingest.
  const { data, loading, error, noPermission, refetch } = useApi(
    "/geo/states",
    () => listStates(),
    { ttlMs: 300_000 },
  );
  const rows: Division[] = useMemo(() => data ?? [], [data]);
  // ?state= (abbreviation) → ASGS digit; a state's code IS its digit, so this filters
  // the list (and the map, below) to the picked state. Undefined = "All states".
  const stateDigit = stateAbbrevToAsgsDigit(state);
  const filtered = useMemo(
    () =>
      rows.filter(
        (r) => r.name.toLowerCase().includes(q.trim().toLowerCase()) && (!stateDigit || r.code === stateDigit),
      ),
    [rows, q, stateDigit],
  );

  // Selection lives in ?code= so breadcrumbs from an area/address can deep-link a
  // state (and it survives reload). Drives both the map boundary and the
  // containment panel.
  const searchParams = useSearchParams();
  const selectedCode = searchParams.get("code") ?? "";
  const selectState = (code: string) => writeGeoParam("code", code || null);
  // Frame the map on the selected state (list or map click), else the shared State
  // Filter — so selecting a state centres/zooms the map onto it.
  const selectedState = rows.find((s) => s.code === selectedCode);
  const focusBounds = stateBounds(
    stateNameToAbbrev(selectedState?.name) ?? stateAsgsDigitToAbbrev(selectedCode) ?? state,
  );
  const detailKey = selectedCode ? `/geo/states/${selectedCode}` : null;
  const detail = useApi<DivisionDetail>(detailKey, () => getState(selectedCode), { ttlMs: 300_000 });
  const hierarchyPanel = selectedCode ? <RegionHierarchy kind="state" code={selectedCode} /> : null;

  const cutFromState = (s: Pick<Division, "code" | "name">) =>
    cutTurf({
      id: s.code,
      name: s.name,
      create: () => createTurfFromSources({ name: s.name, divisions: [{ type: "ste", code: s.code }] }),
    });

  if (view === "map") {
    return (
      <div className="section-stack">
        <div className="grid gap-4 lg:grid-cols-[1fr_320px]">
          <div className="relative h-[65vh] overflow-hidden rounded-2xl border border-border">
            <TurfMap
              mode="edit"
              stops={[]}
              defaultBounds={AU_BOUNDS}
              focusBounds={focusBounds}
              boundaryTilesUrl={`${getApiUrl()}/geo/tiles/state/{z}/{x}/{y}`}
              boundaryFilter={stateDigit ? ["==", ["get", "code"], stateDigit] : undefined}
              selectedBoundaryCode={selectedCode || undefined}
              onBoundaryClick={(code) => selectState(selectedCode === code ? "" : code)}
            />
            {!selectedCode && (
              <div className="pointer-events-none absolute inset-x-0 bottom-3 z-10 flex justify-center">
                <span className="rounded-lg border border-border bg-surface/95 px-3 py-1.5 text-xs font-medium text-muted-foreground shadow-card backdrop-blur">
                  Click a state on the map to select it, or pick one from the list.
                </span>
              </div>
            )}
          </div>
          <div className="space-y-4">
            <SectionCard title={`States (${filtered.length})${q ? ` matching “${q.trim()}”` : ""}`}>
              <StateRegion
                loading={loading}
                error={error}
                noPermission={noPermission}
                onRetry={() => void refetch()}
                empty={filtered.length === 0}
                emptyTitle={q ? "No states match" : "No states loaded"}
              >
                <ul className="max-h-72 space-y-1 overflow-y-auto">
                  {filtered.map((s) => (
                    <li key={s.code}>
                      <button
                        type="button"
                        onClick={() => selectState(selectedCode === s.code ? "" : s.code)}
                        aria-pressed={selectedCode === s.code}
                        className={cn(
                          "flex w-full items-center gap-2 rounded-lg px-2 py-1.5 text-left text-sm hover:bg-surface-variant",
                          selectedCode === s.code && "bg-primary-container/20",
                        )}
                      >
                        <span className="truncate font-medium text-foreground">{s.name}</span>
                        <span className="ml-auto shrink-0 text-xs text-muted-foreground tabular-nums">
                          {s.addressCount.toLocaleString()}
                        </span>
                      </button>
                    </li>
                  ))}
                </ul>
              </StateRegion>
            </SectionCard>

            {detail.data ? (
              <SectionCard title={detail.data.name}>
                <ul className="space-y-1 text-sm text-muted-foreground">
                  <li className="tabular-nums">{detail.data.addressCount.toLocaleString()} addresses</li>
                  <li className="tabular-nums">{detail.data.contactCount.toLocaleString()} existing contacts</li>
                  <li className="tabular-nums">{detail.data.withoutContacts.toLocaleString()} cold doors</li>
                </ul>
                <Button
                  className="mt-3 w-full"
                  disabled={busy === detail.data.code}
                  onClick={() => void cutFromState(detail.data!)}
                >
                  <Scissors className="mr-1.5 h-4 w-4" />
                  {busy === detail.data.code ? (<><Spinner className="mr-2" />Cutting…</>) : "Cut turf from boundary"}
                </Button>
                <Button
                  variant="outline"
                  className="mt-2 w-full"
                  onClick={() =>
                    hasDivision("ste", detail.data!.code)
                      ? removeDivision("ste", detail.data!.code)
                      : addDivision({ type: "ste", code: detail.data!.code, name: detail.data!.name })
                  }
                >
                  {hasDivision("ste", detail.data.code) ? (
                    <><Check className="mr-1.5 h-4 w-4" />In my turf</>
                  ) : (
                    <><Plus className="mr-1.5 h-4 w-4" />Add to my turf</>
                  )}
                </Button>
              </SectionCard>
            ) : null}

            <UniverseCards value={universe} onChange={setUniverse} />
            <MyTurfPanel universe={universe} onUniverseChange={setUniverse} />
          </div>
        </div>

        {hierarchyPanel}
      </div>
    );
  }

  return (
    <div className="section-stack">
      <div className="flex flex-wrap items-center gap-2">
        <UniverseSelect value={universe} onChange={setUniverse} className="ml-auto" />
      </div>

      <StateRegion
        loading={loading}
        error={error}
        noPermission={noPermission}
        onRetry={() => void refetch()}
        errorTitle="Geo data not loaded"
        skeleton={<Skeleton className="h-64 w-full" />}
      >
        <Card>
          <CardContent className="space-y-4 pt-6">
            <div className="overflow-x-auto">
              <table className="w-full min-w-[560px] border-collapse text-sm">
                <thead>
                  <tr className="border-b border-border text-left text-xs font-label uppercase tracking-[0.08em] text-muted-foreground">
                    <th className="py-2 pr-4">State / Territory</th>
                    <th className="py-2 pr-4">Addresses</th>
                    <th className="py-2 pr-4">Quick Actions</th>
                  </tr>
                </thead>
                <tbody>
                  {filtered.map((s) => (
                    <tr key={s.code} className="border-b border-border/60 hover:bg-primary-container/10">
                      <td className="py-3 pr-4">
                        <button
                          type="button"
                          onClick={() => selectState(selectedCode === s.code ? "" : s.code)}
                          className={cn(
                            "font-medium text-primary hover:underline",
                            selectedCode === s.code && "underline",
                          )}
                        >
                          {s.name}
                        </button>
                      </td>
                      <td className="py-3 pr-4 tabular-nums">{s.addressCount.toLocaleString()}</td>
                      <td className="py-3 pr-4">
                        <div className="flex items-center gap-2">
                          <Button
                            size="sm"
                            variant="ghost"
                            onClick={() =>
                              hasDivision("ste", s.code)
                                ? removeDivision("ste", s.code)
                                : addDivision({ type: "ste", code: s.code, name: s.name })
                            }
                          >
                            {hasDivision("ste", s.code) ? (
                              <><Check className="mr-1.5 h-3.5 w-3.5" />Added</>
                            ) : (
                              <><Plus className="mr-1.5 h-3.5 w-3.5" />My turf</>
                            )}
                          </Button>
                          <Button
                            size="sm"
                            variant="outline"
                            disabled={busy === s.code}
                            onClick={() => void cutFromState(s)}
                          >
                            <Scissors className="mr-1.5 h-3.5 w-3.5" />
                            {busy === s.code ? (<><Spinner className="mr-2" />Cutting…</>) : "Cut turf"}
                          </Button>
                        </div>
                      </td>
                    </tr>
                  ))}
                  {filtered.length === 0 && (
                    <tr>
                      <td colSpan={3} className="py-6 text-center text-muted-foreground">
                        No states{q ? ` match “${q.trim()}”` : ""}.
                      </td>
                    </tr>
                  )}
                </tbody>
              </table>
            </div>
          </CardContent>
        </Card>
      </StateRegion>

      <p className="flex items-center gap-1.5 text-xs text-muted-foreground">
        <MapIcon className="h-3.5 w-3.5" />
        Click a state to see what it contains, switch to the map for its boundary, or add whole states to
        your turf and stack them with divisions, areas and addresses.
      </p>

      {hierarchyPanel}
    </div>
  );
}
