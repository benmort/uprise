"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { createPortal } from "react-dom";
import Map, { Layer, Source, useControl, type MapProps, type MapRef } from "react-map-gl/mapbox";
import MapboxDraw from "@mapbox/mapbox-gl-draw";
import { bbox } from "@turf/turf";
import { Loader2, MapPin, Search, X } from "lucide-react";
import { AU_BOUNDS } from "@uprise/field";
import { getArea, listAreas, searchAreas, type AreaHit, type AreaLevel } from "@/lib/api/geo";
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

const LEVELS: Array<{ id: AreaLevel; label: string; minZoom: number }> = [
  { id: "sa4", label: "SA4", minZoom: 5 },
  { id: "sa3", label: "SA3", minZoom: 7 },
  { id: "sa2", label: "SA2", minZoom: 9 },
  { id: "sa1", label: "SA1", minZoom: 11 },
  { id: "mb", label: "Meshblock", minZoom: 13 },
];

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
  const debounce = useRef<ReturnType<typeof setTimeout> | null>(null);

  // Controlled-or-internal: read the prop when supplied, else own state; the
  // setter delegates to the callback when controlled. Keeps the two uncontrolled
  // consumers (campaign turf + boundary pages) working unchanged.
  const [levelInternal, setLevelInternal] = useState<AreaLevel>("sa2");
  const level = levelProp ?? levelInternal;
  const setLevel = useCallback(
    (l: AreaLevel) => (onLevelChange ? onLevelChange(l) : setLevelInternal(l)),
    [onLevelChange],
  );
  const [areas, setAreas] = useState<GeoJSON.FeatureCollection | null>(null);
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

  const minZoom = useMemo(() => LEVELS.find((l) => l.id === level)?.minZoom ?? 9, [level]);

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

  const refreshAreas = useCallback(
    async (lvl: AreaLevel) => {
      const map = mapRef.current?.getMap();
      if (!map) return;
      const zoom = map.getZoom();
      const min = LEVELS.find((l) => l.id === lvl)?.minZoom ?? 9;
      if (zoom < min) {
        setTooZoomedOut(true);
        setAreas(null);
        return;
      }
      setTooZoomedOut(false);
      const b = map.getBounds();
      if (!b) return;
      const res = await listAreas({
        layer: lvl,
        bbox: [b.getWest(), b.getSouth(), b.getEast(), b.getNorth()],
        limit: 1500,
      });
      if (res.ok) setAreas(res.data as GeoJSON.FeatureCollection);
    },
    [],
  );

  const scheduleRefresh = useCallback(
    (lvl: AreaLevel) => {
      if (debounce.current) clearTimeout(debounce.current);
      debounce.current = setTimeout(() => void refreshAreas(lvl), 250);
    },
    [refreshAreas],
  );

  // Refresh when the (possibly external/URL-driven) level changes. On mount the
  // map isn't ready so refreshAreas bails — onLoad does the first load.
  useEffect(() => {
    void refreshAreas(level);
  }, [level, refreshAreas]);

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
  const viewportAreas = useMemo(() => {
    const feats = (areas?.features ?? []) as Array<GeoJSON.Feature>;
    const seen = new Set<string>();
    const opts: Array<{ label: string; code?: string; lat: number; lng: number }> = [];
    for (const f of feats) {
      const p = f.properties as { code?: string; name?: string } | null;
      if (!p?.code || seen.has(p.code)) continue;
      seen.add(p.code);
      opts.push({ label: `${p.name ?? p.code} · ${p.code}`, code: p.code, lat: 0, lng: 0 });
    }
    opts.sort((a, b) => a.label.localeCompare(b.label));
    return opts;
  }, [areas]);

  const areaOptions = query.trim().length >= 2 ? hits : viewportAreas;
  const areaListTruncated = query.trim().length < 2 && viewportAreas.length > AREA_LIST_CAP;
  const displayList = searchMode === "area" ? (areaOpen ? areaOptions.slice(0, AREA_LIST_CAP) : []) : hits;

  // Surface the in-view areas (+ zoomed-out flag) so a consumer can render a
  // divisions-style sidebar list. onViewportAreasChange must be stable (parent
  // useCallback) or this re-fires each render.
  const viewportAreaHits = useMemo<AreaHit[]>(() => {
    const feats = (areas?.features ?? []) as Array<GeoJSON.Feature>;
    const seen = new Set<string>();
    const out: AreaHit[] = [];
    for (const f of feats) {
      const p = f.properties as { code?: string; name?: string } | null;
      if (!p?.code || seen.has(p.code)) continue;
      seen.add(p.code);
      out.push({ level, code: p.code, name: p.name ?? p.code });
    }
    out.sort((a, b) => a.name.localeCompare(b.name));
    return out;
  }, [areas, level]);

  useEffect(() => {
    onViewportAreasChange?.(viewportAreaHits, tooZoomedOut);
  }, [viewportAreaHits, tooZoomedOut, onViewportAreasChange]);

  const selectLevel = (id: AreaLevel) => {
    // Keep the search term across a level switch (it maps to the shared ?q= when
    // controlled); the refresh runs via the [level] effect below.
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
        onLoad={() => void refreshAreas(level)}
        onMoveEnd={() => scheduleRefresh(level)}
        onClick={(e) => {
          const f = e.features?.[0];
          if (!f || !onToggleArea) return;
          const p = f.properties as { code?: string; name?: string; level?: AreaLevel } | null;
          if (!p?.code) return;
          onToggleArea({ level, code: String(p.code), name: String(p.name ?? p.code), geometry: f.geometry as GeoJSON.Geometry });
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

        {/* Selectable statistical areas for the active level. */}
        {areas && (
          <Source id="areas" type="geojson" data={areas} promoteId="code">
            <Layer id="areas-fill" type="fill" paint={{ "fill-color": "#2563eb", "fill-opacity": 0.04 }} />
            <Layer id="areas-line" type="line" paint={{ "line-color": "#64748b", "line-width": 0.8 }} />
          </Source>
        )}

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

                {tooZoomedOut ? (
                  <p className="rounded-lg bg-warning-container px-2.5 py-1.5 text-[11px] font-medium text-warning-foreground">
                    Zoom in to load {level.toUpperCase()} boundaries.
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

          {tooZoomedOut ? (
            <p className="rounded-lg bg-warning-container px-2.5 py-1.5 text-[11px] font-medium text-warning-foreground shadow-card">
              Zoom in to load {level.toUpperCase()} boundaries.
            </p>
          ) : null}
        </div>
      )}
    </div>
  );
}
