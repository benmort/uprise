"use client";

import { useEffect, useMemo, useState, type ComponentProps } from "react";
import dynamic from "next/dynamic";
import { usePathname, useSearchParams } from "next/navigation";
import type { FilterSpecification } from "mapbox-gl";
import type { WalkMode } from "@uprise/field";
import { getApiUrl } from "@/lib/api";
import type { AreaLevel, DivisionType } from "@/lib/api/geo";
import { stateAbbrevToAsgsDigit, stateAsgsDigitToAbbrev, stateBounds } from "@/lib/canvass/states";
import { useGeoExplorer } from "@/lib/canvass/geo-explorer-state";
import { useTurfBasket } from "@/lib/canvass/turf-basket";
import { kindFromPathname, writeGeoParam } from "@/components/canvass/use-geo-explorer-url-state";
import { GeoPanelErrorBoundary } from "@/components/canvass/geo-panel-error-boundary";
import { DivisionsPanel } from "@/components/canvass/geo-panels/divisions-panel";
import { StatesPanel } from "@/components/canvass/geo-panels/states-panel";
import { AreasPanel } from "@/components/canvass/geo-panels/areas-panel";
import { AddressesPanel } from "@/components/canvass/geo-panels/addresses-panel";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import { cn } from "@/lib/utils";
import { Plus, X } from "lucide-react";

// The ONE map for the whole explorer — module-scope dynamic (never in render) so
// the fiber persists across kind switches; mapbox-gl touches window (ssr:false).
const GeoMap = dynamic(() => import("@/components/canvass/turf-draw-map").then((m) => m.GeoMap), {
  ssr: false,
  loading: () => <Skeleton className="h-full w-full" />,
});
type GeoMapProps = ComponentProps<typeof GeoMap>;

const DIVISION_TABS: DivisionType[] = ["ced", "sed", "lga"];
const TYPE_COLORS: Record<DivisionType, string> = {
  ced: "#2563eb",
  sed: "#059669",
  lga: "#d97706",
};
const AREA_LEVELS = new Set<string>(["sa4", "sa3", "sa2", "sa1", "mb"]);

/**
 * The unified geo explorer surface (Phase 2). Rendered once by the persistent
 * `(geo)` layout, so the ONE `<GeoMap>` never remounts — a kind switch only
 * toggles the map's layers (props) and cross-fades the right-hand panel. The map
 * config for every kind is derived purely from the URL + `useGeoExplorer()`, so
 * no panel→surface coupling is needed: the panels write durable state to the
 * provider, this reads it back for the map.
 */
export function GeoSurface() {
  const pathname = usePathname();
  const searchParams = useSearchParams();
  const kind = kindFromPathname(pathname);

  const rawView = searchParams.get("view");
  const view: WalkMode = rawView === "list" ? "list" : "map";
  const tab = searchParams.get("tab") ?? searchParams.get("layer") ?? "";
  const stateParam = searchParams.get("state") ?? "";
  const q = searchParams.get("q") ?? "";
  const code = searchParams.get("code") ?? "";
  const places = searchParams.get("places") === "1";

  const provider = useGeoExplorer();
  const {
    divisionSelected,
    setDivisionSelected,
    selectedAreas,
    toggleSelectedArea,
    setViewportAreas,
    drawnPolygons,
    setDrawnPolygons,
    bumpClearToken,
    clearToken,
    picked,
    doors,
    activePid,
    setActivePid,
  } = provider;
  const { basket, setPolygons: basketSetPolygons } = useTurfBasket();

  // A hidden mapbox canvas (list view) is 0×0; bump a token whenever we return to
  // map view so the persistent map resizes to its container on show.
  const [resizeToken, setResizeToken] = useState(0);
  useEffect(() => {
    if (view === "map") setResizeToken((t) => t + 1);
  }, [view]);

  const stateDigit = stateAbbrevToAsgsDigit(stateParam);
  const focusBounds = stateBounds(stateParam);

  const mapProps = useMemo<GeoMapProps>(() => {
    const common = {
      focusBounds,
      onPolygonsChange: setDrawnPolygons,
      clearToken,
      resizeToken,
    };
    if (kind === "divisions") {
      const type = (DIVISION_TABS.includes(tab as DivisionType) ? tab : "ced") as DivisionType;
      const selectedCode = divisionSelected?.type === type ? divisionSelected.code : undefined;
      const boundaryFilter: FilterSpecification | undefined = stateDigit
        ? ["==", ["slice", ["get", "code"], 0, 1], stateDigit]
        : undefined;
      return {
        ...common,
        mode: "boundaries",
        boundaryLayers: DIVISION_TABS.map((t) => ({
          id: t,
          tilesUrl: `${getApiUrl()}/geo/tiles/${t}/{z}/{x}/{y}?v=2`,
          color: TYPE_COLORS[t],
          interactive: t === type,
        })),
        boundaryFilter,
        selectedBoundaryCode: selectedCode,
        onBoundaryClick: (clicked: string) =>
          setDivisionSelected(selectedCode === clicked ? null : { type, code: clicked }),
      };
    }
    if (kind === "states") {
      return {
        ...common,
        // Frame on the selected state (its code IS its ASGS digit) so picking one
        // centres the map; else the shared State Filter, else the whole country.
        focusBounds: stateBounds(stateAsgsDigitToAbbrev(code) ?? stateParam),
        mode: "boundaries",
        boundaryTilesUrl: `${getApiUrl()}/geo/tiles/state/{z}/{x}/{y}?v=2`,
        boundaryFilter: stateDigit ? (["==", ["get", "code"], stateDigit] as FilterSpecification) : undefined,
        selectedBoundaryCode: code || undefined,
        onBoundaryClick: (clicked: string) => writeGeoParam("code", code === clicked ? null : clicked),
      };
    }
    if (kind === "areas") {
      const level = (AREA_LEVELS.has(tab) ? tab : "sa2") as AreaLevel;
      return {
        ...common,
        mode: "areas",
        level,
        onLevelChange: (l: AreaLevel) => writeGeoParam("tab", l),
        stateDigit: stateDigit || undefined,
        selectedAreas,
        onToggleArea: toggleSelectedArea,
        onViewportAreasChange: setViewportAreas,
        searchMode: places ? "place" : "area",
        onSearchModeChange: (m: "place" | "area") => writeGeoParam("places", m === "place" ? "1" : null),
        query: q,
        onQueryChange: (v: string) => writeGeoParam("q", v || null),
      };
    }
    // addresses
    return {
      ...common,
      mode: "points",
      stops: doors.map((d) => ({
        id: d.gnafPid,
        lat: d.lat,
        lng: d.lng,
        status: d.hasContact ? "VISITED" : "PENDING",
      })),
      activeStopId: activePid || undefined,
      onStopTap: (id: string) => setActivePid(activePid === id ? "" : id),
      userPosition: picked ? { lat: picked.lat, lng: picked.lng } : undefined,
      focusPoint: picked ? { lat: picked.lat, lng: picked.lng } : null,
    };
  }, [
    kind, tab, stateDigit, stateParam, code, q, places, focusBounds, clearToken, resizeToken,
    divisionSelected, setDivisionSelected, selectedAreas, toggleSelectedArea, setViewportAreas,
    setDrawnPolygons, doors, activePid, setActivePid, picked,
  ]);

  if (!kind) return null;

  const panel =
    kind === "divisions" ? <DivisionsPanel view={view} /> :
    kind === "states" ? <StatesPanel view={view} /> :
    kind === "areas" ? <AreasPanel view={view} /> :
    <AddressesPanel view={view} />;

  // Freehand draw is on for every kind; the areas panel folds polygons into its
  // own "Cut selection" card, so only show this shared banker for the other kinds.
  const showDrawCard = view === "map" && drawnPolygons.length > 0 && kind !== "areas";
  const addDrawnToBasket = () => {
    basketSetPolygons([...basket.polygons, ...drawnPolygons]);
    setDrawnPolygons([]);
    bumpClearToken();
  };
  const clearDrawn = () => {
    setDrawnPolygons([]);
    bumpClearToken();
  };

  return (
    <div className={cn("grid gap-4", view === "map" && "lg:grid-cols-[1fr_340px]")}>
      {/* The ONE persistent map — mounted always, hidden (not unmounted) in list
          view so a kind switch or a list↔map flip never re-inits it. */}
      <div
        className={cn(
          "relative h-[65vh] overflow-hidden rounded-2xl border border-border",
          view === "list" && "hidden",
        )}
      >
        <GeoMap {...mapProps} />
        {showDrawCard ? (
          <div className="absolute inset-x-0 bottom-3 z-10 flex justify-center px-3">
            <div className="flex items-center gap-2 rounded-xl border border-border bg-surface/95 px-3 py-2 text-sm shadow-card backdrop-blur">
              <span className="font-medium text-foreground">
                {drawnPolygons.length} polygon{drawnPolygons.length === 1 ? "" : "s"} drawn
              </span>
              <Button size="sm" onClick={addDrawnToBasket}>
                <Plus className="mr-1.5 h-3.5 w-3.5" />
                Add to my turf
              </Button>
              <Button size="sm" variant="ghost" onClick={clearDrawn} aria-label="Clear drawn polygons">
                <X className="h-3.5 w-3.5" />
              </Button>
            </div>
          </div>
        ) : null}
      </div>

      {/* The panel cross-fades on a kind switch (key={kind}); its own view branch
          swaps sidebar↔table without a remount. Error-isolated from the map. */}
      <div key={kind} className="min-w-0 animate-in fade-in-0 duration-200">
        <GeoPanelErrorBoundary>{panel}</GeoPanelErrorBoundary>
      </div>
    </div>
  );
}
