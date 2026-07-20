"use client";

import { useCallback, useEffect, useMemo, useRef } from "react";
import { useRouter } from "next/navigation";
import MapGL, { FullscreenControl, Layer, Source, type MapRef } from "react-map-gl/mapbox";
import bbox from "@turf/bbox";
import { LocateFixed } from "lucide-react";
import { installMoonlitDark, MapGestureToggle, useScrollToZoom } from "@uprise/field";
import "mapbox-gl/dist/mapbox-gl.css";
import { useTheme } from "@/components/theme/theme-provider";

const TOKEN = process.env.NEXT_PUBLIC_MAPBOX_TOKEN ?? "";
const mapStyleFor = (theme: string) =>
  theme === "dark" ? "mapbox://styles/mapbox/dark-v11" : "mapbox://styles/mapbox/streets-v12";
// National fallback frame when nothing has a computable bbox.
const AU_BOUNDS: [number, number, number, number] = [112.9, -43.7, 153.6, -10.7];

// Distinct, high-contrast campaign colours, cycled by index. Literal hexes (mapbox paint can't
// read CSS tokens). Exported so the campaigns list can show a matching swatch per campaign.
export const CAMPAIGN_COLORS = [
  "#465fff", "#16a34a", "#db2777", "#d97706", "#7c3aed",
  "#0891b2", "#dc2626", "#0ea5e9", "#ca8a04", "#059669",
];

export type CampaignShape = { id: string; name: string; color: string; geometries: GeoJSON.Geometry[] };

/**
 * A shared overview map of EVERY campaign's claimed turf, one colour per campaign, framed to the
 * combined extent. Clicking a turf opens that campaign. A read-only sibling of CampaignBoundaryMap
 * (which shows one campaign) — same moonlit/scroll-to-zoom setup. Renders an empty state when no
 * campaign has turf yet.
 */
export function CampaignsMap({ campaigns, height = 340 }: { campaigns: CampaignShape[]; height?: number }) {
  const { theme } = useTheme();
  const router = useRouter();
  const mapRef = useRef<MapRef | null>(null);
  const loadedRef = useRef(false);
  const themeRef = useRef(theme);
  themeRef.current = theme;
  const [scrollZoom] = useScrollToZoom();

  // One FeatureCollection tagged with each feature's campaign; the fill/line colour is data-driven
  // off `color`, so a single source/layer pair draws every campaign in its own colour.
  const fc = useMemo<GeoJSON.FeatureCollection>(
    () => ({
      type: "FeatureCollection",
      features: campaigns.flatMap((c) =>
        c.geometries
          .filter((g): g is GeoJSON.Geometry => Boolean(g))
          .map((g) => ({ type: "Feature" as const, geometry: g, properties: { campaignId: c.id, name: c.name, color: c.color } })),
      ),
    }),
    [campaigns],
  );

  const bounds = useMemo<[number, number, number, number]>(() => {
    if (!fc.features.length) return AU_BOUNDS;
    try {
      const b = bbox(fc);
      return [b[0], b[1], b[2], b[3]].every(Number.isFinite) ? [b[0], b[1], b[2], b[3]] : AU_BOUNDS;
    } catch {
      return AU_BOUNDS;
    }
  }, [fc]);

  const recenter = useCallback(
    (duration: number) => {
      const map = mapRef.current?.getMap();
      if (!map) return;
      map.resize();
      map.fitBounds([[bounds[0], bounds[1]], [bounds[2], bounds[3]]], { padding: 36, duration });
    },
    [bounds],
  );

  // Re-fit when the campaign set changes (the map instance persists, so onLoad won't fire again).
  useEffect(() => {
    if (!loadedRef.current) return;
    const raf = requestAnimationFrame(() => recenter(400));
    return () => cancelAnimationFrame(raf);
  }, [recenter]);

  const legend = campaigns.filter((c) => c.geometries.some(Boolean));

  if (!TOKEN) {
    return (
      <div
        className="flex items-center justify-center rounded-2xl border border-border bg-surface-variant p-6 text-center text-sm text-muted-foreground"
        style={{ height }}
      >
        Set <code className="mx-1">NEXT_PUBLIC_MAPBOX_TOKEN</code> to show the campaigns map.
      </div>
    );
  }
  if (!fc.features.length) {
    return (
      <div
        className="flex items-center justify-center rounded-2xl border border-dashed border-border p-6 text-center text-sm text-muted-foreground"
        style={{ height }}
      >
        No turf cut across any campaign yet — cut turf to see it on the shared map.
      </div>
    );
  }

  return (
    <div className="relative overflow-hidden rounded-2xl border border-border" style={{ height }}>
      <MapGL
        ref={mapRef}
        mapboxAccessToken={TOKEN}
        initialViewState={{ bounds, fitBoundsOptions: { padding: 36 } }}
        mapStyle={mapStyleFor(theme)}
        style={{ width: "100%", height: "100%" }}
        // ⌘/Ctrl + scroll to zoom by default, unless "Scroll to zoom" is ticked.
        cooperativeGestures={!scrollZoom}
        attributionControl={false}
        interactiveLayerIds={["campaigns-fill"]}
        onLoad={() => {
          loadedRef.current = true;
          const map = mapRef.current?.getMap();
          if (map) installMoonlitDark(map, () => themeRef.current);
          recenter(0);
        }}
        onClick={(e) => {
          const id = e.features?.[0]?.properties?.campaignId;
          if (id) router.push(`/canvass/${encodeURIComponent(String(id))}/turf`);
        }}
        onMouseEnter={() => {
          const c = mapRef.current?.getMap()?.getCanvas();
          if (c) c.style.cursor = "pointer";
        }}
        onMouseLeave={() => {
          const c = mapRef.current?.getMap()?.getCanvas();
          if (c) c.style.cursor = "";
        }}
      >
        <Source id="campaigns" type="geojson" data={fc}>
          <Layer id="campaigns-fill" type="fill" paint={{ "fill-color": ["get", "color"], "fill-opacity": 0.22 }} />
          <Layer
            id="campaigns-line"
            type="line"
            paint={{ "line-color": ["get", "color"], "line-width": 1.75, "line-opacity": 0.95 }}
          />
        </Source>
        <FullscreenControl position="top-left" />
        <MapGestureToggle />
      </MapGL>

      {/* Per-campaign colour legend (click a turf to open that campaign). */}
      <div className="pointer-events-none absolute bottom-2 left-2 flex max-h-[65%] flex-col gap-1 overflow-auto rounded-lg bg-surface/95 px-2.5 py-1.5 text-[11px] font-medium text-foreground shadow-card">
        {legend.map((c) => (
          <span key={c.id} className="flex items-center gap-1.5">
            <span
              className="h-2.5 w-3.5 shrink-0 rounded-[3px] border"
              style={{ backgroundColor: `${c.color}38`, borderColor: c.color }}
            />
            <span className="max-w-[180px] truncate">{c.name}</span>
          </span>
        ))}
      </div>

      <button
        type="button"
        onClick={() => recenter(500)}
        title="Recentre on all campaigns"
        aria-label="Recentre on all campaigns"
        className="absolute right-2 top-2 inline-flex items-center gap-1 rounded-lg bg-surface/95 px-2 py-1 text-xs font-medium text-foreground shadow-card hover:bg-surface"
      >
        <LocateFixed className="h-3.5 w-3.5" />
        Recentre
      </button>
    </div>
  );
}
