"use client";

import { useCallback, useEffect, useMemo, useRef } from "react";
import MapGL, { FullscreenControl, Layer, Source, type MapRef } from "react-map-gl/mapbox";
import { bbox } from "@turf/turf";
import { LocateFixed } from "lucide-react";
import "mapbox-gl/dist/mapbox-gl.css";
import { useTheme } from "@/components/theme/theme-provider";

const TOKEN = process.env.NEXT_PUBLIC_MAPBOX_TOKEN ?? "";
const mapStyleFor = (theme: string) =>
  theme === "dark" ? "mapbox://styles/mapbox/dark-v11" : "mapbox://styles/mapbox/streets-v12";
// Brand primary for the boundary overlay (mapbox paint needs a literal hex — same as the
// turf-draw map's boundary shading, so the overview and the cut-turf screen match).
const PRIMARY = "#465fff";
// Fallback frame if a boundary somehow has no computable bbox — Australia-wide.
const AU_BOUNDS: [number, number, number, number] = [112.9, -43.7, 153.6, -10.7];

/**
 * Read-only map of a campaign's saved boundary: shades the polygon and frames the map on it,
 * with a recentre button after the user pans/zooms away. A light sibling of {@link TurfDrawMap}
 * (no draw tools, no area selection) for the campaign overview. Renders nothing without a
 * boundary — the caller gates on `hasBoundary`.
 */
export function CampaignBoundaryMap({
  boundary,
  height = 260,
}: {
  boundary: GeoJSON.Geometry | null;
  height?: number;
}) {
  const { theme } = useTheme();
  const mapRef = useRef<MapRef | null>(null);
  const loadedRef = useRef(false);

  const feature = useMemo<GeoJSON.Feature | null>(
    () => (boundary ? { type: "Feature", geometry: boundary, properties: {} } : null),
    [boundary],
  );

  // The boundary's extent — the map fits to this on load and on recentre.
  const bounds = useMemo<[number, number, number, number]>(() => {
    if (!feature) return AU_BOUNDS;
    try {
      const b = bbox(feature);
      return [b[0], b[1], b[2], b[3]];
    } catch {
      return AU_BOUNDS;
    }
  }, [feature]);

  const recenter = useCallback(
    (duration: number) => {
      const map = mapRef.current?.getMap();
      if (!map) return;
      map.resize();
      map.fitBounds(
        [
          [bounds[0], bounds[1]],
          [bounds[2], bounds[3]],
        ],
        { padding: 28, duration },
      );
    },
    [bounds],
  );

  // After the first load, re-fit whenever the boundary changes — e.g. switching campaigns. The map
  // instance persists across prop changes (the component doesn't remount), so onLoad won't fire
  // again; `recenter`'s identity changes with `bounds`, so this runs on each new boundary.
  useEffect(() => {
    if (!loadedRef.current) return;
    recenter(500);
  }, [recenter]);

  if (!feature) return null;

  return (
    <div className="relative overflow-hidden rounded-2xl border border-border" style={{ height }}>
      <MapGL
        ref={mapRef}
        mapboxAccessToken={TOKEN}
        initialViewState={{ bounds, fitBoundsOptions: { padding: 28 } }}
        mapStyle={mapStyleFor(theme)}
        style={{ width: "100%", height: "100%" }}
        onLoad={() => {
          loadedRef.current = true;
          recenter(0);
        }}
      >
        <Source id="campaign-boundary" type="geojson" data={feature}>
          <Layer id="campaign-boundary-fill" type="fill" paint={{ "fill-color": PRIMARY, "fill-opacity": 0.12 }} />
          <Layer
            id="campaign-boundary-line"
            type="line"
            paint={{ "line-color": PRIMARY, "line-width": 2, "line-opacity": 0.9 }}
          />
        </Source>
        <FullscreenControl position="top-left" />
      </MapGL>

      <button
        type="button"
        onClick={() => recenter(500)}
        title="Recentre on boundary"
        aria-label="Recentre on boundary"
        className="absolute right-2 top-2 inline-flex items-center gap-1 rounded-lg bg-surface/95 px-2 py-1 text-xs font-medium text-foreground shadow-card hover:bg-surface"
      >
        <LocateFixed className="h-3.5 w-3.5" />
        Recentre
      </button>
    </div>
  );
}
