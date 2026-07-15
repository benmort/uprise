"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { createPortal } from "react-dom";
import Map, { AttributionControl, FullscreenControl, Layer, Marker, Popup, Source, useControl, type MapProps, type MapRef } from "react-map-gl/mapbox";
import type { FilterSpecification, ExpressionSpecification } from "mapbox-gl";
import MapboxDraw from "@mapbox/mapbox-gl-draw";
import { bbox } from "@turf/turf";
import { Crosshair, Loader2, MapPin, Search, X } from "lucide-react";
import { AU_BOUNDS, AddressInfoCard } from "@uprise/field";
import { getArea, searchAreas, type AreaHit, type AreaLevel } from "@/lib/api/geo";
import { getApiUrl } from "@/lib/api";
import { useTheme } from "@/components/theme/theme-provider";
import "mapbox-gl/dist/mapbox-gl.css";
import "@mapbox/mapbox-gl-draw/dist/mapbox-gl-draw.css";

const TOKEN = process.env.NEXT_PUBLIC_MAPBOX_TOKEN ?? "";
const mapStyleFor = (theme: string) =>
  theme === "dark" ? "mapbox://styles/mapbox/dark-v11" : "mapbox://styles/mapbox/streets-v12";

export type ExistingTurf = {
  id: string;
  name: string;
  geometry: GeoJSON.Geometry | null;
  color: string;
};

/** A statistical area picked on the map, carrying its boundary for highlight + union. */
export type SelectedArea = { level: AreaLevel; code: string; name: string; geometry: GeoJSON.Geometry };
/** An area hovered on the bounded turf-cut map — surfaced to the right sidebar.
 *  `coverage` is the 0–1 fraction of the area inside the campaign boundary. */
export type AreaHoverInfo = { level: AreaLevel; code: string; name: string; coverage: number };

type MapEvents = { on: (e: string, cb: () => void) => void; off: (e: string, cb: () => void) => void };

const LEVELS: Array<{ id: AreaLevel; label: string }> = [
  { id: "sa4", label: "SA4" },
  { id: "sa3", label: "SA3" },
  { id: "sa2", label: "SA2" },
  { id: "sa1", label: "SA1" },
  { id: "mb", label: "Meshblock" },
];

// Boundaries load as Mapbox Vector Tiles (GET /geo/tiles), so mapbox only requests
// the tiles visible at the current zoom — fast at any zoom, no "zoom in" wall. The
// one exception is meshblocks (368k nationally): only request their tiles once
// zoomed in enough that a tile's row count stays bounded. Every coarser level has
// no floor. `maxzoom` caps tile generation and overzooms finer detail from there.
const MB_MIN_ZOOM = 9;
const TILE_MAX_ZOOM = 16;
const sourceMinZoom = (lvl: AreaLevel) => (lvl === "mb" ? MB_MIN_ZOOM : 0);
// Brand primary for boundary overlays (mapbox paint needs a literal hex).
const PRIMARY = "#465fff";
// "In My turf" (basket) overlay colour — green, matching the "Added / In my turf"
// affordance in the panels. Rendered dashed so it reads as banked, distinct from
// the solid `selectedBoundaryCode` highlight (what you've just clicked).
const BASKET_COLOR = "#16a34a";
// Street-level zoom for a plotted address (points mode) — read individual doors.
const POINT_ZOOM = 16.5;

/** Polygon draw tool. Emits every drawn polygon's geometry on each edit. */
function DrawControl({ onChange, clearToken }: { onChange: (polygons: GeoJSON.Polygon[]) => void; clearToken?: number }) {
  const drawRef = useRef<MapboxDraw | null>(null);

  // Stable handler so onAdd/onRemove register and remove the SAME reference, with a
  // guarded getAll(): a draw.* event firing mid-teardown (StrictMode remount/unmount)
  // hits a disconnected store and throws "Cannot read properties of undefined (reading 'getAll')".
  const handleDrawChange = useCallback(() => {
    const draw = drawRef.current;
    if (!draw) return;
    try {
      const fc = draw.getAll();
      const polys =
        (fc?.features.filter((f) => f.geometry?.type === "Polygon").map((f) => f.geometry) as GeoJSON.Polygon[]) ?? [];
      onChange(polys);
    } catch {
      /* control mid-teardown — store not connected; ignore this event */
    }
  }, [onChange]);

  useControl<MapboxDraw>(
    () => {
      const draw = new MapboxDraw({ displayControlsDefault: false, controls: { polygon: true, trash: true } });
      drawRef.current = draw;
      return draw;
    },
    ({ map }: { map: MapEvents }) => {
      map.on("draw.create", handleDrawChange);
      map.on("draw.update", handleDrawChange);
      map.on("draw.delete", handleDrawChange);
    },
    ({ map }: { map: MapEvents }) => {
      // Remove our listeners (an empty onRemove leaks them; a leaked handler firing
      // against the removed control is what crashed the page).
      map.off("draw.create", handleDrawChange);
      map.off("draw.update", handleDrawChange);
      map.off("draw.delete", handleDrawChange);
      drawRef.current = null;
    },
    { position: "top-left" },
  );

  // Wipe the drawn polygons in place after a save (no map remount → viewport holds).
  useEffect(() => {
    if (clearToken) {
      drawRef.current?.deleteAll();
      onChange([]);
    }
    // onChange is a stable setter; re-running only on clearToken is intended.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [clearToken]);

  return null;
}

export function TurfDrawMap({
  existing = [],
  center,
  focusBounds,
  campaignBoundary,
  boundaryAreas,
  onAreaHover,
  selectedAreas = [],
  onToggleArea,
  onPolygonsChange,
  clearToken,
  controlsContainer,
  searchContainer,
  level: levelProp,
  onLevelChange,
  searchMode: searchModeProp,
  onSearchModeChange,
  query: queryProp,
  onQueryChange,
  onViewportAreasChange,
  stateDigit,
  mode = "areas",
  boundaryLayers,
  boundaryTilesUrl,
  boundaryMinZoom = 0,
  boundaryFilter,
  boundaryFill,
  selectedBoundaryCode,
  basketCodes,
  onBoundaryClick,
  stops = [],
  activeStopId,
  onStopTap,
  stopPopup = false,
  buildDetailHref,
  userPosition,
  focusPoint,
  resizeToken,
  recenterToken,
}: {
  existing?: ExistingTurf[];
  center?: { lat: number; lng: number } | null;
  /** `[w,s,e,n]` to frame the map to on change — the shared State Filter zooming to a state. */
  focusBounds?: [number, number, number, number];
  /** A campaign's saved boundary (GeoJSON MultiPolygon). When set — and no explicit
   *  focusBounds/point view is given — the map fits to it and draws it as a grey shaded
   *  backdrop so turf is cut against the campaign's extent. */
  campaignBoundary?: GeoJSON.Geometry | null;
  /** The areas (at the active level) intersecting the campaign boundary, as GeoJSON.
   *  When set, the areas layer is drawn from THIS (clipped to the campaign) instead of
   *  the national vector tiles — so a bounded campaign only shows selectable areas
   *  inside it. The parent re-fetches this on `onLevelChange`. */
  boundaryAreas?: GeoJSON.FeatureCollection | null;
  /** Hovering an area on the bounded map reports it here (null on leave) for the
   *  sidebar. Only fires when `boundaryAreas` is active. */
  onAreaHover?: (area: AreaHoverInfo | null) => void;
  /** ASGS state digit (first char of every area code). Set → only that state's areas
   *  render (and appear in the viewport list); "" / undefined → all states. */
  stateDigit?: string;
  selectedAreas?: SelectedArea[];
  onToggleArea?: (area: SelectedArea) => void;
  onPolygonsChange: (polygons: GeoJSON.Polygon[]) => void;
  clearToken?: number;
  /**
   * Where the level pills + search render. Omit → the classic on-map overlay
   * (campaign turf/boundary pages). Pass an element → they portal into it as a
   * horizontal toolbar (the areas explorer's row under the page chrome); pass
   * null while the container ref is still mounting and they render nowhere.
   */
  controlsContainer?: HTMLElement | null;
  /**
   * Where the Areas|Places + search combobox renders, split out from the level
   * pills. Omit → it stays inline with the pills in `controlsContainer` (the
   * default toolbar). Pass an element (e.g. the (geo) layout's tab-row slot) →
   * the combobox portals there instead, so it sits on the tab row while the
   * level pills stay in `controlsContainer`. Only applies when `controlsContainer`
   * is set (the portaled-toolbar path); the on-map overlay ignores it.
   */
  searchContainer?: HTMLElement | null;
  /**
   * Optional controlled state. When a value is supplied the component reads it
   * (and calls the matching callback on change) instead of its own useState, so
   * the areas explorer can drive level/mode/search from the URL. All optional —
   * omit every one and the map behaves exactly as before (campaign pages).
   */
  level?: AreaLevel;
  onLevelChange?: (level: AreaLevel) => void;
  searchMode?: "place" | "area";
  onSearchModeChange?: (mode: "place" | "area") => void;
  query?: string;
  onQueryChange?: (q: string) => void;
  /** Emits the areas currently loaded in the viewport (+ zoomed-out flag) for a sidebar list. */
  onViewportAreasChange?: (areas: AreaHit[], tooZoomedOut: boolean) => void;
  /**
   * Which overlay this map draws (the unified geo explorer, Phase 2). Default
   * "areas" = the statistical-area select machinery (unchanged; the campaign
   * turf/boundary pages rely on it). "boundaries" = clickable ced/sed/lga/state
   * vector-tile overlays. "points" = a plotted point + nearby-door stops. DrawControl
   * and `transformRequest` are always on, so freehand draw works in every mode.
   */
  mode?: "areas" | "boundaries" | "points";
  /** boundaries mode — several colour-coded tile layers drawn together (Divisions). */
  boundaryLayers?: Array<{ id: string; tilesUrl: string; color: string; interactive: boolean }>;
  /** boundaries mode — a single tile overlay (States). */
  boundaryTilesUrl?: string;
  /** boundaries mode — minzoom floor for the single-tile source (default 0). Set for dense levels
   *  (meshblock/SA1) so a low-zoom whole-country tile is never requested. */
  boundaryMinZoom?: number;
  boundaryFilter?: FilterSpecification;
  /**
   * boundaries mode — paint the fill from a data expression instead of the flat layer
   * colour (the address-density choropleth). The tiles carry a `density` property per
   * feature; see `lib/canvass/density.ts#densityFill`. Raises the fill opacity too — a
   * 6% wash is a boundary hint, not a choropleth.
   */
  boundaryFill?: ExpressionSpecification | string;
  selectedBoundaryCode?: string;
  /** Codes already in the "My turf" basket for the active kind/level — drawn as a
   *  distinct green dashed overlay (vs the solid `selectedBoundaryCode` highlight)
   *  so it's clear what's banked vs what's currently picked. */
  basketCodes?: string[];
  onBoundaryClick?: (code: string, name: string | null, layerId?: string) => void;
  /** points mode — nearby-door markers (clustered) around the plotted point. `address`/
   *  `contactId` feed the tap-to-open door info popover (addresses kind; the id IS the gnafPid). */
  stops?: Array<{ id: string; lat: number; lng: number; status?: string; address?: string | null; contactId?: string | null }>;
  activeStopId?: string;
  onStopTap?: (id: string) => void;
  /** When set (addresses kind only), the active door shows a door info popover — address +
   *  contact + regions + a "View full detail" link. Not set for polling-places points. */
  stopPopup?: boolean;
  /** Builds the popover's "View full detail" link for a door's gnafPid. */
  buildDetailHref?: (gnafPid: string) => string;
  userPosition?: { lat: number; lng: number } | null;
  /** points mode — the plotted address; flies to it and frames at street zoom. */
  focusPoint?: { lat: number; lng: number } | null;
  /** Bumped by the persistent geo surface when the map returns from list view
   *  (where it's display:none, so its canvas measures 0×0 and must resize on show). */
  resizeToken?: number;
  /** Bump to re-fit the map to the campaign boundary (or focusBounds/country
   *  fallback) on demand — the "Recentre on boundary" affordance. */
  recenterToken?: number;
}) {
  const { theme } = useTheme();
  const mapRef = useRef<MapRef | null>(null);

  // Controlled-or-internal: read the prop when supplied, else own state; the
  // setter delegates to the callback when controlled. Keeps the two uncontrolled
  // consumers (campaign turf + boundary pages) working unchanged.
  const [levelInternal, setLevelInternal] = useState<AreaLevel>("sa2");
  const level = levelProp ?? levelInternal;
  const setLevel = useCallback(
    (l: AreaLevel) => (onLevelChange ? onLevelChange(l) : setLevelInternal(l)),
    [onLevelChange],
  );
  // The areas currently rendered in the viewport, read from the vector-tile layer
  // (queryRenderedFeatures) rather than a fetched GeoJSON blob — backs the sidebar
  // list + the search dropdown's "browse in view".
  const [viewportHits, setViewportHits] = useState<AreaHit[]>([]);
  const [loadingTiles, setLoadingTiles] = useState(false);
  const [mapLoaded, setMapLoaded] = useState(false);
  // Only the meshblock level has a zoom floor (below it its tiles aren't requested);
  // every other level loads at any zoom.
  const [tooZoomedOut, setTooZoomedOut] = useState(false);
  const [searchModeInternal, setSearchModeInternal] = useState<"place" | "area">("area");
  const searchMode = searchModeProp ?? searchModeInternal;
  const setSearchMode = useCallback(
    (m: "place" | "area") => (onSearchModeChange ? onSearchModeChange(m) : setSearchModeInternal(m)),
    [onSearchModeChange],
  );
  const [queryInternal, setQueryInternal] = useState("");
  const query = queryProp ?? queryInternal;
  const setQuery = useCallback(
    (v: string) => (onQueryChange ? onQueryChange(v) : setQueryInternal(v)),
    [onQueryChange],
  );
  const [hits, setHits] = useState<Array<{ label: string; code?: string; lat: number; lng: number; bbox?: [number, number, number, number] }>>([]);
  const [searching, setSearching] = useState(false);
  const [areaOpen, setAreaOpen] = useState(false);

  // A campaign boundary's bounding box → the frame to fit when no explicit
  // focusBounds is passed, so cutting a campaign's turf opens on its boundary.
  const boundaryBounds = useMemo<[number, number, number, number] | null>(() => {
    if (!campaignBoundary) return null;
    try {
      const [w, s, e, n] = bbox({ type: "Feature", geometry: campaignBoundary, properties: {} });
      return [w, s, e, n].every((v) => Number.isFinite(v)) ? [w, s, e, n] : null;
    } catch {
      return null;
    }
  }, [campaignBoundary]);

  const initialViewState = useMemo<MapProps["initialViewState"]>(() => {
    if (center) return { latitude: center.lat, longitude: center.lng, zoom: 11 };
    if (focusPoint) return { latitude: focusPoint.lat, longitude: focusPoint.lng, zoom: POINT_ZOOM };
    // A picked state (focusBounds) or the campaign boundary frames the view; else the country.
    const frame = focusBounds ?? boundaryBounds ?? AU_BOUNDS;
    return {
      bounds: [[frame[0], frame[1]], [frame[2], frame[3]]],
      fitBoundsOptions: { padding: 32 },
    };
  }, [center, focusBounds, focusPoint, boundaryBounds]);

  // points mode: fly to the plotted address whenever it changes (skip the first
  // run — initialViewState/onLoad already frame it on mount).
  const pointedOnce = useRef(false);
  useEffect(() => {
    if (!pointedOnce.current) {
      pointedOnce.current = true;
      return;
    }
    if (!focusPoint) return;
    mapRef.current
      ?.getMap()
      ?.flyTo({ center: [focusPoint.lng, focusPoint.lat], zoom: POINT_ZOOM, duration: 600 });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [focusPoint]);

  // The persistent geo surface keeps this map mounted but display:none in list view;
  // a hidden mapbox canvas measures 0×0. When it's shown again (token bump) we must
  // BOTH resize AND re-frame to the data — resize alone keeps the stale 0×0-era
  // viewport, which is exactly what makes areas/boundaries look empty until you pan.
  // Reads the current focus values from the render where the token changed (the
  // moment we became visible), so it always frames what's now selected.
  useEffect(() => {
    if (resizeToken === undefined) return;
    const id = requestAnimationFrame(() => {
      const map = mapRef.current?.getMap();
      if (!map) return;
      map.resize();
      if (focusPoint) {
        map.flyTo({ center: [focusPoint.lng, focusPoint.lat], zoom: POINT_ZOOM, duration: 0 });
      } else if (!center) {
        const frame = focusBounds ?? boundaryBounds ?? AU_BOUNDS;
        map.fitBounds([[frame[0], frame[1]], [frame[2], frame[3]]], { padding: 32 });
      }
    });
    return () => cancelAnimationFrame(id);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [resizeToken]);

  // Re-frame on a State Filter change: to the picked state, or back to the national
  // (AU) view when cleared to "All states". Skip the first run — initialViewState +
  // onLoad already frame the map on mount. A `center` point view stays put.
  const framedOnce = useRef(false);
  useEffect(() => {
    if (!framedOnce.current) {
      framedOnce.current = true;
      return;
    }
    if (center) return;
    const frame = focusBounds ?? AU_BOUNDS;
    mapRef.current
      ?.getMap()
      ?.fitBounds([[frame[0], frame[1]], [frame[2], frame[3]]], { padding: 32, duration: 600 });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [focusBounds]);

  // Fit to the campaign boundary when it loads (fetched async, after mount).
  // A point view (center/focusPoint) or an explicit focusBounds takes precedence.
  useEffect(() => {
    if (!boundaryBounds || center || focusPoint || focusBounds) return;
    mapRef.current
      ?.getMap()
      ?.fitBounds([[boundaryBounds[0], boundaryBounds[1]], [boundaryBounds[2], boundaryBounds[3]]], {
        padding: 32,
        duration: 600,
      });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [boundaryBounds]);

  // On-demand recentre (the sidebar "Recentre on boundary" button bumps the token):
  // snap back to the campaign boundary after panning/zooming away. Skips the first
  // run so a 0-initialised token doesn't fight the mount-time framing.
  const recenteredOnce = useRef(false);
  useEffect(() => {
    if (recenterToken === undefined) return;
    if (!recenteredOnce.current) {
      recenteredOnce.current = true;
      return;
    }
    const frame = boundaryBounds ?? focusBounds ?? AU_BOUNDS;
    mapRef.current
      ?.getMap()
      ?.fitBounds([[frame[0], frame[1]], [frame[2], frame[3]]], { padding: 32, duration: 600 });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [recenterToken]);

  // The on-map "Recentre" button: re-fit to the campaign boundary (or the picked
  // state / country fallback) after panning or zooming away.
  const recenter = useCallback(() => {
    const frame = boundaryBounds ?? focusBounds ?? AU_BOUNDS;
    mapRef.current
      ?.getMap()
      ?.fitBounds([[frame[0], frame[1]], [frame[2], frame[3]]], { padding: 32, duration: 600 });
  }, [boundaryBounds, focusBounds]);

  // Auto-recentre on the FullscreenControl toggle — entering AND exiting. Mapbox resizes the
  // canvas on the fullscreen change but keeps the pre-fullscreen viewport; we re-frame to the
  // boundary against the new dimensions (a point view stays put). Skip while a point is focused.
  useEffect(() => {
    if (!mapLoaded) return;
    const onFullscreenChange = () => {
      const map = mapRef.current?.getMap();
      if (!map) return;
      // Re-fit after the browser finishes the fullscreen layout (rAF), so fitBounds computes
      // against the fullscreen (or restored) container size, not the stale one.
      requestAnimationFrame(() => {
        map.resize();
        if (focusPoint) {
          map.flyTo({ center: [focusPoint.lng, focusPoint.lat], zoom: POINT_ZOOM, duration: 0 });
        } else {
          recenter();
        }
      });
    };
    document.addEventListener("fullscreenchange", onFullscreenChange);
    document.addEventListener("webkitfullscreenchange", onFullscreenChange);
    return () => {
      document.removeEventListener("fullscreenchange", onFullscreenChange);
      document.removeEventListener("webkitfullscreenchange", onFullscreenChange);
    };
  }, [mapLoaded, recenter, focusPoint]);

  // Vector-tile boundary source for the active level. mapbox requests only the
  // tiles visible at the current zoom, so this is what makes boundaries fast at any
  // zoom (no per-viewport GeoJSON, no zoom gate). Keyed by level so switching pills
  // swaps the source cleanly. Same-origin session cookie is attached via the map's
  // transformRequest below.
  // ?v= busts the 24h tile cache when the tile output changes (bump on any change
  // to the tile generator, e.g. the feature cap). Same URL → stale cached tile.
  const tileUrl = `${getApiUrl()}/geo/tiles/${level}/{z}/{x}/{y}?v=3`;

  // Shared State Filter: every area code is prefixed by its state's ASGS digit, so
  // restrict the rendered layers (and thus the queryRenderedFeatures "in view" list)
  // to that state — same first-char filter the Divisions map uses. Undefined = all.
  const areaFilter: FilterSpecification | undefined = stateDigit
    ? ["==", ["slice", ["get", "code"], 0, 1], stateDigit]
    : undefined;

  // "In My turf" highlight: match any tile feature whose code is in the basket for
  // the active kind/level. Undefined (nothing banked) → the basket layers don't render.
  const basketFilter = useMemo<FilterSpecification | undefined>(
    () =>
      basketCodes && basketCodes.length
        ? (["in", ["get", "code"], ["literal", basketCodes]] as FilterSpecification)
        : undefined,
    [basketCodes],
  );

  // Bounded campaign: draw the areas layer from the campaign-clipped GeoJSON
  // (`boundaryAreas`) rather than the national vector tiles, so only areas inside
  // the boundary are shown + selectable.
  const useBoundaryAreas = mode === "areas" && !!boundaryAreas;
  // Split by how much of the area sits inside the boundary: ≥50% draws solid
  // (mostly-inside), <50% draws as a faint dashed "edge" outline.
  const insideFilter: FilterSpecification = [">=", ["coalesce", ["get", "coverage"], 1], 0.5];
  const edgeFilter: FilterSpecification = ["<", ["coalesce", ["get", "coverage"], 1], 0.5];
  // Dedupe hover: onMouseMove fires per pixel, so only report when the area changes.
  const hoverCodeRef = useRef<string>("");

  // Send the parent-domain session cookie on our own tile requests (the API is
  // ORGANISER-gated); leave mapbox's own style/sprite/tile requests untouched.
  // Match by ORIGIN (not the full /api/v1 base) so any formatting of getApiUrl()
  // still opts every boundary tile into credentials — a prefix mismatch here is
  // exactly what makes the tiles 401 and the boundaries never paint. Mapbox's own
  // tiles live on a different origin (api.mapbox.com), so they're untouched.
  const apiOrigin = useMemo(() => {
    try {
      return new URL(getApiUrl()).origin;
    } catch {
      return "";
    }
  }, []);
  const transformRequest = useCallback(
    (url: string, resourceType?: string) =>
      resourceType === "Tile" && apiOrigin && url.startsWith(apiOrigin)
        ? { url, credentials: "include" as const }
        : { url },
    [apiOrigin],
  );

  // Read the areas currently rendered in the viewport off the vector-tile layer,
  // deduped by code — replaces deriving them from a fetched GeoJSON collection.
  const syncViewport = useCallback(() => {
    const map = mapRef.current?.getMap();
    if (!map) return;
    setTooZoomedOut(level === "mb" && map.getZoom() < MB_MIN_ZOOM);
    let rendered: Array<{ properties: Record<string, unknown> | null }> = [];
    try {
      rendered = map.queryRenderedFeatures({ layers: ["areas-fill"] }) as never;
    } catch {
      rendered = [];
    }
    const seen = new Set<string>();
    const out: AreaHit[] = [];
    for (const f of rendered) {
      const p = f.properties as { code?: string; name?: string } | null;
      if (!p?.code || seen.has(p.code)) continue;
      seen.add(p.code);
      out.push({ level, code: p.code, name: p.name ?? p.code });
    }
    out.sort((a, b) => a.name.localeCompare(b.name));
    setViewportHits(out);
  }, [level]);

  // The State Filter is applied client-side to already-loaded tiles (no refetch), so
  // re-read the rendered features on the next frame when it changes to refresh the
  // "in view" count/list immediately.
  useEffect(() => {
    const id = requestAnimationFrame(() => syncViewport());
    return () => cancelAnimationFrame(id);
  }, [stateDigit, syncViewport]);

  // Drive the loading spinner off the map's tile lifecycle, and refresh the
  // viewport list once rendering settles (idle). Attaches once the map is ready.
  useEffect(() => {
    const map = mapRef.current?.getMap();
    if (!map || !mapLoaded) return;
    const onSourceData = (e: { sourceId?: string; isSourceLoaded?: boolean }) => {
      if (e.sourceId === "areas" && !e.isSourceLoaded) setLoadingTiles(true);
    };
    const onIdle = () => {
      setLoadingTiles(false);
      syncViewport();
    };
    map.on("sourcedata", onSourceData);
    map.on("idle", onIdle);
    return () => {
      map.off("sourcedata", onSourceData);
      map.off("idle", onIdle);
    };
  }, [mapLoaded, syncViewport]);

  const selectedFc = useMemo<GeoJSON.FeatureCollection>(
    () => ({
      type: "FeatureCollection",
      features: selectedAreas.map((a) => ({ type: "Feature", geometry: a.geometry, properties: { code: a.code } })),
    }),
    [selectedAreas],
  );

  // points mode — nearby doors as clustered circles (excluding the active one).
  const stopsGeoJson = useMemo<GeoJSON.FeatureCollection>(
    () => ({
      type: "FeatureCollection",
      features: stops
        .filter((s) => s.id !== activeStopId)
        .map((s) => ({
          type: "Feature",
          geometry: { type: "Point", coordinates: [s.lng, s.lat] },
          properties: { id: s.id, status: s.status ?? "PENDING" },
        })),
    }),
    [stops, activeStopId],
  );
  const activeStop = stops.find((s) => s.id === activeStopId);

  const runSearch = useCallback(async () => {
    const q = query.trim();
    if (q.length < 2) return;
    setSearching(true);
    try {
      if (searchMode === "area") {
        const res = await searchAreas(level, q);
        setHits(
          res.ok
            ? (res.data as AreaHit[]).map((h) => ({ label: `${h.name} · ${h.code}`, code: h.code, lat: 0, lng: 0 }))
            : [],
        );
      } else {
        const url = `https://api.mapbox.com/geocoding/v5/mapbox.places/${encodeURIComponent(q)}.json?access_token=${TOKEN}&country=au&limit=5`;
        const r = await fetch(url);
        const j = (await r.json()) as { features?: Array<{ place_name: string; center: [number, number]; bbox?: [number, number, number, number] }> };
        setHits((j.features ?? []).map((f) => ({ label: f.place_name, lng: f.center[0], lat: f.center[1], bbox: f.bbox })));
      }
    } finally {
      setSearching(false);
    }
  }, [query, searchMode, level]);

  const pickHit = useCallback(
    async (hit: { label: string; code?: string; lat: number; lng: number; bbox?: [number, number, number, number] }) => {
      const map = mapRef.current?.getMap();
      if (searchMode === "area" && hit.code) {
        const res = await getArea(level, hit.code);
        if (res.ok) {
          const f = res.data;
          onToggleArea?.({ level, code: f.properties.code, name: f.properties.name, geometry: f.geometry });
          const [w, s, e, n] = bbox(f as GeoJSON.Feature);
          map?.fitBounds([[w, s], [e, n]], { padding: 48, duration: 600 });
        }
      } else if (hit.bbox) {
        map?.fitBounds([[hit.bbox[0], hit.bbox[1]], [hit.bbox[2], hit.bbox[3]]], { padding: 48, duration: 600 });
      } else {
        map?.flyTo({ center: [hit.lng, hit.lat], zoom: 13, duration: 600 });
      }
      setHits([]);
      setQuery("");
      setAreaOpen(false);
    },
    [searchMode, level, onToggleArea],
  );

  // Area mode is a combobox: typing (≥2 chars) live-searches the level's full
  // national set; an empty query falls back to the in-view areas (below).
  useEffect(() => {
    if (searchMode !== "area") return;
    if (query.trim().length < 2) {
      setHits([]);
      return;
    }
    const t = setTimeout(() => void runSearch(), 250);
    return () => clearTimeout(t);
  }, [query, searchMode, level, runSearch]);

  // What the area dropdown shows: search hits when typing, else the active
  // level's areas currently on the map (scrollable). Capped for DOM sanity.
  const AREA_LIST_CAP = 300;
  const viewportAreas = useMemo(
    () => viewportHits.map((h) => ({ label: `${h.name} · ${h.code}`, code: h.code, lat: 0, lng: 0 })),
    [viewportHits],
  );

  const areaOptions = query.trim().length >= 2 ? hits : viewportAreas;
  const areaListTruncated = query.trim().length < 2 && viewportAreas.length > AREA_LIST_CAP;
  const displayList = searchMode === "area" ? (areaOpen ? areaOptions.slice(0, AREA_LIST_CAP) : []) : hits;

  // Surface the in-view areas (+ zoomed-out flag) so a consumer can render a
  // divisions-style sidebar list. onViewportAreasChange must be stable (parent
  // useCallback) or this re-fires each render.
  useEffect(() => {
    onViewportAreasChange?.(viewportHits, tooZoomedOut);
  }, [viewportHits, tooZoomedOut, onViewportAreasChange]);

  const selectLevel = (id: AreaLevel) => {
    // Keep the search term across a level switch (it maps to the shared ?q= when
    // controlled); the vector source swaps via its `key={level}` + `tiles` url.
    setLevel(id);
    setHits([]);
  };

  if (!TOKEN) {
    return (
      <div className="flex h-full items-center justify-center rounded-xl bg-surface-variant p-6 text-center text-sm text-muted-foreground">
        Set <code className="mx-1">NEXT_PUBLIC_MAPBOX_TOKEN</code> to draw turf on the map.
      </div>
    );
  }

  // The Areas|Places + search combobox. Rendered inline with the level pills by
  // default; when a `searchContainer` is supplied it portals there instead (the
  // areas explorer lifts it onto the (geo) tab row). One element, one place at a
  // time — see the portal branch below.
  const searchCombobox = (
    <div className="relative">
      <div className="flex h-9 items-center overflow-hidden rounded-lg border border-border bg-surface">
        {(["area", "place"] as const).map((m) => (
          <button
            key={m}
            type="button"
            onClick={() => {
              setSearchMode(m);
              setHits([]);
            }}
            className={`self-stretch px-2.5 text-[11px] font-bold uppercase tracking-[0.05em] transition ${
              searchMode === m ? "text-primary" : "text-muted-foreground hover:text-foreground"
            }`}
          >
            {m === "area" ? "Areas" : "Places"}
          </button>
        ))}
        <span className="h-5 w-px bg-border" />
        <div className="flex items-center gap-1.5 px-2">
          <Search className="h-3.5 w-3.5 shrink-0 text-muted-foreground" />
          <input
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            onFocus={() => setAreaOpen(true)}
            onBlur={() => setTimeout(() => setAreaOpen(false), 150)}
            onKeyDown={(e) => e.key === "Enter" && void runSearch()}
            placeholder={searchMode === "area" ? `Search or browse ${level.toUpperCase()}…` : "Suburb, address…"}
            className="w-52 bg-transparent text-sm outline-none placeholder:text-muted-foreground"
          />
          {searching ? <Loader2 className="h-3.5 w-3.5 animate-spin text-muted-foreground" /> : null}
          {query ? (
            <button type="button" aria-label="Clear" onClick={() => { setQuery(""); setHits([]); }}>
              <X className="h-3.5 w-3.5 text-muted-foreground hover:text-foreground" />
            </button>
          ) : null}
        </div>
      </div>
      {displayList.length > 0 ? (
        <ul className="absolute left-0 top-full z-20 mt-1 max-h-64 w-72 overflow-auto rounded-lg border border-border bg-surface shadow-card">
          {displayList.map((h, i) => (
            <li key={`${h.code ?? h.label}-${i}`}>
              <button
                type="button"
                onMouseDown={(e) => e.preventDefault()}
                onClick={() => void pickHit(h)}
                className="flex w-full items-center gap-1.5 px-2 py-1.5 text-left text-xs hover:bg-surface-variant"
              >
                <MapPin className="h-3 w-3 shrink-0 text-muted-foreground" />
                <span className="truncate">{h.label}</span>
              </button>
            </li>
          ))}
          {areaListTruncated ? (
            <li className="px-2 py-1.5 text-[11px] text-muted-foreground">
              Showing first {AREA_LIST_CAP} — type to search the full {level.toUpperCase()} list.
            </li>
          ) : null}
        </ul>
      ) : searchMode === "area" && areaOpen && query.trim().length < 2 ? (
        <div className="absolute left-0 top-full z-20 mt-1 w-72 rounded-lg border border-border bg-surface px-2 py-1.5 text-[11px] text-muted-foreground shadow-card">
          {tooZoomedOut
            ? `Zoom in to list ${level.toUpperCase()} areas, or type to search.`
            : `No ${level.toUpperCase()} areas in view — type to search.`}
        </div>
      ) : null}
    </div>
  );

  return (
    <div className="relative h-full w-full">
      <Map
        ref={mapRef}
        mapboxAccessToken={TOKEN}
        initialViewState={initialViewState}
        mapStyle={mapStyleFor(theme)}
        style={{ width: "100%", height: "100%" }}
        // Compact attribution: collapse the "© Mapbox © OpenStreetMap" bar to a small ⓘ toggle.
        attributionControl={false}
        interactiveLayerIds={
          mode === "boundaries"
            ? [
                ...(boundaryTilesUrl ? ["boundaries-fill"] : []),
                ...(boundaryLayers?.filter((bl) => bl.interactive).map((bl) => `boundaries-${bl.id}-fill`) ?? []),
              ]
            : mode === "points"
              ? ["stops-circles"]
              : useBoundaryAreas
                ? ["boundary-areas-fill", "boundary-areas-fill-edge"]
                : ["areas-fill"]
        }
        transformRequest={transformRequest}
        onLoad={() => {
          setMapLoaded(true);
          const map = mapRef.current?.getMap();
          if (map) {
            // The container finishes laying out (next/dynamic + grid) after the map
            // computes its initial view, so re-fit once sized or the wrong tiles load
            // and boundaries look missing until you interact. A `center`/`focusPoint`
            // point view is already correct — leave it.
            map.resize();
            if (focusPoint) {
              map.flyTo({ center: [focusPoint.lng, focusPoint.lat], zoom: POINT_ZOOM, duration: 0 });
            } else if (!center) {
              const frame = focusBounds ?? boundaryBounds ?? AU_BOUNDS;
              map.fitBounds([[frame[0], frame[1]], [frame[2], frame[3]]], { padding: 32 });
            }
          }
          syncViewport();
        }}
        onMoveEnd={() => syncViewport()}
        onMouseMove={(e) => {
          if (!useBoundaryAreas || !onAreaHover) return;
          const f = e.features?.find(
            (ft) => ft.layer?.id === "boundary-areas-fill" || ft.layer?.id === "boundary-areas-fill-edge",
          );
          const p = f?.properties as { code?: string; name?: string; level?: string; coverage?: number } | null;
          const code = p?.code ? String(p.code) : "";
          if (code === hoverCodeRef.current) return;
          hoverCodeRef.current = code;
          onAreaHover(
            code
              ? {
                  level: (p?.level as AreaLevel) ?? level,
                  code,
                  name: p?.name ? String(p.name) : code,
                  coverage: Number(p?.coverage ?? 1),
                }
              : null,
          );
        }}
        onMouseLeave={() => {
          if (!onAreaHover || hoverCodeRef.current === "") return;
          hoverCodeRef.current = "";
          onAreaHover(null);
        }}
        onClick={(e) => {
          if (mode === "boundaries") {
            // A boundary click selects that region (single "boundaries-fill" or a
            // multi-layer "boundaries-<id>-fill").
            const boundary = e.features?.find((f) => {
              const id = f.layer?.id ?? "";
              return id === "boundaries-fill" || (id.startsWith("boundaries-") && id.endsWith("-fill"));
            });
            if (boundary && onBoundaryClick) {
              const p = (boundary.properties ?? {}) as { code?: unknown; name?: unknown };
              const m = (boundary.layer?.id ?? "").match(/^boundaries-(.+)-fill$/);
              if (p.code != null) {
                onBoundaryClick(String(p.code), p.name != null ? String(p.name) : null, m ? m[1] : undefined);
              }
            }
            return;
          }
          if (mode === "points") {
            const f = e.features?.[0];
            const id = f?.properties?.id;
            if (id && onStopTap) onStopTap(String(id));
            return;
          }
          // areas mode (default): select a statistical area.
          const f = e.features?.[0];
          if (!f || !onToggleArea) return;
          const p = f.properties as { code?: string; name?: string } | null;
          if (!p?.code) return;
          const code = String(p.code);
          // Bounded campaign: the clipped GeoJSON already carries the full area
          // geometry, so toggle straight from it (no per-click getArea fetch).
          if (useBoundaryAreas) {
            const src = boundaryAreas?.features.find(
              (ft) => (ft.properties as { code?: string } | null)?.code === code,
            );
            onToggleArea({
              level,
              code,
              name: p.name ?? code,
              geometry: (src?.geometry ?? f.geometry) as GeoJSON.Geometry,
            });
            return;
          }
          // Tile geometry is clipped to the tile; fetch the true boundary for the
          // highlight + union (same as picking a search/sidebar result).
          void getArea(level, code).then((res) => {
            if (res.ok) {
              onToggleArea({
                level,
                code: res.data.properties.code,
                name: res.data.properties.name,
                geometry: res.data.geometry,
              });
            }
          });
        }}
      >
        <DrawControl onChange={onPolygonsChange} clearToken={clearToken} />

        {/* Campaign boundary — grey shaded backdrop of the campaign's extent. Drawn
            first so it sits beneath the selectable areas and the turf being cut. */}
        {campaignBoundary ? (
          <Source id="campaign-boundary" type="geojson" data={{ type: "Feature", geometry: campaignBoundary, properties: {} }}>
            <Layer id="campaign-boundary-fill" type="fill" paint={{ "fill-color": "#64748b", "fill-opacity": 0.15 }} />
            <Layer id="campaign-boundary-line" type="line" paint={{ "line-color": "#64748b", "line-width": 1.5 }} />
          </Source>
        ) : null}

        {/* Already-claimed turf (any campaign) — amber dashed warning. */}
        {existing.map((t) =>
          t.geometry ? (
            <Source key={t.id} id={`claimed-${t.id}`} type="geojson" data={{ type: "Feature", geometry: t.geometry, properties: {} }}>
              <Layer id={`claimed-fill-${t.id}`} type="fill" paint={{ "fill-color": "#b45309", "fill-opacity": 0.1 }} />
              <Layer id={`claimed-line-${t.id}`} type="line" paint={{ "line-color": "#b45309", "line-width": 1.5, "line-dasharray": [2, 2] }} />
            </Source>
          ) : null,
        )}

        {/* areas mode — selectable statistical areas for the active level, as
            on-demand vector tiles. Keyed by level so the source recreates on a pill
            switch. Plus the selected-area highlight on top. */}
        {mode === "areas" ? (
          <>
            {useBoundaryAreas ? (
              // Bounded campaign: areas clipped to the boundary, from GeoJSON. Areas
              // ≥50% inside draw solid; <50% ("edge") draw as a faint dashed outline.
              <Source id="boundary-areas" type="geojson" data={boundaryAreas ?? { type: "FeatureCollection", features: [] }}>
                <Layer id="boundary-areas-fill" type="fill" filter={insideFilter} paint={{ "fill-color": "#2563eb", "fill-opacity": 0.06 }} />
                <Layer id="boundary-areas-line" type="line" filter={insideFilter} paint={{ "line-color": "#2563eb", "line-width": 1 }} />
                <Layer id="boundary-areas-fill-edge" type="fill" filter={edgeFilter} paint={{ "fill-color": "#64748b", "fill-opacity": 0.03 }} />
                <Layer id="boundary-areas-line-edge" type="line" filter={edgeFilter} paint={{ "line-color": "#64748b", "line-width": 1, "line-dasharray": [2, 2] }} />
              </Source>
            ) : (
              <Source
                key={level}
                id="areas"
                type="vector"
                tiles={[tileUrl]}
                minzoom={sourceMinZoom(level)}
                maxzoom={TILE_MAX_ZOOM}
              >
                <Layer id="areas-fill" source-layer="areas" type="fill" filter={areaFilter} paint={{ "fill-color": "#2563eb", "fill-opacity": 0.06 }} />
                <Layer id="areas-line" source-layer="areas" type="line" filter={areaFilter} paint={{ "line-color": "#2563eb", "line-width": 1.2, "line-opacity": 0.75 }} />
                {basketFilter ? (
                  <>
                    <Layer id="areas-basket-fill" source-layer="areas" type="fill" filter={basketFilter} paint={{ "fill-color": BASKET_COLOR, "fill-opacity": 0.22 }} />
                    <Layer id="areas-basket-line" source-layer="areas" type="line" filter={basketFilter} paint={{ "line-color": BASKET_COLOR, "line-width": 2.5, "line-dasharray": [2, 1.5] }} />
                  </>
                ) : null}
              </Source>
            )}
            <Source id="selected" type="geojson" data={selectedFc}>
              <Layer id="selected-fill" type="fill" paint={{ "fill-color": "#2563eb", "fill-opacity": 0.4 }} />
              <Layer id="selected-line" type="line" paint={{ "line-color": "#1d4ed8", "line-width": 3.5 }} />
            </Source>
          </>
        ) : null}

        {/* boundaries mode — single overlay (States). */}
        {mode === "boundaries" && boundaryTilesUrl ? (
          <Source key={boundaryTilesUrl} id="boundaries" type="vector" tiles={[boundaryTilesUrl]} minzoom={boundaryMinZoom} maxzoom={16}>
            <Layer id="boundaries-fill" source-layer="areas" type="fill" filter={boundaryFilter} paint={{ "fill-color": boundaryFill ?? PRIMARY, "fill-opacity": boundaryFill ? 0.75 : 0.06 }} />
            <Layer id="boundaries-line" source-layer="areas" type="line" filter={boundaryFilter} paint={{ "line-color": PRIMARY, "line-width": 1.2, "line-opacity": 0.7 }} />
            {basketFilter ? (
              <>
                <Layer id="boundaries-basket-fill" source-layer="areas" type="fill" filter={basketFilter} paint={{ "fill-color": BASKET_COLOR, "fill-opacity": 0.22 }} />
                <Layer id="boundaries-basket-line" source-layer="areas" type="line" filter={basketFilter} paint={{ "line-color": BASKET_COLOR, "line-width": 2.5, "line-dasharray": [2, 1.5] }} />
              </>
            ) : null}
            {selectedBoundaryCode ? (
              <>
                <Layer id="boundaries-selected-fill" source-layer="areas" type="fill" filter={["==", ["get", "code"], selectedBoundaryCode]} paint={{ "fill-color": PRIMARY, "fill-opacity": 0.55 }} />
                <Layer id="boundaries-selected-line" source-layer="areas" type="line" filter={["==", ["get", "code"], selectedBoundaryCode]} paint={{ "line-color": PRIMARY, "line-width": 4 }} />
              </>
            ) : null}
          </Source>
        ) : null}

        {/* boundaries mode — several colour-coded overlays drawn together (Divisions). */}
        {mode === "boundaries" && boundaryLayers
          ? boundaryLayers.map((bl) => (
              <Source key={bl.tilesUrl} id={`boundaries-${bl.id}`} type="vector" tiles={[bl.tilesUrl]} minzoom={0} maxzoom={16}>
                {bl.interactive ? (
                  <Layer id={`boundaries-${bl.id}-fill`} source-layer="areas" type="fill" filter={boundaryFilter} paint={{ "fill-color": boundaryFill ?? bl.color, "fill-opacity": boundaryFill ? 0.75 : 0.05 }} />
                ) : null}
                <Layer id={`boundaries-${bl.id}-line`} source-layer="areas" type="line" filter={boundaryFilter} paint={{ "line-color": bl.color, "line-width": bl.interactive ? 1.4 : 1, "line-opacity": bl.interactive ? 1 : 0.6 }} />
                {bl.interactive && basketFilter ? (
                  <>
                    <Layer id={`boundaries-${bl.id}-basketfill`} source-layer="areas" type="fill" filter={basketFilter} paint={{ "fill-color": BASKET_COLOR, "fill-opacity": 0.22 }} />
                    <Layer id={`boundaries-${bl.id}-basketline`} source-layer="areas" type="line" filter={basketFilter} paint={{ "line-color": BASKET_COLOR, "line-width": 2.5, "line-dasharray": [2, 1.5] }} />
                  </>
                ) : null}
                {bl.interactive && selectedBoundaryCode ? (
                  <>
                    <Layer id={`boundaries-${bl.id}-selfill`} source-layer="areas" type="fill" filter={["==", ["get", "code"], selectedBoundaryCode]} paint={{ "fill-color": bl.color, "fill-opacity": 0.75 }} />
                    <Layer id={`boundaries-${bl.id}-selline`} source-layer="areas" type="line" filter={["==", ["get", "code"], selectedBoundaryCode]} paint={{ "line-color": bl.color, "line-width": 4 }} />
                  </>
                ) : null}
              </Source>
            ))
          : null}

        {/* points mode — nearby doors (clustered) + the active door / user markers. */}
        {mode === "points" ? (
          <>
            <Source id="stops" type="geojson" data={stopsGeoJson} cluster clusterRadius={40}>
              <Layer id="stops-clusters" type="circle" filter={["has", "point_count"]} paint={{ "circle-color": "#94a3b8", "circle-radius": 16 }} />
              <Layer
                id="stops-circles"
                type="circle"
                filter={["!", ["has", "point_count"]]}
                paint={{
                  "circle-radius": 7,
                  "circle-color": [
                    "match",
                    ["get", "status"],
                    // Addresses mode — door contact status.
                    "VISITED", "#16a34a", "SKIPPED", "#94a3b8",
                    // Polling-places mode — one colour per electoral jurisdiction.
                    "federal", "#dc2626", "nsw", "#0ea5e9", "vic", "#2563eb", "qld", "#7c3aed",
                    "wa", "#d97706", "sa", "#db2777", "tas", "#059669", "act", "#0891b2", "nt", "#ea580c",
                    PRIMARY,
                  ],
                  "circle-stroke-width": 1.5,
                  "circle-stroke-color": "#ffffff",
                }}
              />
            </Source>
            {activeStop ? <Marker latitude={activeStop.lat} longitude={activeStop.lng} color="#dc2626" /> : null}
            {/* Door info popover on the selected address — the id IS the gnafPid in
                addresses mode, so the card fetches its regions + nearest polling. */}
            {stopPopup && activeStop ? (
              <Popup
                latitude={activeStop.lat}
                longitude={activeStop.lng}
                anchor="bottom"
                offset={14}
                closeOnClick={false}
                maxWidth="none"
                onClose={() => onStopTap?.(activeStop.id)}
              >
                <AddressInfoCard
                  gnafPid={activeStop.id}
                  address={activeStop.address}
                  contactId={activeStop.contactId}
                  detailHref={buildDetailHref ? buildDetailHref(activeStop.id) : undefined}
                />
              </Popup>
            ) : null}
            {userPosition ? <Marker latitude={userPosition.lat} longitude={userPosition.lng} color="#0ea5e9" /> : null}
          </>
        ) : null}
        <FullscreenControl position="top-right" />
        <AttributionControl position="bottom-right" compact />
      </Map>

      {/* On-map recentre — snaps back to the campaign boundary (or picked state / country). */}
      <button
        type="button"
        onClick={recenter}
        title="Recentre the map"
        className="absolute bottom-3 right-3 z-10 flex items-center gap-1.5 rounded-lg border border-border bg-surface/95 px-2.5 py-1.5 text-xs font-semibold text-foreground shadow-card backdrop-blur transition hover:bg-surface-variant"
      >
        <Crosshair className="h-3.5 w-3.5" />
        Recentre
      </button>

      {/* Level toggle + search panel (areas mode only): portaled toolbar or on-map
          overlay. Boundaries/points modes render no in-map controls. */}
      {mode !== "areas" ? null : controlsContainer !== undefined ? (
        <>
          {controlsContainer &&
            createPortal(
              <>
                <div className="flex rounded-xl border border-border p-0.5">
                  {LEVELS.map((l) => (
                    <button
                      key={l.id}
                      type="button"
                      onClick={() => selectLevel(l.id)}
                      className={`rounded-lg px-3 py-1.5 text-sm font-semibold transition ${
                        level === l.id ? "bg-primary text-white" : "text-foreground"
                      }`}
                    >
                      {l.label}
                    </button>
                  ))}
                </div>

                {/* Search sits inline with the pills by default; when a
                    searchContainer (the tab-row slot) is supplied it portals
                    there instead, so it lands on the tab row. */}
                {searchContainer == null ? searchCombobox : null}

                {loadingTiles ? (
                  <p className="flex items-center gap-1.5 rounded-lg bg-surface-variant px-2.5 py-1.5 text-[11px] font-medium text-muted-foreground">
                    <Loader2 className="h-3 w-3 animate-spin" />
                    Loading boundaries…
                  </p>
                ) : tooZoomedOut ? (
                  <p className="rounded-lg bg-warning-container px-2.5 py-1.5 text-[11px] font-medium text-warning-foreground">
                    Zoom in to load meshblocks.
                  </p>
                ) : null}
              </>,
              controlsContainer,
            )}
          {controlsContainer && searchContainer ? createPortal(searchCombobox, searchContainer) : null}
        </>
      ) : (
        <div className="absolute right-2 top-2 z-10 w-64 space-y-2">
          <div className="flex overflow-hidden rounded-lg border border-border bg-surface shadow-card">
            {LEVELS.map((l) => (
              <button
                key={l.id}
                type="button"
                onClick={() => selectLevel(l.id)}
                className={`flex-1 px-2 py-1.5 text-xs font-semibold transition ${
                  level === l.id ? "bg-primary text-white" : "text-foreground hover:bg-surface-variant"
                }`}
              >
                {l.label}
              </button>
            ))}
          </div>

          <div className="rounded-lg border border-border bg-surface shadow-card">
            <div className="flex border-b border-border text-[11px] font-bold uppercase tracking-[0.05em]">
              {(["area", "place"] as const).map((m) => (
                <button
                  key={m}
                  type="button"
                  onClick={() => {
                    setSearchMode(m);
                    setHits([]);
                  }}
                  className={`flex-1 px-2 py-1.5 transition ${
                    searchMode === m ? "text-primary" : "text-muted-foreground hover:text-foreground"
                  }`}
                >
                  {m === "area" ? "Areas" : "Places"}
                </button>
              ))}
            </div>
            <div className="flex items-center gap-1.5 px-2 py-1.5">
              <Search className="h-3.5 w-3.5 shrink-0 text-muted-foreground" />
              <input
                value={query}
                onChange={(e) => setQuery(e.target.value)}
                onFocus={() => setAreaOpen(true)}
                onBlur={() => setTimeout(() => setAreaOpen(false), 150)}
                onKeyDown={(e) => e.key === "Enter" && void runSearch()}
                placeholder={searchMode === "area" ? `Search or browse ${level.toUpperCase()}…` : "Suburb, address…"}
                className="w-full bg-transparent text-sm outline-none placeholder:text-muted-foreground"
              />
              {searching ? <Loader2 className="h-3.5 w-3.5 animate-spin text-muted-foreground" /> : null}
              {query ? (
                <button type="button" aria-label="Clear" onClick={() => { setQuery(""); setHits([]); }}>
                  <X className="h-3.5 w-3.5 text-muted-foreground hover:text-foreground" />
                </button>
              ) : null}
            </div>
            {displayList.length > 0 ? (
              <ul className="max-h-64 overflow-auto border-t border-border">
                {displayList.map((h, i) => (
                  <li key={`${h.code ?? h.label}-${i}`}>
                    <button
                      type="button"
                      onMouseDown={(e) => e.preventDefault()}
                      onClick={() => void pickHit(h)}
                      className="flex w-full items-center gap-1.5 px-2 py-1.5 text-left text-xs hover:bg-surface-variant"
                    >
                      <MapPin className="h-3 w-3 shrink-0 text-muted-foreground" />
                      <span className="truncate">{h.label}</span>
                    </button>
                  </li>
                ))}
                {areaListTruncated ? (
                  <li className="px-2 py-1.5 text-[11px] text-muted-foreground">
                    Showing first {AREA_LIST_CAP} — type to search the full {level.toUpperCase()} list.
                  </li>
                ) : null}
              </ul>
            ) : searchMode === "area" && areaOpen && query.trim().length < 2 ? (
              <div className="border-t border-border px-2 py-1.5 text-[11px] text-muted-foreground">
                {tooZoomedOut
                  ? `Zoom in to list ${level.toUpperCase()} areas, or type to search.`
                  : `No ${level.toUpperCase()} areas in view — type to search.`}
              </div>
            ) : null}
          </div>

          {loadingTiles ? (
            <p className="flex items-center gap-1.5 rounded-lg bg-surface px-2.5 py-1.5 text-[11px] font-medium text-muted-foreground shadow-card">
              <Loader2 className="h-3 w-3 animate-spin" />
              Loading boundaries…
            </p>
          ) : tooZoomedOut ? (
            <p className="rounded-lg bg-warning-container px-2.5 py-1.5 text-[11px] font-medium text-warning-foreground shadow-card">
              Zoom in to load meshblocks.
            </p>
          ) : null}
        </div>
      )}
    </div>
  );
}

/**
 * The unified geo-explorer map (Phase 2). Same component as TurfDrawMap — aliased
 * so the persistent geo surface imports `GeoMap` while the campaign turf/boundary
 * pages keep importing `TurfDrawMap` unchanged. Drive its overlay with `mode` +
 * the boundary/point props; `mode="areas"` (default) is the original behaviour.
 */
export const GeoMap = TurfDrawMap;
