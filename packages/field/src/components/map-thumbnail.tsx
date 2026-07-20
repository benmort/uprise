"use client";

import * as React from "react";
import { cn } from "@uprise/ui";

const TOKEN = process.env.NEXT_PUBLIC_MAPBOX_TOKEN ?? "";
// Brand primary (Mapbox static overlays need a literal hex, can't read CSS tokens).
const PRIMARY = "#465fff";

export type MapThumbnailProps = {
  /** A turf's GeoJSON Polygon / MultiPolygon — drawn as its EXACT outline (all rings, north-up,
   *  aspect-preserving). Preferred over `polygon`; falls back to it, then a stock shape. */
  geometry?: unknown;
  /** Optional GeoJSON-ish polygon ring [[lng,lat],...] to outline; otherwise a stock shape. */
  polygon?: Array<[number, number]>;
  className?: string;
  /** When provided (e.g. a dynamically-imported TurfMap), renders instead of the SVG grid. */
  children?: React.ReactNode;
  /** Per-turf swatch (CSS hex). Given → solid outline + faint tint in that colour; omitted →
   *  the brand primary with a dashed outline (the default placeholder look). */
  color?: string;
};

const STOCK_POLYGON = "20,30 70,18 110,40 96,82 40,90 14,62";

/**
 * Lightweight map placeholder: an SVG polygon on a faint grid. Used on turf cards
 * where loading mapbox would be wasteful. Pass `children` to wrap a real TurfMap.
 */
export function MapThumbnail({ geometry, polygon, className, children, color }: MapThumbnailProps) {
  const [mapLoaded, setMapLoaded] = React.useState(false);
  const [mapError, setMapError] = React.useState(false);
  // A real map layer for the turf: a Mapbox static image (map tiles + the turf overlaid),
  // rendered OVER the hashed placeholder and faded in on load. Falls back to the placeholder
  // when there's no token, no geometry, offline (image errors), or the URL is too long.
  const mapUrl = React.useMemo(() => staticTurfMapUrl(geometry, polygon, color), [geometry, polygon, color]);

  if (children) {
    return <div className={cn("overflow-hidden rounded-xl bg-surface", className)}>{children}</div>;
  }

  // Prefer the real turf outline (geometry); else a single ring; else the stock placeholder shape.
  const path = geometry ? geometryToPath(geometry) : null;
  const points = !path && polygon && polygon.length >= 3 ? toViewBoxPoints(polygon) : null;
  const stroke = color ?? "hsl(var(--primary))";
  // Unique pattern id per colour: SVG `url(#id)` resolves the FIRST match in the document,
  // so a shared id would make every thumbnail borrow the first card's grid colour.
  const gridId = color ? `mt-grid-${color.replace(/[^a-z0-9]/gi, "")}` : "mt-grid";

  return (
    <div
      className={cn("relative overflow-hidden rounded-xl", !color && "bg-primary/10 dark:bg-primary/20", className)}
      style={color ? { backgroundColor: `${color}14` } : undefined}
    >
      {/* Grid layer — `slice` (cover) so the lines stay full-bleed to every edge of the frame. */}
      <svg
        viewBox="0 0 128 96"
        className="absolute inset-0 h-full w-full"
        preserveAspectRatio="xMidYMid slice"
        aria-hidden
      >
        <defs>
          <pattern id={gridId} width="16" height="16" patternUnits="userSpaceOnUse">
            <path d="M16 0H0V16" fill="none" stroke={stroke} strokeOpacity={0.22} strokeWidth="1" />
          </pattern>
        </defs>
        <rect width="128" height="96" fill={`url(#${gridId})`} />
      </svg>
      {/* Shape layer — `meet` (contain), on top, so the whole turf outline always fits inside the
          card (never cropped) while the grid behind it stays full-bleed. */}
      <svg viewBox="0 0 128 96" className="absolute inset-0 h-full w-full" preserveAspectRatio="xMidYMid meet">
        {path ? (
          <path
            d={path}
            fill={stroke}
            fillOpacity={0.16}
            fillRule="evenodd"
            stroke={stroke}
            strokeWidth={1.75}
            strokeLinejoin="round"
            strokeDasharray={color ? undefined : "4 3"}
          />
        ) : (
          <polygon
            points={points ?? STOCK_POLYGON}
            fill={stroke}
            fillOpacity={0.16}
            stroke={stroke}
            strokeWidth={1.75}
            strokeLinejoin="round"
            strokeDasharray={color ? undefined : "4 3"}
          />
        )}
      </svg>
      {/* Real map layer — a Mapbox static image over the placeholder, faded in on load. */}
      {mapUrl && !mapError ? (
        // eslint-disable-next-line @next/next/no-img-element
        <img
          src={mapUrl}
          alt=""
          aria-hidden
          loading="lazy"
          onLoad={() => setMapLoaded(true)}
          onError={() => setMapError(true)}
          className={cn(
            "absolute inset-0 h-full w-full object-cover transition-opacity duration-300",
            mapLoaded ? "opacity-100" : "opacity-0",
          )}
        />
      ) : null}
    </div>
  );
}

/** Close a ring if it isn't already — Mapbox expects closed polygons. */
function closeRing(ring: Array<[number, number]>): Array<[number, number]> {
  const first = ring[0];
  const last = ring[ring.length - 1];
  return first && last && (first[0] !== last[0] || first[1] !== last[1]) ? [...ring, first] : ring;
}

/** Bounding box [minLng,minLat,maxLng,maxLat] from geometry rings, else a polygon ring. */
function boundsOf(geometry: unknown, polygon?: Array<[number, number]>): [number, number, number, number] | null {
  const rings = geometry ? geometryRings(geometry) : polygon && polygon.length >= 3 ? [polygon] : [];
  const pts = rings.flat();
  if (pts.length === 0) return null;
  const lngs = pts.map((p) => p[0]);
  const lats = pts.map((p) => p[1]);
  return [Math.min(...lngs), Math.min(...lats), Math.max(...lngs), Math.max(...lats)];
}

/**
 * A Mapbox Static Images URL — real map tiles with the turf drawn as a coloured overlay,
 * auto-framed. Rendered as a plain <img> (no mapbox-gl runtime). The URL is deterministic per
 * (turf, colour), so the browser + service-worker cache it and the same image is reused wherever
 * the turf appears across the campaign. Null when there's no token or usable geometry.
 */
function staticTurfMapUrl(
  geometry: unknown,
  polygon: Array<[number, number]> | undefined,
  color?: string,
): string | null {
  if (!TOKEN) return null;
  const stroke = color ?? PRIMARY;
  const properties = { stroke, "stroke-width": 3, "stroke-opacity": 1, fill: stroke, "fill-opacity": 0.18 };

  let geom: unknown = null;
  if (geometry && typeof geometry === "object" && "type" in (geometry as object)) geom = geometry;
  else if (polygon && polygon.length >= 3) geom = { type: "Polygon", coordinates: [closeRing(polygon)] };
  if (!geom) return null;

  const build = (g: unknown) => {
    const feature = { type: "Feature", properties, geometry: g };
    const enc = encodeURIComponent(JSON.stringify(feature));
    return `https://api.mapbox.com/styles/v1/mapbox/streets-v12/static/geojson(${enc})/auto/320x224@2x?access_token=${TOKEN}&attribution=false&logo=false&padding=18`;
  };

  let url = build(geom);
  // Mapbox caps the static URL (~8192 chars). A dense turf polygon can exceed it — fall back to a
  // rectangle of the turf's bounding box (still a real map of the right area).
  if (url.length > 8000) {
    const b = boundsOf(geometry, polygon);
    if (!b) return null;
    const rect: Array<[number, number]> = [
      [b[0], b[1]], [b[2], b[1]], [b[2], b[3]], [b[0], b[3]], [b[0], b[1]],
    ];
    url = build({ type: "Polygon", coordinates: [rect] });
  }
  return url;
}

function toViewBoxPoints(polygon: Array<[number, number]>): string {
  const xs = polygon.map((p) => p[0]);
  const ys = polygon.map((p) => p[1]);
  const minX = Math.min(...xs);
  const maxX = Math.max(...xs);
  const minY = Math.min(...ys);
  const maxY = Math.max(...ys);
  const spanX = maxX - minX || 1;
  const spanY = maxY - minY || 1;
  return polygon
    .map(([x, y]) => {
      const px = 12 + ((x - minX) / spanX) * 104;
      // invert Y so north is up
      const py = 12 + (1 - (y - minY) / spanY) * 72;
      return `${px.toFixed(1)},${py.toFixed(1)}`;
    })
    .join(" ");
}

type Ring = Array<[number, number]>;

/** Every linear ring (outer + holes) of a GeoJSON Polygon / MultiPolygon, as [lng,lat] arrays. */
function geometryRings(geometry: unknown): Ring[] {
  const g = geometry as { type?: string; coordinates?: unknown } | null;
  if (!g || typeof g !== "object" || !Array.isArray(g.coordinates)) return [];
  if (g.type === "Polygon") {
    return (g.coordinates as Ring[]).filter((r) => Array.isArray(r) && r.length >= 3);
  }
  if (g.type === "MultiPolygon") {
    return (g.coordinates as Ring[][])
      .flatMap((poly) => (Array.isArray(poly) ? poly : []))
      .filter((r) => Array.isArray(r) && r.length >= 3);
  }
  return [];
}

/**
 * SVG `path` d for a turf's EXACT outline, normalised to the 128×96 viewBox. Aspect-preserving
 * (longitude scaled by cos(latitude) so the shape isn't horizontally stretched), north-up, and
 * centred in the padded 104×72 box. Multiple rings → subpaths, so holes render via `evenodd`.
 * Returns null when the geometry has no usable ring (caller falls back to the ring/stock shape).
 */
function geometryToPath(geometry: unknown): string | null {
  const rings = geometryRings(geometry);
  if (rings.length === 0) return null;
  const all = rings.flat();
  const lats = all.map((p) => p[1]);
  const midLat = (Math.min(...lats) + Math.max(...lats)) / 2;
  const kx = Math.cos((midLat * Math.PI) / 180) || 1; // lng→x correction at this latitude
  const xs = all.map((p) => p[0] * kx);
  const minX = Math.min(...xs);
  const maxX = Math.max(...xs);
  const minY = Math.min(...lats);
  const maxY = Math.max(...lats);
  const spanX = maxX - minX || 1;
  const spanY = maxY - minY || 1;
  const scale = Math.min(104 / spanX, 72 / spanY);
  const offX = 12 + (104 - spanX * scale) / 2;
  const offY = 12 + (72 - spanY * scale) / 2;
  return rings
    .map((ring) => {
      const pts = ring.map(([lng, lat]) => {
        const px = offX + (lng * kx - minX) * scale;
        const py = offY + (maxY - lat) * scale; // flip Y so north is up
        return `${px.toFixed(1)},${py.toFixed(1)}`;
      });
      return `M${pts.join("L")}Z`;
    })
    .join(" ");
}
