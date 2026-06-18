"use client";

import { useMemo, useRef } from "react";
import Map, { Layer, Source, useControl, type MapProps } from "react-map-gl/mapbox";
import MapboxDraw from "@mapbox/mapbox-gl-draw";
import "mapbox-gl/dist/mapbox-gl.css";
import "@mapbox/mapbox-gl-draw/dist/mapbox-gl-draw.css";

const TOKEN = process.env.NEXT_PUBLIC_MAPBOX_TOKEN ?? "";

export type ExistingTurf = {
  id: string;
  name: string;
  geometry: GeoJSON.Geometry | null;
  color: string;
};

type MapEvents = { on: (e: string, cb: () => void) => void; off: (e: string, cb: () => void) => void };

/** Polygon draw tool. Emits the first drawn polygon's geometry (or null) on every edit. */
function DrawControl({ onChange }: { onChange: (geometry: GeoJSON.Polygon | null) => void }) {
  const drawRef = useRef<MapboxDraw | null>(null);

  useControl<MapboxDraw>(
    () => {
      const draw = new MapboxDraw({
        displayControlsDefault: false,
        controls: { polygon: true, trash: true },
      });
      drawRef.current = draw;
      return draw;
    },
    ({ map }: { map: MapEvents }) => {
      const emit = () => {
        const fc = drawRef.current?.getAll();
        const poly = fc?.features.find((f) => f.geometry?.type === "Polygon");
        onChange((poly?.geometry as GeoJSON.Polygon) ?? null);
      };
      map.on("draw.create", emit);
      map.on("draw.update", emit);
      map.on("draw.delete", emit);
    },
    () => {},
    { position: "top-left" },
  );

  return null;
}

export function TurfDrawMap({
  existing = [],
  center,
  onPolygonChange,
}: {
  existing?: ExistingTurf[];
  center?: { lat: number; lng: number } | null;
  onPolygonChange: (geometry: GeoJSON.Polygon | null) => void;
}) {
  const initialViewState = useMemo<MapProps["initialViewState"]>(
    () => ({
      latitude: center?.lat ?? -33.8688,
      longitude: center?.lng ?? 151.2093,
      zoom: 13,
    }),
    [center],
  );

  if (!TOKEN) {
    return (
      <div className="flex h-full items-center justify-center rounded-xl bg-surface-variant p-6 text-center text-sm text-muted-foreground">
        Set <code className="mx-1">NEXT_PUBLIC_MAPBOX_TOKEN</code> to draw turf on the map.
      </div>
    );
  }

  return (
    <Map
      mapboxAccessToken={TOKEN}
      initialViewState={initialViewState}
      mapStyle="mapbox://styles/mapbox/streets-v12"
      style={{ width: "100%", height: "100%" }}
    >
      <DrawControl onChange={onPolygonChange} />
      {existing.map((t) =>
        t.geometry ? (
          <Source
            key={t.id}
            id={`turf-${t.id}`}
            type="geojson"
            data={{ type: "Feature", geometry: t.geometry, properties: {} }}
          >
            <Layer
              id={`turf-fill-${t.id}`}
              type="fill"
              paint={{ "fill-color": t.color, "fill-opacity": 0.14 }}
            />
            <Layer
              id={`turf-line-${t.id}`}
              type="line"
              paint={{ "line-color": t.color, "line-width": 2 }}
            />
          </Source>
        ) : null,
      )}
    </Map>
  );
}
