"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { createPortal } from "react-dom";
import Map, { Layer, Source, useControl, type MapProps, type MapRef } from "react-map-gl/mapbox";
import MapboxDraw from "@mapbox/mapbox-gl-draw";
import { bbox } from "@turf/turf";
import { Loader2, MapPin, Search, X } from "lucide-react";
import { AU_BOUNDS } from "@uprise/field";
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
}: {
  existing?: ExistingTurf[];
  center?: { lat: number; lng: number } | null;
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

  const initialViewState = useMemo<MapProps["initialViewState"]>(
    () =>
      center
        ? { latitude: center.lat, longitude: center.lng, zoom: 11 }
        : {
            // No focus yet → open on the whole country, not a hardcoded city.
            bounds: [[AU_BOUNDS[0], AU_BOUNDS[1]], [AU_BOUNDS[2], AU_BOUNDS[3]]],
            fitBoundsOptions: { padding: 32 },
          },
    [center],
  );

  // Vector-tile boundary source for the active level. mapbox requests only the
  // tiles visible at the current zoom, so this is what makes boundaries fast at any
  // zoom (no per-viewport GeoJSON, no zoom gate). Keyed by level so switching pills
  // swaps the source cleanly. Same-origin session cookie is attached via the map's
  // transformRequest below.
  const tileUrl = `${getApiUrl()}/geo/tiles/${level}/{z}/{x}/{y}`;

  // Send the parent-domain session cookie on our own tile requests (the API is
  // ORGANISER-gated); leave mapbox's own style/sprite/tile requests untouched.
  const apiBase = getApiUrl();
  const transformRequest = useCallback(
    (url: string, resourceType?: string) =>
      resourceType === "Tile" && apiBase && url.startsWith(apiBase)
        ? { url, credentials: "include" as const }
        : { url },
    [apiBase],
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
        interactiveLayerIds={["areas-fill"]}
        transformRequest={transformRequest}
        onLoad={() => {
          setMapLoaded(true);
          syncViewport();
        }}
        onMoveEnd={() => syncViewport()}
        onClick={(e) => {
          const f = e.features?.[0];
          if (!f || !onToggleArea) return;
          const p = f.properties as { code?: string; name?: string } | null;
          if (!p?.code) return;
          // Tile geometry is clipped to the tile; fetch the true boundary for the
          // highlight + union (same as picking a search/sidebar result).
          const code = String(p.code);
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

        {/* Already-claimed turf (any campaign) — amber dashed warning. */}
        {existing.map((t) =>
          t.geometry ? (
            <Source key={t.id} id={`claimed-${t.id}`} type="geojson" data={{ type: "Feature", geometry: t.geometry, properties: {} }}>
              <Layer id={`claimed-fill-${t.id}`} type="fill" paint={{ "fill-color": "#b45309", "fill-opacity": 0.1 }} />
              <Layer id={`claimed-line-${t.id}`} type="line" paint={{ "line-color": "#b45309", "line-width": 1.5, "line-dasharray": [2, 2] }} />
            </Source>
          ) : null,
        )}

        {/* Selectable statistical areas for the active level, as on-demand vector
            tiles. Keyed by level so the source is recreated cleanly on a pill switch. */}
        <Source
          key={level}
          id="areas"
          type="vector"
          tiles={[tileUrl]}
          minzoom={sourceMinZoom(level)}
          maxzoom={TILE_MAX_ZOOM}
        >
          <Layer id="areas-fill" source-layer="areas" type="fill" paint={{ "fill-color": "#2563eb", "fill-opacity": 0.04 }} />
          <Layer id="areas-line" source-layer="areas" type="line" paint={{ "line-color": "#64748b", "line-width": 0.8 }} />
        </Source>

        {/* Selected areas — bold highlight on top. */}
        <Source id="selected" type="geojson" data={selectedFc}>
          <Layer id="selected-fill" type="fill" paint={{ "fill-color": "#2563eb", "fill-opacity": 0.32 }} />
          <Layer id="selected-line" type="line" paint={{ "line-color": "#1d4ed8", "line-width": 2.5 }} />
        </Source>
      </Map>

      {/* Level toggle + search panel: portaled toolbar or on-map overlay. */}
      {controlsContainer !== undefined ? (
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
