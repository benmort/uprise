"use client";

import { useEffect, useMemo, useState, type ComponentProps } from "react";
import dynamic from "next/dynamic";
import { usePathname, useSearchParams } from "next/navigation";
import type { FilterSpecification } from "mapbox-gl";
import { AU_BOUNDS, type WalkMode } from "@uprise/field";
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
import { PollingPlacesPanel } from "@/components/canvass/geo-panels/polling-places-panel";
import { FirstNationsPanel } from "@/components/canvass/geo-panels/first-nations-panel";
import { ReferendumPanel } from "@/components/canvass/geo-panels/referendum-panel";
import { DemographicsPanel } from "@/components/canvass/geo-panels/demographics-panel";
import { firstNationsSlug, resolveFirstNationsLevel } from "@/lib/canvass/first-nations";
import { getDensityScale, getFirstNations, getReferendum } from "@/lib/api/geo";
import { getChoropleth } from "@/lib/api/demographics";
import { densityBands, densityFill } from "@/lib/canvass/density";
import { referendumBands, referendumFill } from "@/lib/canvass/referendum-fill";
import { matchFill, stepFill, choroplethBands, rampFor, formatIndicator } from "@/lib/canvass/demographics-fill";
import { useChartPalette } from "@/components/insights/use-poll-palette";
import { SequentialLegend } from "@/components/canvass/sequential-legend";
import { useApi } from "@/lib/use-api";
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

import { DIVISION_TAB_TYPES as DIVISION_TABS, TYPE_COLORS, resolveDivisionTab } from "@/components/canvass/division-layers";
const AREA_LEVELS = new Set<string>(["sa4", "sa3", "sa2", "sa1", "mb"]);

// The split Other Territories are SA3-level, so their state code IS the SA3 code
// (no abbreviation → no STATE_BBOX entry). Frame the map on the island directly so
// selecting one zooms to it instead of the whole country.
const OT_BOUNDS: Record<string, [number, number, number, number]> = {
  "90101": [105.5, -10.6, 105.75, -10.4], // Christmas Island
  "90102": [96.79, -12.25, 96.94, -11.8], // Cocos (Keeling) Islands
  "90103": [150.55, -35.2, 150.8, -35.07], // Jervis Bay
  "90104": [167.9, -29.12, 168.0, -28.98], // Norfolk Island
};

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
  const tab = searchParams.get("type") ?? searchParams.get("tab") ?? searchParams.get("layer") ?? "";
  const stateParam = searchParams.get("state") ?? "";
  const q = searchParams.get("q") ?? "";
  const code = searchParams.get("code") ?? "";
  const places = searchParams.get("places") === "1";
  // Divisions: show ONE layer (the active tab) by default; ?overlay=1 stacks all
  // every division layer together, colour-coded, as a comparison view.
  const overlay = searchParams.get("overlay") === "1";

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
    pollingPlaces,
    pollingSelectedId,
    setPollingSelectedId,
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

  // The First Nations URL carries a name slug; the map needs the ABS code to filter tiles and
  // to frame from its state digit. Resolve via the SAME cache key the panel's detail fetch
  // uses, so useApi's module-level cache serves both from a single request. `null` key when
  // the kind is anything else, or when nothing is selected — then the map shows all of
  // Australia with every boundary drawn.
  const fnLevel = resolveFirstNationsLevel(tab);
  const fnKey = kind === "first-nations" && code ? `/geo/first-nations/${fnLevel}/${code}` : null;
  const fnDetail = useApi(fnKey, () => getFirstNations(fnLevel, code), { ttlMs: 300_000 });
  const fnCode = fnDetail.data?.code ?? "";

  // ── Address density (?density=1) ────────────────────────────────────────────
  // The tiles already carry a `density` per feature; all the client needs is the national
  // scale to paint it with. Which layer's scale depends on which layer is drawn.
  const densityOn = searchParams.get("density") === "1";
  const densityKind =
    kind === "divisions" ? resolveDivisionTab(tab) : kind === "states" ? "state" : kind === "first-nations" ? fnLevel : null;

  const densityScale = useApi(
    densityOn && densityKind ? `/geo/density/scale?kind=${densityKind}` : null,
    () => getDensityScale(densityKind!),
    { ttlMs: 600_000 },
  );
  const palette = useChartPalette();
  // Null palette (pre-hydration) or no scale (geo:density unrun) → no fill expression, so
  // the map keeps its plain boundary wash rather than painting everything one colour.
  const boundaryFill =
    densityOn && palette && densityScale.data
      ? densityFill(densityScale.data, palette.seq, palette.nodata)
      : undefined;
  const densityLegend = palette ? densityBands(densityScale.data ?? null, palette.seq) : [];

  // ── 2023 referendum choropleth (the referendum kind) ────────────────────────
  // Its Yes share isn't on the tile, so the fill is a client-side `match` built from the result
  // rows. Divisions by default; ?tab=state shades the eight state boundaries instead.
  const referendumOn = kind === "referendum";
  const refLevel = tab === "state" ? "state" : "division";
  const referendum = useApi(referendumOn ? "/geo/referendum" : null, () => getReferendum(), { ttlMs: 300_000 });
  const refRows = refLevel === "state" ? (referendum.data?.states ?? []) : (referendum.data?.divisions ?? []);
  const referendumFillExpr =
    referendumOn && palette && refRows.length ? referendumFill(refRows, palette.diverging, palette.nodata) : undefined;
  const referendumLegend = referendumOn && palette ? referendumBands(palette.diverging) : [];

  // ── ABS demographics choropleth (the demographics kind) ─────────────────────
  // The value reaches the map two ways by level: SA2+ join client-side by code (`rows` in hand),
  // SA1/meshblock read a `value` baked onto the tile (?metric=). The indicator rides ?ind=; the
  // panel seeds a default. Both paths bucket against the same national quantile breaks.
  const demographicsOn = kind === "demographics";
  const demoLevel = (["mb", "sa1", "sa2", "sa3", "sa4"].includes(tab) ? tab : "sa2") as AreaLevel;
  const demoClientJoin = demoLevel === "sa2" || demoLevel === "sa3" || demoLevel === "sa4";
  const indicatorKey = searchParams.get("ind") ?? "";
  const demographics = useApi(
    demographicsOn && indicatorKey ? `/demographics/choropleth?level=${demoLevel}&indicator=${indicatorKey}` : null,
    () => getChoropleth(demoLevel, indicatorKey),
    { ttlMs: 300_000 },
  );
  const demoData = demographics.data;
  const demoRamp = palette && demoData ? rampFor(demoData.indicator.polarity, palette) : [];
  const demographicsFillExpr =
    demographicsOn && palette && demoData
      ? demoClientJoin
        ? matchFill(demoData.rows ?? [], demoData.breaks, demoRamp, palette.nodata)
        : stepFill(demoData.breaks, demoRamp, palette.nodata)
      : undefined;
  const demographicsLegend =
    demographicsOn && palette && demoData ? choroplethBands(demoData.breaks, demoData.min, demoRamp) : [];

  const mapProps = useMemo<GeoMapProps>(() => {
    const common = {
      focusBounds,
      onPolygonsChange: setDrawnPolygons,
      clearToken,
      resizeToken,
    };
    if (kind === "divisions") {
      const type = resolveDivisionTab(tab);
      const selectedCode = divisionSelected?.type === type ? divisionSelected.code : undefined;
      const boundaryFilter: FilterSpecification | undefined = stateDigit
        ? ["==", ["slice", ["get", "code"], 0, 1], stateDigit]
        : undefined;
      // Selecting a division frames the map to it (parity with the pre-Phase-2
      // page, lost in the map hoist). Division codes are state-prefixed (first
      // char = ASGS state digit), so the state bounds come from the code alone —
      // no extra fetch. Falls back to the shared State Filter, then the country.
      const selectionBounds = selectedCode
        ? stateBounds(stateAsgsDigitToAbbrev(selectedCode[0]) ?? "")
        : undefined;
      return {
        ...common,
        focusBounds: selectionBounds ?? common.focusBounds,
        mode: "boundaries",
        // One layer at a time by default (the active tab); overlay stacks every layer.
        // Derived chamber codes are state-digit-prefixed like every other layer, so the
        // `slice(code,0,1) == stateDigit` boundaryFilter and the framing below still hold.
        boundaryLayers: (overlay ? DIVISION_TABS : [type]).map((t) => ({
          id: t,
          tilesUrl: `${getApiUrl()}/geo/tiles/${t}/{z}/{x}/{y}?v=4`,
          color: TYPE_COLORS[t],
          interactive: t === type,
        })),
        boundaryFilter,
        boundaryFill,
        selectedBoundaryCode: selectedCode,
        // "My turf" divisions of the active type — drawn green-dashed on the map.
        basketCodes: basket.divisions.filter((d) => d.type === type).map((d) => d.code),
        onBoundaryClick: (clicked: string) =>
          setDivisionSelected(selectedCode === clicked ? null : { type, code: clicked }),
      };
    }
    if (kind === "states") {
      return {
        ...common,
        // Frame on the selected state so picking one centres the map: an Other
        // Territories island by its SA3 code, else the state (code = ASGS digit),
        // else the shared State Filter, else the whole country.
        focusBounds: OT_BOUNDS[code] ?? stateBounds(stateAsgsDigitToAbbrev(code) ?? stateParam),
        mode: "boundaries",
        boundaryTilesUrl: `${getApiUrl()}/geo/tiles/state/{z}/{x}/{y}?v=4`,
        boundaryFilter: stateDigit ? (["==", ["get", "code"], stateDigit] as FilterSpecification) : undefined,
        boundaryFill,
        selectedBoundaryCode: code || undefined,
        // Whole states banked in "My turf" (stored as division type "ste") — green-dashed.
        basketCodes: basket.divisions.filter((d) => d.type === "ste").map((d) => d.code),
        onBoundaryClick: (clicked: string) => writeGeoParam("code", code === clicked ? null : clicked),
      };
    }
    if (kind === "first-nations") {
      // The URL carries a name slug ('sydney-wollongong'); the vector tiles key on the ABS
      // code ('107'). `fnCode` is the resolved code — until it arrives there is simply no
      // highlight. With no `?code=` at all, focusBounds stays undefined and boundaryFilter
      // stays off, so the map opens on the whole of Australia with every boundary drawn.
      //
      // ABS codes are state-digit-prefixed at every level (IREG '101', IARE '101001',
      // ILOC '10100101'), so the shared state filter and the code[0] framing hold.
      // No `basketCodes`: these layers are reference-only, never turf.
      const level = resolveFirstNationsLevel(tab);
      return {
        ...common,
        // Explicitly AU_BOUNDS rather than `undefined` when nothing is picked. Undefined only
        // *incidentally* frames the country (initialViewState falls through to it on a fresh
        // load); naming it makes the map refit to the whole of Australia whenever the
        // selection clears — switching level, deselecting, or arriving from a state-framed
        // view — instead of keeping the previous kind's frame.
        focusBounds:
          (fnCode ? stateBounds(stateAsgsDigitToAbbrev(fnCode[0]) ?? "") : undefined) ??
          common.focusBounds ??
          AU_BOUNDS,
        mode: "boundaries",
        boundaryTilesUrl: `${getApiUrl()}/geo/tiles/${level}/{z}/{x}/{y}?v=2`,
        boundaryFilter: stateDigit
          ? (["==", ["slice", ["get", "code"], 0, 1], stateDigit] as FilterSpecification)
          : undefined,
        boundaryFill,
        selectedBoundaryCode: fnCode || undefined,
        // The tile carries no slug, so derive it from the boundary's name — exactly the way
        // the API derives it — rather than writing an opaque code into the URL.
        onBoundaryClick: (clicked: string, name: string | null) => {
          const slug = name ? firstNationsSlug(name) : clicked;
          writeGeoParam("code", code === slug ? null : slug);
        },
      };
    }
    if (kind === "referendum") {
      // Shade the division (ced) or state boundaries by their Yes share. Codes are state-digit
      // prefixed at both levels, so the shared state filter and the code-first framing hold.
      const layer = refLevel === "state" ? "state" : "ced";
      const framingCode = layer === "state" ? code : code.slice(0, 1);
      const selectionBounds = code ? stateBounds(stateAsgsDigitToAbbrev(framingCode) ?? "") : undefined;
      return {
        ...common,
        focusBounds: selectionBounds ?? common.focusBounds ?? AU_BOUNDS,
        mode: "boundaries",
        boundaryTilesUrl: `${getApiUrl()}/geo/tiles/${layer}/{z}/{x}/{y}?v=4`,
        boundaryFilter: stateDigit
          ? layer === "state"
            ? (["==", ["get", "code"], stateDigit] as FilterSpecification)
            : (["==", ["slice", ["get", "code"], 0, 1], stateDigit] as FilterSpecification)
          : undefined,
        boundaryFill: referendumFillExpr,
        selectedBoundaryCode: code || undefined,
        // Reference-only — never turf, so no basketCodes.
        onBoundaryClick: (clicked: string) => writeGeoParam("code", code === clicked ? null : clicked),
      };
    }
    if (kind === "demographics") {
      // Shade the chosen ASGS level by the chosen indicator. SA2+ paint from client rows; SA1/mb
      // bake the value on the tile (?metric=) and floor the source zoom so a whole-country
      // meshblock tile is never requested. Codes are state-prefixed, so the shared state filter
      // + code-first framing hold at every level.
      const baked = !demoClientJoin && Boolean(indicatorKey);
      const selectionBounds = code ? stateBounds(stateAsgsDigitToAbbrev(code.slice(0, 1)) ?? "") : undefined;
      return {
        ...common,
        focusBounds: selectionBounds ?? common.focusBounds ?? AU_BOUNDS,
        mode: "boundaries",
        boundaryTilesUrl: `${getApiUrl()}/geo/tiles/${demoLevel}/{z}/{x}/{y}?v=4${
          baked ? `&metric=${encodeURIComponent(indicatorKey)}` : ""
        }`,
        boundaryMinZoom: demoLevel === "mb" ? 9 : 0,
        boundaryFilter: stateDigit
          ? (["==", ["slice", ["get", "code"], 0, 1], stateDigit] as FilterSpecification)
          : undefined,
        boundaryFill: demographicsFillExpr,
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
        onLevelChange: (l: AreaLevel) => writeGeoParam("type", l),
        stateDigit: stateDigit || undefined,
        selectedAreas,
        // Areas banked in "My turf" at the active level — green-dashed on the map.
        basketCodes: basket.areas.filter((a) => a.level === level).map((a) => a.code),
        onToggleArea: toggleSelectedArea,
        onViewportAreasChange: setViewportAreas,
        searchMode: places ? "place" : "area",
        onSearchModeChange: (m: "place" | "area") => writeGeoParam("places", m === "place" ? "1" : null),
        query: q,
        onQueryChange: (v: string) => writeGeoParam("q", v || null),
      };
    }
    if (kind === "polling-places") {
      // Every booth is a clustered point; the status field carries the jurisdiction
      // so the map tints federal vs each state/territory (see turf-draw-map palette).
      const selected = pollingPlaces.find((p) => p.id === pollingSelectedId);
      return {
        ...common,
        mode: "points",
        stops: pollingPlaces.map((p) => ({ id: p.id, lat: p.lat, lng: p.lng, status: p.jurisdiction })),
        activeStopId: pollingSelectedId || undefined,
        onStopTap: (id: string) => setPollingSelectedId(pollingSelectedId === id ? "" : id),
        focusPoint: selected ? { lat: selected.lat, lng: selected.lng } : null,
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
    kind, tab, overlay, stateDigit, stateParam, code, q, places, focusBounds, clearToken, resizeToken,
    divisionSelected, setDivisionSelected, selectedAreas, toggleSelectedArea, setViewportAreas,
    setDrawnPolygons, doors, activePid, setActivePid, picked, basket.divisions, basket.areas,
    pollingPlaces, pollingSelectedId, setPollingSelectedId,
    fnCode, boundaryFill, refLevel, referendumFillExpr,
    demoLevel, demoClientJoin, indicatorKey, demographicsFillExpr,
  ]);

  if (!kind) return null;

  const panel =
    kind === "divisions" ? <DivisionsPanel view={view} /> :
    kind === "states" ? <StatesPanel view={view} /> :
    kind === "areas" ? <AreasPanel view={view} /> :
    kind === "polling-places" ? <PollingPlacesPanel view={view} /> :
    kind === "first-nations" ? <FirstNationsPanel view={view} /> :
    kind === "referendum" ? <ReferendumPanel view={view} /> :
    kind === "demographics" ? <DemographicsPanel view={view} /> :
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
        {densityOn && densityLegend.length > 0 && palette ? (
          <div className="pointer-events-none absolute bottom-3 right-3 z-10">
            <SequentialLegend bands={densityLegend} nodata={palette.nodata} unit="addresses / km²" />
          </div>
        ) : null}
        {referendumOn && referendumLegend.length > 0 ? (
          <div className="pointer-events-none absolute bottom-3 right-3 z-10 rounded-lg border border-border bg-surface/95 p-2 text-xs shadow-card backdrop-blur">
            <div className="mb-1 font-semibold text-foreground">Yes share</div>
            <div className="space-y-0.5">
              {referendumLegend.map((b) => (
                <div key={b.label} className="flex items-center gap-1.5">
                  <span className="h-3 w-3 shrink-0 rounded-sm" style={{ backgroundColor: b.color }} />
                  <span className="text-muted-foreground">{b.label}</span>
                </div>
              ))}
            </div>
          </div>
        ) : null}
        {demographicsOn && demographicsLegend.length > 0 && palette && demoData ? (
          <div className="pointer-events-none absolute bottom-3 right-3 z-10">
            <SequentialLegend
              bands={demographicsLegend}
              nodata={palette.nodata}
              unit={demoData.indicator.name}
              format={(n) => formatIndicator(n, demoData.indicator.unit)}
            />
          </div>
        ) : null}
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
