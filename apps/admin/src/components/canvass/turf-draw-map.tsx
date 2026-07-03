"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import Map, { Layer, Source, useControl, type MapProps, type MapRef } from "react-map-gl/mapbox";
import MapboxDraw from "@mapbox/mapbox-gl-draw";
import { bbox } from "@turf/turf";
import { Loader2, MapPin, Search, X } from "lucide-react";
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
}: {
  existing?: ExistingTurf[];
  center?: { lat: number; lng: number } | null;
  selectedAreas?: SelectedArea[];
  onToggleArea?: (area: SelectedArea) => void;
  onPolygonsChange: (polygons: GeoJSON.Polygon[]) => void;
  clearToken?: number;
}) {
  const { theme } = useTheme();
  const mapRef = useRef<MapRef | null>(null);
  const debounce = useRef<ReturnType<typeof setTimeout> | null>(null);

  const [level, setLevel] = useState<AreaLevel>("sa2");
  const [areas, setAreas] = useState<GeoJSON.FeatureCollection | null>(null);
  const [tooZoomedOut, setTooZoomedOut] = useState(false);
  const [searchMode, setSearchMode] = useState<"place" | "area">("area");
  const [query, setQuery] = useState("");
  const [hits, setHits] = useState<Array<{ label: string; code?: string; lat: number; lng: number; bbox?: [number, number, number, number] }>>([]);
  const [searching, setSearching] = useState(false);
  const [areaOpen, setAreaOpen] = useState(false);

  const minZoom = useMemo(() => LEVELS.find((l) => l.id === level)?.minZoom ?? 9, [level]);

  const initialViewState = useMemo<MapProps["initialViewState"]>(
    () => ({ latitude: center?.lat ?? -33.8688, longitude: center?.lng ?? 151.2093, zoom: 11 }),
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

  if (!TOKEN) {
    return (
      <div className="flex h-full items-center justify-center rounded-xl bg-surface-variant p-6 text-center text-sm text-muted-foreground">
        Set <code className="mx-1">NEXT_PUBLIC_MAPBOX_TOKEN</code> to draw turf on the map.
      </div>
    );
  }

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

      {/* Level toggle + search panel. */}
      <div className="absolute right-2 top-2 z-10 w-64 space-y-2">
        <div className="flex overflow-hidden rounded-lg border border-border bg-surface shadow-card">
          {LEVELS.map((l) => (
            <button
              key={l.id}
              type="button"
              onClick={() => {
                setLevel(l.id);
                setQuery("");
                setHits([]);
                void refreshAreas(l.id);
              }}
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
    </div>
  );
}
