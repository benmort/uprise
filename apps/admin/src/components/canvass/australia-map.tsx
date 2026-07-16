"use client";

// Read-only Australia overview map for the areas List view (shown before a search).
// Frames the whole country, and fits to the selected state's bounds when one is picked.
// It's an orientation aid, not the turf-cut map — that's the Map view (TurfDrawMap).
import { useEffect, useRef, useState } from "react";
import Map, { type MapRef } from "react-map-gl/mapbox";
import { useTheme } from "@/components/theme/theme-provider";
import "mapbox-gl/dist/mapbox-gl.css";

const TOKEN = process.env.NEXT_PUBLIC_MAPBOX_TOKEN ?? "";

type Bounds = [[number, number], [number, number]]; // [[west, south], [east, north]]

// Whole-country initial framing (pre-load, so there's no flash before fitBounds).
const AUSTRALIA_VIEW = { longitude: 134.0, latitude: -28.2, zoom: 3.2 };
const AUSTRALIA_BOUNDS: Bounds = [
  [112.9, -43.7],
  [153.7, -10.4],
];

// Per-state bounding boxes, keyed by the ASGS state digit (1=NSW … 8=ACT). Framed
// with fitBounds so a selected state fills the viewport regardless of its shape/size.
const STATE_BOUNDS: Record<string, Bounds> = {
  "1": [[141.0, -37.51], [153.55, -28.16]], // NSW
  "2": [[140.96, -39.14], [149.98, -33.98]], // VIC
  "3": [[138.0, -29.18], [153.55, -10.5]], // QLD
  "4": [[129.0, -38.06], [141.0, -25.99]], // SA
  "5": [[112.92, -35.2], [129.0, -13.69]], // WA
  "6": [[143.8, -43.65], [148.52, -39.5]], // TAS
  "7": [[129.0, -26.0], [138.0, -10.9]], // NT
  "8": [[148.76, -35.95], [149.4, -35.1]], // ACT
};

export function AustraliaMap({ focusState }: { focusState?: string }) {
  const { theme } = useTheme();
  const mapRef = useRef<MapRef | null>(null);
  const [loaded, setLoaded] = useState(false);

  // Fit to the selected state's bounds (or the whole country when cleared). Runs on
  // load too, so an initial ?state= is framed correctly, not just later changes.
  useEffect(() => {
    if (!loaded) return;
    const map = mapRef.current?.getMap();
    if (!map) return;
    const bounds = (focusState && STATE_BOUNDS[focusState]) || AUSTRALIA_BOUNDS;
    map.fitBounds(bounds, { padding: 40, duration: focusState ? 700 : 0 });
  }, [focusState, loaded]);

  if (!TOKEN) {
    return (
      <div className="flex h-full items-center justify-center bg-surface-variant p-6 text-center text-sm text-muted-foreground">
        Set <code className="mx-1">NEXT_PUBLIC_MAPBOX_TOKEN</code> to show the map.
      </div>
    );
  }

  return (
    <Map
      ref={mapRef}
      mapboxAccessToken={TOKEN}
      initialViewState={AUSTRALIA_VIEW}
      mapStyle={theme === "dark" ? "mapbox://styles/mapbox/dark-v11" : "mapbox://styles/mapbox/streets-v12"}
      style={{ width: "100%", height: "100%" }}
      // Require ⌘/Ctrl + scroll to zoom; Mapbox shows a "Use ⌘ + scroll to zoom the map" overlay otherwise.
      cooperativeGestures
      onLoad={() => setLoaded(true)}
    />
  );
}
