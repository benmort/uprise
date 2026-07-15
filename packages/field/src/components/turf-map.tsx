"use client";

import { useCallback, useEffect, useMemo, useRef } from "react";
import Map, { FullscreenControl, Layer, Marker, Source, type MapProps, type MapRef } from "react-map-gl/mapbox";
import type { FilterSpecification } from "mapbox-gl";
import { bbox } from "@turf/turf";
import { Crosshair, Globe } from "lucide-react";
import { useTheme } from "../lib/use-theme";
import "mapbox-gl/dist/mapbox-gl.css";

export type MapStop = { id: string; lat: number; lng: number; status?: string };
export type LngLat = { lat: number; lng: number };

const TOKEN = process.env.NEXT_PUBLIC_MAPBOX_TOKEN ?? "";
/** National bounding box – the geo explorers' default viewport before a pick. */
export const AU_BOUNDS: [number, number, number, number] = [112.92, -43.74, 153.64, -9.14];
// Brand primary (= --primary / brand-500), mirrored here because Mapbox paint
// props need a literal hex and can't read the CSS token. Matches the admin blue.
const PRIMARY = "#465fff";
// Stop-pin palette. Visited/spoke = brand success green; "another state" (skipped /
// not home) = amber; pending / next = brand primary. Literal hexes so the SVG pin
// markers match the Mapbox paint layers, which can't read the CSS tokens.
const SUCCESS = "#2e7d6a";
const AMBER = "#c9781a";
// Close, street-level zoom for a searched-address focus point — high enough to
// read the individual doors around the pin (vs the coarser stop/GPS focus at 14).
const POINT_ZOOM = 16.5;

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
  defaultBounds,
  focusBounds,
  focusPoint,
  boundaryTilesUrl,
  boundaryLayers,
  boundaryFilter,
  selectedBoundaryCode,
  onBoundaryClick,
}: {
  mode: "view" | "edit";
  stops?: MapStop[];
  turfGeometry?: GeoJSON.Geometry | null;
  activeStopId?: string;
  userPosition?: LngLat | null;
  onStopTap?: (id: string) => void;
  /** Walking route line (user → next stop) from the Mapbox Directions API. */
  routeGeometry?: GeoJSON.LineString | null;
  /** Viewport when there's no geometry/stops/position to focus (e.g. AU_BOUNDS). */
  defaultBounds?: [number, number, number, number];
  /** `[w,s,e,n]` to frame the viewport to on change (e.g. the geo explorer's shared
   *  State Filter zooming to a state). Re-fits live, unlike `defaultBounds` (mount only). */
  focusBounds?: [number, number, number, number];
  /** A point to frame at close street-level zoom — e.g. a searched address. Flies to
   *  it on change, and the Recenter button snaps back to it. Kept separate from
   *  `userPosition` (a live-GPS marker) so tracking isn't hijacked. */
  focusPoint?: { lat: number; lng: number } | null;
  /** `/geo/tiles/<layer>/{z}/{x}/{y}` vector-tile template. When set, every boundary
   *  of that layer is drawn as a clickable overlay (the Areas-explorer pattern) —
   *  used by the States/Divisions explorers to show the whole set, not one selection. */
  boundaryTilesUrl?: string;
  /** Several boundary sets drawn together, colour-coded — e.g. the Divisions explorer
   *  showing Federal + State + Local at once. Each is clickable; onBoundaryClick's
   *  third arg is the layer's `id`, so the caller knows which set was clicked. Use
   *  this OR `boundaryTilesUrl` (single set), not both. */
  boundaryLayers?: Array<{ id: string; tilesUrl: string; color: string; interactive?: boolean }>;
  /** Mapbox filter expression restricting which boundary features render (e.g. one
   *  state via the ASGS code prefix). Applied to every base boundary layer; the
   *  selected-highlight is unaffected. */
  boundaryFilter?: FilterSpecification;
  /** Code of the boundary to highlight within the tile layer (feature `code` match). */
  selectedBoundaryCode?: string;
  /** Fired with the clicked boundary's code + name (+ the layer id, for multi-layer). */
  onBoundaryClick?: (code: string, name: string | null, layerId?: string) => void;
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
    if (focusPoint) {
      return { latitude: focusPoint.lat, longitude: focusPoint.lng, zoom: POINT_ZOOM };
    }
    const focus = userPosition ?? stops[0];
    if (focus) {
      return { latitude: focus.lat, longitude: focus.lng, zoom: 14 };
    }
    const frame = focusBounds ?? defaultBounds;
    if (frame) {
      return {
        bounds: [[frame[0], frame[1]], [frame[2], frame[3]]],
        fitBoundsOptions: { padding: 32 },
      };
    }
    return { latitude: -33.8688, longitude: 151.2093, zoom: 14 };
  }, [bounds, stops, userPosition, focusPoint, focusBounds, defaultBounds]);

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

  // Frame the picked state on change (the shared State Filter). `focusBounds` is a
  // stable module-constant reference per state, so identity only changes on a real
  // pick; skip the first run since initialViewState already framed it on mount.
  const framedOnce = useRef(false);
  useEffect(() => {
    if (!framedOnce.current) {
      framedOnce.current = true;
      return;
    }
    // Re-frame on a State Filter change: to the picked state, or back to the default
    // (national) view when cleared to "All states". A point focus (picked address /
    // walk stop) stays put.
    const frame = focusBounds ?? ((userPosition ?? stops[0]) ? null : defaultBounds);
    if (!frame) return;
    mapRef.current?.fitBounds([[frame[0], frame[1]], [frame[2], frame[3]]], {
      padding: 32,
      duration: 600,
    });
    // Only a State Filter (focusBounds) change should re-frame — not a stop/point change.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [focusBounds]);

  // Fly to a searched-address focus point at street-level zoom when it changes.
  const pointedOnce = useRef(false);
  useEffect(() => {
    if (!pointedOnce.current) {
      pointedOnce.current = true;
      return;
    }
    if (!focusPoint) return;
    mapRef.current
      ?.getMap()
      ?.flyTo({ center: [focusPoint.lng, focusPoint.lat], zoom: POINT_ZOOM, duration: 700 });
    // Re-fly only on a new focus point (its coords), not on identity churn.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [focusPoint?.lat, focusPoint?.lng]);

  // Corner controls: "Recenter" snaps back to whatever the map is focused on; the
  // globe zooms out to the whole country (defaultBounds, e.g. AU_BOUNDS).
  const recenter = useCallback(() => {
    const map = mapRef.current?.getMap();
    if (!map) return;
    if (bounds) return fitToBounds();
    if (focusPoint) return map.flyTo({ center: [focusPoint.lng, focusPoint.lat], zoom: POINT_ZOOM, duration: 600 });
    const frame = focusBounds ?? defaultBounds;
    if (frame) map.fitBounds([[frame[0], frame[1]], [frame[2], frame[3]]], { padding: 32, duration: 600 });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [bounds, fitToBounds, focusPoint?.lat, focusPoint?.lng, focusBounds, defaultBounds]);

  const recenterNational = useCallback(() => {
    const map = mapRef.current?.getMap();
    if (map && defaultBounds) {
      map.fitBounds([[defaultBounds[0], defaultBounds[1]], [defaultBounds[2], defaultBounds[3]]], {
        padding: 32,
        duration: 600,
      });
    }
  }, [defaultBounds]);

  const active = stops.find((s) => s.id === activeStopId);

  // Our boundary vector tiles come from the ORGANISER-gated API on a (same-site)
  // cross-origin host; Mapbox GL won't send the parent-domain session cookie unless
  // the request opts in. Derive the API origin from the tile URLs we were handed and
  // attach credentials for Tile requests to it (mirrors TurfDrawMap.transformRequest).
  // Without this, divisions/states boundary tiles come back 401 and never paint.
  const tileOrigin = useMemo(() => {
    const sample = boundaryTilesUrl ?? boundaryLayers?.[0]?.tilesUrl;
    if (!sample) return null;
    try {
      return new URL(sample).origin;
    } catch {
      return null;
    }
  }, [boundaryTilesUrl, boundaryLayers]);
  const transformRequest = useCallback(
    (url: string, resourceType?: string) =>
      resourceType === "Tile" && tileOrigin && url.startsWith(tileOrigin)
        ? { url, credentials: "include" as const }
        : { url },
    [tileOrigin],
  );

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
      transformRequest={transformRequest}
      onLoad={() => {
        const map = mapRef.current?.getMap();
        if (!map) return;
        // The container often finishes laying out (next/dynamic + grid cell) AFTER
        // the map computes its initial view, so it fits to the wrong size and loads
        // tiles for the wrong viewport — boundaries look missing until you interact.
        // Resize, then re-apply the initial frame so the correct tiles load at once.
        map.resize();
        if (bounds) {
          map.fitBounds([[bounds[0], bounds[1]], [bounds[2], bounds[3]]], { padding: 32 });
          return;
        }
        if (focusPoint) {
          map.flyTo({ center: [focusPoint.lng, focusPoint.lat], zoom: POINT_ZOOM, duration: 0 });
          return;
        }
        // A point focus (a picked address / walk stop) is already correct — leave it.
        if (userPosition ?? stops[0]) return;
        const frame = focusBounds ?? defaultBounds;
        if (frame) map.fitBounds([[frame[0], frame[1]], [frame[2], frame[3]]], { padding: 32 });
      }}
      onClick={(e) => {
        // A boundary click (States/Divisions explorer) selects that region. Matches
        // the single "boundaries-fill" or a multi-layer "boundaries-<id>-fill".
        const boundary = e.features?.find((f) => {
          const id = f.layer?.id ?? "";
          return id === "boundaries-fill" || (id.startsWith("boundaries-") && id.endsWith("-fill"));
        });
        if (boundary && onBoundaryClick) {
          const props = (boundary.properties ?? {}) as { code?: unknown; name?: unknown };
          const m = (boundary.layer?.id ?? "").match(/^boundaries-(.+)-fill$/);
          if (props.code != null) {
            onBoundaryClick(String(props.code), props.name != null ? String(props.name) : null, m ? m[1] : undefined);
          }
          return;
        }
        const feature = e.features?.[0];
        const id = feature?.properties?.id;
        if (id && onStopTap) onStopTap(String(id));
      }}
      interactiveLayerIds={[
        ...(boundaryTilesUrl ? ["boundaries-fill"] : []),
        ...(boundaryLayers?.filter((bl) => bl.interactive).map((bl) => `boundaries-${bl.id}-fill`) ?? []),
      ]}
    >
      {/* Whole-layer boundary overlay (States/Divisions explorer parity with Areas):
          every region drawn from on-demand vector tiles, the selected one highlighted
          by a `code` filter — no huge per-region GeoJSON fetch. Keyed by URL so the
          source is recreated cleanly when the layer changes (e.g. a division-type tab). */}
      {boundaryTilesUrl && (
        <Source key={boundaryTilesUrl} id="boundaries" type="vector" tiles={[boundaryTilesUrl]} minzoom={0} maxzoom={16}>
          <Layer id="boundaries-fill" source-layer="areas" type="fill" filter={boundaryFilter} paint={{ "fill-color": PRIMARY, "fill-opacity": 0.04 }} />
          <Layer id="boundaries-line" source-layer="areas" type="line" filter={boundaryFilter} paint={{ "line-color": "#64748b", "line-width": 0.8 }} />
          {selectedBoundaryCode ? (
            <>
              <Layer
                id="boundaries-selected-fill"
                source-layer="areas"
                type="fill"
                filter={["==", ["get", "code"], selectedBoundaryCode]}
                paint={{ "fill-color": PRIMARY, "fill-opacity": 0.55 }}
              />
              <Layer
                id="boundaries-selected-line"
                source-layer="areas"
                type="line"
                filter={["==", ["get", "code"], selectedBoundaryCode]}
                paint={{ "line-color": PRIMARY, "line-width": 4 }}
              />
            </>
          ) : null}
        </Source>
      )}

      {/* Multi-layer boundaries drawn together, colour-coded (Divisions: Federal +
          State + Local at once). Each set is a separate vector source keyed by URL. */}
      {boundaryLayers?.map((bl) => (
        <Source key={bl.tilesUrl} id={`boundaries-${bl.id}`} type="vector" tiles={[bl.tilesUrl]} minzoom={0} maxzoom={16}>
          {/* Only the active layer gets a fill (so it's the clickable one); the others
              are colour-coded lines drawn a touch fainter. */}
          {bl.interactive ? (
            <Layer id={`boundaries-${bl.id}-fill`} source-layer="areas" type="fill" filter={boundaryFilter} paint={{ "fill-color": bl.color, "fill-opacity": 0.05 }} />
          ) : null}
          <Layer
            id={`boundaries-${bl.id}-line`}
            source-layer="areas"
            type="line"
            filter={boundaryFilter}
            paint={{ "line-color": bl.color, "line-width": bl.interactive ? 1.4 : 1, "line-opacity": bl.interactive ? 1 : 0.6 }}
          />
          {bl.interactive && selectedBoundaryCode ? (
            <>
              <Layer
                id={`boundaries-${bl.id}-selfill`}
                source-layer="areas"
                type="fill"
                filter={["==", ["get", "code"], selectedBoundaryCode]}
                paint={{ "fill-color": bl.color, "fill-opacity": 0.55 }}
              />
              <Layer
                id={`boundaries-${bl.id}-selline`}
                source-layer="areas"
                type="line"
                filter={["==", ["get", "code"], selectedBoundaryCode]}
                paint={{ "line-color": bl.color, "line-width": 4 }}
              />
            </>
          ) : null}
        </Source>
      ))}

      {turfGeometry && (
        <Source id="turf" type="geojson" data={{ type: "Feature", geometry: turfGeometry, properties: {} }}>
          <Layer
            id="turf-fill"
            type="fill"
            paint={{ "fill-color": PRIMARY, "fill-opacity": mode === "view" ? 0.06 : 0.12 }}
          />
          {/* The walk turf reads as a dashed blue boundary (the offline-walk look); the
              geo explorer (edit) keeps its solid selection outline. */}
          <Layer
            id="turf-line"
            type="line"
            layout={{ "line-cap": "round", "line-join": "round" }}
            paint={
              mode === "view"
                ? { "line-color": PRIMARY, "line-width": 2.5, "line-dasharray": [2, 2] }
                : { "line-color": PRIMARY, "line-width": 2 }
            }
          />
        </Source>
      )}

      {/* Smooth translucent-blue route threading the stops in order (drawn under the
          pins). Solid + round-joined for the soft curved look, not a dashed trail. */}
      {routeGeometry && (
        <Source id="walk-route" type="geojson" data={{ type: "Feature", geometry: routeGeometry, properties: {} }}>
          <Layer
            id="walk-route-line"
            type="line"
            layout={{ "line-cap": "round", "line-join": "round" }}
            paint={{ "line-color": PRIMARY, "line-width": 4.5, "line-opacity": 0.4 }}
          />
        </Source>
      )}

      {/* Stops as coloured teardrop pins (DOM markers, so they sit above the route +
          boundary). The active/next stop gets its own emphasised pin below. */}
      {mode === "view" &&
        stops
          .filter((s) => s.id !== activeStopId)
          .map((s) => (
            <Marker
              key={s.id}
              latitude={s.lat}
              longitude={s.lng}
              anchor="bottom"
              onClick={
                onStopTap
                  ? (e) => {
                      e.originalEvent.stopPropagation();
                      onStopTap(s.id);
                    }
                  : undefined
              }
            >
              <StopPin color={stopColor(s.status)} />
            </Marker>
          ))}

      {active && (
        <Marker
          latitude={active.lat}
          longitude={active.lng}
          anchor="bottom"
          onClick={
            onStopTap
              ? (e) => {
                  e.originalEvent.stopPropagation();
                  onStopTap(active.id);
                }
              : undefined
          }
        >
          <StopPin color={stopColor(active.status)} active />
        </Marker>
      )}
      {userPosition && (
        <Marker latitude={userPosition.lat} longitude={userPosition.lng} anchor="center">
          {/* Live GPS position: solid brand dot + white ring, soft primary glow. */}
          <div className="relative flex h-6 w-6 items-center justify-center">
            <span className="absolute inset-0 rounded-full bg-primary/25" />
            <span className="h-4 w-4 rounded-full border-[3px] border-white bg-primary shadow-[0_1px_4px_rgba(0,0,0,0.35)]" />
          </div>
        </Marker>
      )}

      {/* Corner controls: recenter to what's focused (turf / searched address /
          state), and a globe to zoom back out to the whole country. */}
      <div className="absolute right-2 top-2 z-10 flex gap-1.5">
        {(bounds || focusPoint || focusBounds) && (
          <button
            type="button"
            onClick={recenter}
            title="Recenter"
            className="flex items-center gap-1.5 rounded-lg border border-border bg-surface/95 px-2.5 py-1.5 text-xs font-semibold text-foreground shadow-card backdrop-blur hover:bg-surface-variant"
          >
            <Crosshair className="h-3.5 w-3.5" />
            Recenter
          </button>
        )}
        {defaultBounds && (
          <button
            type="button"
            onClick={recenterNational}
            title="Zoom out to all of Australia"
            className="flex items-center gap-1.5 rounded-lg border border-border bg-surface/95 px-2.5 py-1.5 text-xs font-semibold text-foreground shadow-card backdrop-blur hover:bg-surface-variant"
          >
            <Globe className="h-3.5 w-3.5" />
            Australia
          </button>
        )}
      </div>
      <FullscreenControl position="top-left" />
    </Map>
  );
}

/** Pending / next = brand primary, visited/spoke = success green, skipped/not-home = amber. */
function stopColor(status?: string): string {
  if (status === "VISITED") return SUCCESS;
  if (status === "SKIPPED") return AMBER;
  return PRIMARY;
}

/**
 * Stylised teardrop map-pin (the offline-walk look): a solid status-coloured balloon
 * with a white outline and a small white centre dot, its tip anchored on the stop.
 * `active` renders the next stop a touch larger with a stronger drop shadow.
 */
function StopPin({ color, active = false }: { color: string; active?: boolean }) {
  const w = active ? 32 : 26;
  const h = active ? 40 : 34;
  return (
    <svg
      width={w}
      height={h}
      viewBox="0 0 26 34"
      className="cursor-pointer"
      style={{ filter: `drop-shadow(0 2px 3px rgba(15,23,42,${active ? 0.32 : 0.22}))` }}
      aria-hidden
    >
      <path
        d="M13 1.2C6.65 1.2 1.5 6.35 1.5 12.7c0 8.4 11.5 19.8 11.5 19.8s11.5-11.4 11.5-19.8C24.5 6.35 19.35 1.2 13 1.2Z"
        fill={color}
        stroke="#ffffff"
        strokeWidth={active ? 2.4 : 2}
      />
      <circle cx="13" cy="12.7" r={active ? 4.6 : 4.1} fill="#ffffff" />
    </svg>
  );
}
