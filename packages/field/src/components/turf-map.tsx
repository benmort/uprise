"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import Map, { FullscreenControl, Layer, Marker, Popup, Source, useMap, type MapProps, type MapRef } from "react-map-gl/mapbox";
import type { ExpressionSpecification, FilterSpecification, SymbolLayerSpecification } from "mapbox-gl";
import bbox from "@turf/bbox";
import { Crosshair, Globe, Loader2, LocateFixed, Navigation } from "lucide-react";
import { useTheme } from "../lib/use-theme";
import { sampleFlowChevrons } from "../lib/geo";
import { installMoonlitDark } from "../lib/moonlit-dark";
import { AddressInfoCard } from "./address-info-card";
import { useScrollToZoom, MapGestureToggle } from "./map-gesture-toggle";
import { MapCorner, MapAttribution } from "./map-chrome";
import "mapbox-gl/dist/mapbox-gl.css";

/** A walk stop. The optional address/contact/gnafPid fields feed the tap-to-open door
 *  info popover (`stopPopup`); status alone is enough for a plain pin. */
export type MapStop = {
  id: string;
  lat: number;
  lng: number;
  status?: string;
  gnafPid?: string | null;
  address?: string | null;
  contactId?: string | null;
  contactName?: string | null;
};
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

/** Direction chevrons that FLOW along a route line — "›" glyphs that march forward, one moving
 *  to where the next started and looping seamlessly, so the walking direction reads as motion.
 *  Placed as points on an animated source (line-placed symbols can't scroll); {@link FlowChevrons}
 *  drives it, shared by every route/trail layer (the replay trails import it). */
const CHEVRON_SPACING_PX = 90; // on-screen gap between flowing chevrons (zoom-independent)
const FLOW_PERIOD_MS = 6000; // time for one chevron to travel one gap, then loop
const METRES_PER_PX_Z0 = 156543.03392; // web-mercator metres/px at the equator, zoom 0
const EMPTY_FC: GeoJSON.FeatureCollection = { type: "FeatureCollection", features: [] };

/** Point-placed chevrons; each is rotated to the along-line bearing via its `rotate` property. */
const CHEVRON_POINT_LAYOUT: SymbolLayerSpecification["layout"] = {
  "symbol-placement": "point",
  "text-field": "›",
  "text-size": 22,
  "text-font": ["DIN Pro Bold", "Arial Unicode MS Bold"],
  "text-rotate": ["get", "rotate"] as ExpressionSpecification,
  "text-rotation-alignment": "map",
  "text-allow-overlap": true,
  "text-ignore-placement": true,
};

/**
 * Renders + animates the flowing direction chevrons for one line. Its own point source is
 * refreshed each frame from {@link sampleFlowChevrons}: spacing is derived from the current zoom
 * (so on-screen density is constant) and the offset ramps 0→spacing over `FLOW_PERIOD_MS`, giving
 * a seamless forward conveyor. Renders nothing extra when `line` is absent.
 */
export function FlowChevrons({
  id,
  line,
  color,
  opacity = 0.7,
  haloColor = "#ffffff",
  haloWidth = 1,
}: {
  id: string;
  line?: GeoJSON.LineString | null;
  color: string;
  opacity?: number;
  haloColor?: string;
  haloWidth?: number;
}) {
  const { current: mapRef } = useMap();
  const sourceId = `${id}-src`;
  const lineRef = useRef(line);
  lineRef.current = line;

  useEffect(() => {
    const map = mapRef?.getMap();
    if (!map) return;
    let raf = 0;
    const tick = (t: number) => {
      raf = requestAnimationFrame(tick);
      const src = map.getSource(sourceId) as { setData?: (d: GeoJSON.FeatureCollection) => void } | undefined;
      if (!src?.setData) return; // source not added yet (or removed mid style-swap)
      const coords = (lineRef.current?.coordinates as Array<[number, number]> | undefined) ?? [];
      if (coords.length < 2) {
        src.setData(EMPTY_FC);
        return;
      }
      const lat = coords[0][1];
      const mPerPx = (METRES_PER_PX_Z0 * Math.cos((lat * Math.PI) / 180)) / Math.pow(2, map.getZoom());
      const spacingM = CHEVRON_SPACING_PX * mPerPx;
      const offsetM = ((t % FLOW_PERIOD_MS) / FLOW_PERIOD_MS) * spacingM;
      src.setData(sampleFlowChevrons(coords, spacingM, offsetM));
    };
    raf = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(raf);
  }, [mapRef, sourceId]);

  return (
    <Source id={sourceId} type="geojson" data={EMPTY_FC}>
      <Layer
        id={id}
        type="symbol"
        layout={CHEVRON_POINT_LAYOUT}
        paint={{ "text-color": color, "text-opacity": opacity, "text-halo-color": haloColor, "text-halo-width": haloWidth }}
      />
    </Source>
  );
}

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
  stopPopup = false,
  buildDetailHref,
  knockLabel,
  routeGeometry,
  routeApproximate = false,
  nextLegGeometry,
  follow,
  userHeading,
  children,
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
  /** When set, tapping a stop opens the door info popover (address + contact + regions)
   *  instead of firing `onStopTap` directly. The popover's primary action re-invokes
   *  `onStopTap` as "Knock at this door", so the live-app knock flow is preserved —
   *  just fronted by the info bubble. */
  stopPopup?: boolean;
  /** Builds the popover's "View full detail" link for a stop's gnafPid (admin surfaces).
   *  Omit in the standalone field PWA, which has no such route. */
  buildDetailHref?: (gnafPid: string) => string;
  /** Label for the popover's knock button (default "Knock at this door"). */
  knockLabel?: string;
  /** The FULL walk-route line threading every stop (server street-following geometry,
   *  or the client's straight-line fallback when offline / Mapbox is down). */
  routeGeometry?: GeoJSON.LineString | null;
  /** True when `routeGeometry` is the straight-line fallback — drawn dashed so it reads
   *  as approximate (matching the dashed offline turf boundary). */
  routeApproximate?: boolean;
  /** The user → next-stop walking leg (Mapbox Directions) — drawn stronger, on top of
   *  the full-route line. */
  nextLegGeometry?: GeoJSON.LineString | null;
  /** Street walk view: nav-style follow camera. While set, the camera keeps this position
   *  centred, rotates so the bearing is up, and pitches low over the street; clearing it
   *  eases back to the flat north-up map. */
  follow?: { position: LngLat; bearing: number | null } | null;
  /** Compass heading (0–360°) for the GPS dot — when known it renders as a direction
   *  arrow rotated with the map instead of a plain dot. */
  userHeading?: number | null;
  /** Extra map content (Sources/Layers/Markers) — e.g. the shift-replay trails. */
  children?: React.ReactNode;
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
  // Latest theme for the moonlit tint's style.load handler (registered once in onLoad).
  const themeRef = useRef(theme);
  themeRef.current = theme;
  // When on, plain scroll zooms (no ⌘ held) — a persisted, cross-map preference.
  const [scrollZoom] = useScrollToZoom();

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

  // Keep the map sized to its container. mapbox-gl measures the container ONCE at init and won't
  // repaint if it changes size later — which happens when the map is embedded in a container that
  // gains height AFTER mount (e.g. the admin walk-list preview, whose `min-h-[60vh]` lands a beat
  // late, or any show/hide toggle). Without this the canvas stays blank at the stale 0×0 size. A
  // ResizeObserver (attached in onLoad, where the map is ready) re-`resize()`s on every change.
  const resizeObserverRef = useRef<ResizeObserver | null>(null);
  useEffect(() => () => resizeObserverRef.current?.disconnect(), []);

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

  // Entering/leaving fullscreen (the native FullscreenControl) changes the container size but
  // leaves the camera where it was, so the turf ends up off-centre. Re-fit to whatever the map
  // frames once the fullscreen transition has settled (both on enter AND exit). No-ops when
  // there's nothing to frame (recenter early-returns).
  useEffect(() => {
    const onFullscreenChange = () => {
      window.setTimeout(() => {
        mapRef.current?.getMap()?.resize();
        recenter();
      }, 200);
    };
    document.addEventListener("fullscreenchange", onFullscreenChange);
    document.addEventListener("webkitfullscreenchange", onFullscreenChange);
    return () => {
      document.removeEventListener("fullscreenchange", onFullscreenChange);
      document.removeEventListener("webkitfullscreenchange", onFullscreenChange);
    };
  }, [recenter]);

  const recenterNational = useCallback(() => {
    const map = mapRef.current?.getMap();
    if (map && defaultBounds) {
      map.fitBounds([[defaultBounds[0], defaultBounds[1]], [defaultBounds[2], defaultBounds[3]]], {
        padding: 32,
        duration: 600,
      });
    }
  }, [defaultBounds]);

  // Street walk view: nav-style follow camera. `following` = the camera should stick to the GPS
  // position; it engages when Street opens and drops the instant the user pans/zooms/rotates so
  // they can look around (the Recentre button re-engages it). It never recentres on its own and
  // never overrides the zoom the user has set — the jarring per-fix snap came from re-centring +
  // re-clamping zoom on every fix.
  const [following, setFollowing] = useState(false);
  const wasFollowing = useRef(false);
  // Whether the one-time nav framing (low 3D pitch + street-level zoom) has been applied for the
  // current follow session. Reset on engage / re-engage so it lands once, then the user owns zoom.
  const framedRef = useRef(false);
  const hasFollow = !!follow;

  // Explicit Recentre tap — re-engage follow and re-apply the nav framing on the next track run.
  const engageFollow = useCallback(() => {
    framedRef.current = false;
    setFollowing(true);
  }, []);

  // Engage on entering Street, reset to the flat north-up map on leaving. Keyed on the boolean so
  // it fires only on the transition, not on every new fix.
  useEffect(() => {
    const map = mapRef.current?.getMap();
    if (!map) return;
    if (hasFollow) {
      wasFollowing.current = true;
      framedRef.current = false;
      setFollowing(true);
    } else if (wasFollowing.current) {
      wasFollowing.current = false;
      setFollowing(false);
      map.easeTo({ pitch: 0, bearing: 0, duration: 600 });
    }
  }, [hasFollow]);

  // Track each fix WHILE following: recentre + rotate to heading, applying the nav framing (low 3D
  // pitch + street zoom) once per session, then leaving zoom/pitch to the user. Paused
  // (following=false) the instant the user gestures, so it can't yank them back.
  useEffect(() => {
    if (!following || !follow) return;
    const map = mapRef.current?.getMap();
    if (!map) return;
    const opts: Parameters<typeof map.easeTo>[0] = {
      center: [follow.position.lng, follow.position.lat],
      bearing: follow.bearing ?? map.getBearing(),
      duration: 700,
      essential: true,
    };
    if (!framedRef.current) {
      opts.pitch = 62;
      opts.zoom = Math.max(map.getZoom(), 17);
      framedRef.current = true;
    }
    map.easeTo(opts);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [following, follow?.position.lat, follow?.position.lng, follow?.bearing]);

  // The direction arrows now flow (see FlowChevrons) instead of pulsing — no shared effect here.

  // "My location" — centre the map on the viewer's current GPS position + drop the marker.
  // Works standalone (doesn't need the parent's `userPosition` prop), so it also locates the
  // organiser previewing in the admin. Held locally; the marker renders it (or the prop).
  const [locatedPos, setLocatedPos] = useState<LngLat | null>(null);
  const [locating, setLocating] = useState(false);
  const locateMe = useCallback(() => {
    if (typeof navigator === "undefined" || !navigator.geolocation) return;
    setLocating(true);
    navigator.geolocation.getCurrentPosition(
      (pos) => {
        const p = { lat: pos.coords.latitude, lng: pos.coords.longitude };
        setLocatedPos(p);
        setLocating(false);
        mapRef.current?.getMap()?.flyTo({ center: [p.lng, p.lat], zoom: 15, duration: 700 });
      },
      () => setLocating(false), // denied/timeout — no-op (the button just stops spinning)
      { enableHighAccuracy: true, timeout: 8000, maximumAge: 30000 },
    );
  }, []);
  const gpsPosition = userPosition ?? locatedPos;

  // Door info popover: tapping a stop opens it (when `stopPopup`), else fires onStopTap
  // directly (the original behaviour). Cleared when the tapped stop leaves the set.
  const [popupStopId, setPopupStopId] = useState<string | null>(null);
  const handleStopTap = useCallback(
    (id: string) => {
      if (stopPopup) setPopupStopId(id);
      else onStopTap?.(id);
    },
    [stopPopup, onStopTap],
  );
  const stopTappable = stopPopup || Boolean(onStopTap);

  const active = stops.find((s) => s.id === activeStopId);
  const popupStop = popupStopId ? stops.find((s) => s.id === popupStopId) ?? null : null;

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
      // ⌘/Ctrl + scroll to zoom by default (Mapbox shows the "Use ⌘ + scroll" overlay), unless
      // the volunteer has ticked "Scroll to zoom" — then plain scroll zooms.
      cooperativeGestures={!scrollZoom}
      // Mapbox chrome bottom-right only: wordmark + one compact ⓘ (<MapAttribution/>).
      attributionControl={false}
      logoPosition="bottom-right"
      transformRequest={transformRequest}
      onLoad={() => {
        const map = mapRef.current?.getMap();
        if (!map) return;
        installMoonlitDark(map, () => themeRef.current);
        // Self-heal on any later container resize (embed gains height, panel toggles) — see the
        // ResizeObserver note above. Set up here where the map + its container are guaranteed ready.
        if (typeof ResizeObserver !== "undefined" && !resizeObserverRef.current) {
          const ro = new ResizeObserver(() => map.resize());
          ro.observe(map.getContainer());
          resizeObserverRef.current = ro;
        }
        // Nav follow pauses the instant the user gestures (pan/zoom/rotate/pitch) so they can
        // look around; the next GPS fix won't yank them back. User gestures carry an
        // `originalEvent`; our programmatic easeTo moves don't, so follow never pauses itself.
        const pauseFollow = (e: unknown) => {
          if ((e as { originalEvent?: unknown }).originalEvent) setFollowing(false);
        };
        map.on("dragstart", pauseFollow);
        map.on("rotatestart", pauseFollow);
        map.on("pitchstart", pauseFollow);
        map.on("zoomstart", pauseFollow);
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

      {/* Smooth translucent-blue route threading ALL the stops in order (drawn under the
          pins). Solid + round-joined when it's real street geometry; dashed when it's the
          straight-line fallback, so an approximate route never reads as a footpath.
          Chevron glyphs ride each line ("›" symbols rotated along it) so the walking
          DIRECTION is readable at a glance. */}
      {routeGeometry && (
        <Source id="walk-route" type="geojson" data={{ type: "Feature", geometry: routeGeometry, properties: {} }}>
          <Layer
            id="walk-route-line"
            type="line"
            layout={{ "line-cap": "round", "line-join": "round" }}
            paint={{
              "line-color": PRIMARY,
              "line-width": 4.5,
              "line-opacity": 0.4,
              ...(routeApproximate ? { "line-dasharray": [1.5, 1.5] as [number, number] } : {}),
            }}
          />
        </Source>
      )}
      <FlowChevrons id="walk-route-chevrons" line={routeGeometry} color={PRIMARY} opacity={0.55} />

      {/* The user → next-stop walking leg, stronger and on top of the full route so the
          immediate path stands out from the rest of the walk. */}
      {nextLegGeometry && (
        <Source
          id="walk-next-leg"
          type="geojson"
          data={{ type: "Feature", geometry: nextLegGeometry, properties: {} }}
        >
          <Layer
            id="walk-next-leg-line"
            type="line"
            layout={{ "line-cap": "round", "line-join": "round" }}
            paint={{ "line-color": PRIMARY, "line-width": 5, "line-opacity": 0.85 }}
          />
        </Source>
      )}
      <FlowChevrons
        id="walk-next-leg-chevrons"
        line={nextLegGeometry}
        color="#ffffff"
        opacity={0.95}
        haloColor={PRIMARY}
        haloWidth={1.2}
      />

      {/* Caller-supplied map content (e.g. the shift-replay trails + person marker). */}
      {children}

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
                stopTappable
                  ? (e) => {
                      e.originalEvent.stopPropagation();
                      handleStopTap(s.id);
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
            stopTappable
              ? (e) => {
                  e.originalEvent.stopPropagation();
                  handleStopTap(active.id);
                }
              : undefined
          }
        >
          <StopPin color={stopColor(active.status)} active />
        </Marker>
      )}

      {/* Door info popover — tap a stop to see the address, contact and containing
          regions. The live app's primary action re-runs onStopTap ("Knock at this
          door"); the read-only preview shows a "View full detail" link instead. */}
      {stopPopup && popupStop && (
        <Popup
          latitude={popupStop.lat}
          longitude={popupStop.lng}
          anchor="bottom"
          offset={36}
          closeOnClick={false}
          maxWidth="none"
          onClose={() => setPopupStopId(null)}
        >
          <AddressInfoCard
            gnafPid={popupStop.gnafPid}
            address={popupStop.address}
            contactId={popupStop.contactId}
            contactName={popupStop.contactName}
            detailHref={buildDetailHref && popupStop.gnafPid ? buildDetailHref(popupStop.gnafPid) : undefined}
            onKnock={
              onStopTap
                ? () => {
                    const id = popupStop.id;
                    setPopupStopId(null);
                    onStopTap(id);
                  }
                : undefined
            }
            knockLabel={knockLabel}
          />
        </Popup>
      )}
      {gpsPosition && (
        <Marker
          latitude={gpsPosition.lat}
          longitude={gpsPosition.lng}
          anchor="center"
          rotation={userHeading ?? 0}
          rotationAlignment={userHeading != null ? "map" : "viewport"}
        >
          {userHeading != null ? (
            // Street mode: a heading arrow that rotates with the map, so "which way am I
            // facing" is always visible even when the camera itself is heading-up.
            <svg width="30" height="30" viewBox="0 0 30 30" aria-hidden style={{ filter: "drop-shadow(0 1px 3px rgba(0,0,0,0.35))" }}>
              <circle cx="15" cy="15" r="13" fill="rgba(70,95,255,0.18)" />
              <path d="M15 5 L21.5 21.5 L15 17.5 L8.5 21.5 Z" fill={PRIMARY} stroke="#ffffff" strokeWidth="1.6" strokeLinejoin="round" />
            </svg>
          ) : (
            // Live GPS position: solid brand dot + white ring, soft primary glow.
            <div className="relative flex h-6 w-6 items-center justify-center">
              <span className="absolute inset-0 rounded-full bg-primary/25" />
              <span className="h-4 w-4 rounded-full border-[3px] border-white bg-primary shadow-[0_1px_4px_rgba(0,0,0,0.35)]" />
            </div>
          )}
        </Marker>
      )}

      {/* Top-right — context/actions: scroll-to-zoom atop the recenter / my-location /
          Australia cluster (recenter to what's focused, my-location, globe to the country). */}
      <MapCorner corner="top-right">
        {/* Nav follow paused (user looked around) — one tap re-engages the follow camera.
            Filled primary so it stands out as the key action once you've drifted. */}
        {follow && !following ? (
          <button
            type="button"
            onClick={engageFollow}
            title="Recentre on your location"
            className="flex items-center gap-1.5 rounded-lg border border-primary bg-primary px-2.5 py-1.5 text-xs font-semibold text-white shadow-card backdrop-blur hover:bg-primary/90"
          >
            <Navigation className="h-3.5 w-3.5" />
            Recentre
          </button>
        ) : null}
        <MapGestureToggle />
        <div className="flex gap-1.5">
          {(bounds || focusPoint || focusBounds) && (
            <button
              type="button"
              // Reframing to the turf is a "look elsewhere" action — drop follow so the next GPS
              // fix doesn't snap the nav camera straight back.
              onClick={() => {
                setFollowing(false);
                recenter();
              }}
              title="Recenter"
              className="flex items-center gap-1.5 rounded-lg border border-border bg-surface/95 px-2.5 py-1.5 text-xs font-semibold text-foreground shadow-card backdrop-blur hover:bg-surface-variant"
            >
              <Crosshair className="h-3.5 w-3.5" />
              Recenter
            </button>
          )}
          {/* Centre on the viewer's current location + drop the GPS marker. */}
          <button
            type="button"
            onClick={locateMe}
            disabled={locating}
            title="Centre on my location"
            className="flex items-center gap-1.5 rounded-lg border border-border bg-surface/95 px-2.5 py-1.5 text-xs font-semibold text-foreground shadow-card backdrop-blur hover:bg-surface-variant disabled:opacity-60"
          >
            {locating ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <LocateFixed className="h-3.5 w-3.5" />}
            My location
          </button>
          {defaultBounds && (
            <button
              type="button"
              onClick={() => {
                setFollowing(false);
                recenterNational();
              }}
              title="Zoom out to all of Australia"
              className="flex items-center gap-1.5 rounded-lg border border-border bg-surface/95 px-2.5 py-1.5 text-xs font-semibold text-foreground shadow-card backdrop-blur hover:bg-surface-variant"
            >
              <Globe className="h-3.5 w-3.5" />
              Australia
            </button>
          )}
        </div>
      </MapCorner>
      <FullscreenControl position="top-left" />
      <MapAttribution />
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
