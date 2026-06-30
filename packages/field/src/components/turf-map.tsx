"use client";

import { useCallback, useEffect, useMemo, useRef } from "react";
import Map, { Layer, Marker, Source, type MapProps, type MapRef } from "react-map-gl/mapbox";
import { bbox } from "@turf/turf";
import { Crosshair } from "lucide-react";
import { useTheme } from "../lib/use-theme";
import "mapbox-gl/dist/mapbox-gl.css";

export type MapStop = { id: string; lat: number; lng: number; status?: string };
export type LngLat = { lat: number; lng: number };

const TOKEN = process.env.NEXT_PUBLIC_MAPBOX_TOKEN ?? "";
// Brand primary (= --primary / brand-500), mirrored here because Mapbox paint
// props need a literal hex and can't read the CSS token. Matches the admin blue.
const PRIMARY = "#465fff";

/**
 * Volunteer/organiser map. `mode="view"` renders walk stops (clustered) + the
 * volunteer position; `mode="edit"` shows the turf polygon for organisers.
 * Loaded via next/dynamic({ ssr:false }) by callers — mapbox-gl touches window
 * and must stay out of the list-mode bundle.
 */
export function TurfMap({
  mode,
  stops = [],
  turfGeometry,
  activeStopId,
  userPosition,
  onStopTap,
  routeGeometry,
}: {
  mode: "view" | "edit";
  stops?: MapStop[];
  turfGeometry?: GeoJSON.Geometry | null;
  activeStopId?: string;
  userPosition?: LngLat | null;
  onStopTap?: (id: string) => void;
  /** Walking route line (user → next stop) from the Mapbox Directions API. */
  routeGeometry?: GeoJSON.LineString | null;
}) {
  const { theme } = useTheme();
  const mapRef = useRef<MapRef | null>(null);

  // Bounding box of the turf/division polygon, if one is supplied.
  const bounds = useMemo<[number, number, number, number] | null>(() => {
    if (!turfGeometry) return null;
    try {
      const [minX, minY, maxX, maxY] = bbox({ type: "Feature", geometry: turfGeometry, properties: {} });
      if ([minX, minY, maxX, maxY].some((n) => !Number.isFinite(n))) return null;
      return [minX, minY, maxX, maxY];
    } catch {
      return null;
    }
  }, [turfGeometry]);

  const initialViewState = useMemo<MapProps["initialViewState"]>(() => {
    if (bounds) {
      return { bounds: [[bounds[0], bounds[1]], [bounds[2], bounds[3]]], fitBoundsOptions: { padding: 32 } };
    }
    const focus = userPosition ?? stops[0];
    return {
      latitude: focus?.lat ?? -33.8688,
      longitude: focus?.lng ?? 151.2093,
      zoom: 14,
    };
  }, [bounds, stops, userPosition]);

  // initialViewState only applies on mount; refit when the division changes
  // without a remount (e.g. navigating between division detail pages).
  const fitToBounds = useCallback(() => {
    if (!bounds) return;
    mapRef.current?.fitBounds([[bounds[0], bounds[1]], [bounds[2], bounds[3]]], {
      padding: 32,
      duration: 600,
    });
  }, [bounds]);

  useEffect(() => {
    fitToBounds();
  }, [fitToBounds]);

  const stopsGeoJson = useMemo(
    () => ({
      type: "FeatureCollection" as const,
      features: stops
        .filter((s) => s.id !== activeStopId)
        .map((s) => ({
          type: "Feature" as const,
          geometry: { type: "Point" as const, coordinates: [s.lng, s.lat] },
          properties: { id: s.id, status: s.status ?? "PENDING" },
        })),
    }),
    [stops, activeStopId],
  );

  const active = stops.find((s) => s.id === activeStopId);

  if (!TOKEN) {
    return (
      <div className="flex h-full items-center justify-center rounded-lg bg-surface-variant p-6 text-center text-sm text-muted-foreground">
        Set NEXT_PUBLIC_MAPBOX_TOKEN to enable the map. List mode works offline without it.
      </div>
    );
  }

  return (
    <Map
      ref={mapRef}
      mapboxAccessToken={TOKEN}
      initialViewState={initialViewState}
      mapStyle={theme === "dark" ? "mapbox://styles/mapbox/dark-v11" : "mapbox://styles/mapbox/streets-v12"}
      style={{ width: "100%", height: "100%" }}
      onLoad={fitToBounds}
      onClick={(e) => {
        const feature = e.features?.[0];
        const id = feature?.properties?.id;
        if (id && onStopTap) onStopTap(String(id));
      }}
      interactiveLayerIds={["stops-circles"]}
    >
      {turfGeometry && (
        <Source id="turf" type="geojson" data={{ type: "Feature", geometry: turfGeometry, properties: {} }}>
          <Layer
            id="turf-fill"
            type="fill"
            paint={{ "fill-color": PRIMARY, "fill-opacity": 0.12 }}
          />
          <Layer id="turf-line" type="line" paint={{ "line-color": PRIMARY, "line-width": 2 }} />
        </Source>
      )}

      {mode === "view" && (
        <Source id="stops" type="geojson" data={stopsGeoJson} cluster clusterRadius={40}>
          <Layer
            id="stops-clusters"
            type="circle"
            filter={["has", "point_count"]}
            paint={{ "circle-color": "#94a3b8", "circle-radius": 16 }}
          />
          <Layer
            id="stops-circles"
            type="circle"
            filter={["!", ["has", "point_count"]]}
            paint={{
              "circle-radius": 7,
              "circle-color": [
                "match",
                ["get", "status"],
                "VISITED",
                "#16a34a",
                "SKIPPED",
                "#94a3b8",
                PRIMARY,
              ],
              "circle-stroke-width": 1.5,
              "circle-stroke-color": "#ffffff",
            }}
          />
        </Source>
      )}

      {routeGeometry && (
        <Source id="walk-route" type="geojson" data={{ type: "Feature", geometry: routeGeometry, properties: {} }}>
          <Layer
            id="walk-route-line"
            type="line"
            layout={{ "line-cap": "round", "line-join": "round" }}
            paint={{ "line-color": PRIMARY, "line-width": 4, "line-opacity": 0.85, "line-dasharray": [1, 1.6] }}
          />
        </Source>
      )}

      {active && (
        <Marker latitude={active.lat} longitude={active.lng} color="#dc2626" />
      )}
      {userPosition && (
        <Marker latitude={userPosition.lat} longitude={userPosition.lng} color="#0ea5e9" />
      )}

      {/* Snap the viewport back to the boundary after panning/zooming away. */}
      {bounds && (
        <button
          type="button"
          onClick={fitToBounds}
          title="Snap back to the division bounds"
          className="absolute right-2 top-2 z-10 flex items-center gap-1.5 rounded-lg border border-border bg-surface/95 px-2.5 py-1.5 text-xs font-semibold text-foreground shadow-card backdrop-blur hover:bg-surface-variant"
        >
          <Crosshair className="h-3.5 w-3.5" />
          Recenter
        </button>
      )}
    </Map>
  );
}
