import * as React from "react";
import { cn } from "@uprise/ui";

export type MapThumbnailProps = {
  /** Optional GeoJSON-ish polygon ring [[lng,lat],...] to outline; otherwise a stock shape. */
  polygon?: Array<[number, number]>;
  className?: string;
  /** When provided (e.g. a dynamically-imported TurfMap), renders instead of the SVG grid. */
  children?: React.ReactNode;
};

const STOCK_POLYGON = "20,30 70,18 110,40 96,82 40,90 14,62";

/**
 * Lightweight map placeholder: an SVG polygon on a faint grid. Used on turf cards
 * where loading mapbox would be wasteful. Pass `children` to wrap a real TurfMap.
 */
export function MapThumbnail({ polygon, className, children }: MapThumbnailProps) {
  if (children) {
    return <div className={cn("overflow-hidden rounded-xl bg-surface", className)}>{children}</div>;
  }

  const points = polygon && polygon.length >= 3 ? toViewBoxPoints(polygon) : STOCK_POLYGON;

  return (
    <div className={cn("relative overflow-hidden rounded-xl bg-primary/10 dark:bg-primary/20", className)}>
      <svg viewBox="0 0 128 96" className="h-full w-full" preserveAspectRatio="xMidYMid slice">
        <defs>
          <pattern id="mt-grid" width="16" height="16" patternUnits="userSpaceOnUse">
            <path d="M16 0H0V16" fill="none" stroke="hsl(var(--primary) / 0.22)" strokeWidth="1" />
          </pattern>
        </defs>
        <rect width="128" height="96" fill="url(#mt-grid)" />
        <polygon
          points={points}
          fill="hsl(var(--primary) / 0.18)"
          stroke="hsl(var(--primary))"
          strokeWidth="1.5"
          strokeDasharray="4 3"
        />
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
