"use client";

import { useMemo } from "react";
import Map, { Layer, Marker, Source, type MapProps } from "react-map-gl/mapbox";
import "mapbox-gl/dist/mapbox-gl.css";

export type MapStop = { id: string; lat: number; lng: number; status?: string };
export type LngLat = { lat: number; lng: number };

const TOKEN = process.env.NEXT_PUBLIC_MAPBOX_TOKEN ?? "";

/**
 * Canvasser/organiser map. `mode="view"` renders walk stops (clustered) + the
 * canvasser position; `mode="edit"` shows the turf polygon for organisers.
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
}: {
  mode: "view" | "edit";
  stops?: MapStop[];
  turfGeometry?: GeoJSON.Geometry | null;
  activeStopId?: string;
  userPosition?: LngLat | null;
  onStopTap?: (id: string) => void;
}) {
  const initialViewState = useMemo<MapProps["initialViewState"]>(() => {
    const focus = userPosition ?? stops[0];
    return {
      latitude: focus?.lat ?? -33.8688,
      longitude: focus?.lng ?? 151.2093,
      zoom: 14,
    };
  }, [stops, userPosition]);

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
      mapboxAccessToken={TOKEN}
      initialViewState={initialViewState}
      mapStyle="mapbox://styles/mapbox/streets-v12"
      style={{ width: "100%", height: "100%" }}
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
            paint={{ "fill-color": "#2563eb", "fill-opacity": 0.12 }}
          />
          <Layer id="turf-line" type="line" paint={{ "line-color": "#2563eb", "line-width": 2 }} />
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
                "#2563eb",
              ],
              "circle-stroke-width": 1.5,
              "circle-stroke-color": "#ffffff",
            }}
          />
        </Source>
      )}

      {active && (
        <Marker latitude={active.lat} longitude={active.lng} color="#dc2626" />
      )}
      {userPosition && (
        <Marker latitude={userPosition.lat} longitude={userPosition.lng} color="#0ea5e9" />
      )}
    </Map>
  );
}
