import * as React from "react";
import { cn } from "@uprise/ui";

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
    </div>
  );
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
