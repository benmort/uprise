"use client";

import type { ReactNode } from "react";
import { AttributionControl } from "react-map-gl/mapbox";
import { cn } from "@uprise/ui";

/**
 * Shared map-chrome primitives — the ONE source of truth for where on-map UI sits, so every
 * uprise map places controls the same way (they used to drift per-map). The scheme:
 *   top-left  — view controls (Fullscreen → Enlarge → Draw), via each control's own `position`
 *   top-right — context/actions: Scroll-to-zoom → Recentre → Areas search (a `MapCorner`)
 *   bottom-left  — informational: legends, hover readouts (a `MapCorner`)
 *   bottom-right — Mapbox ONLY: the compact ⓘ attribution + wordmark (`MapAttribution`)
 */

/**
 * The compact Mapbox attribution (ⓘ) pinned bottom-right. `compact` forces the collapsed ⓘ on
 * every viewport (react-map-gl v8 only auto-collapses ≤640px). Pair with `logoPosition="bottom-right"`
 * on the <Map> (and do NOT hide `.mapboxgl-ctrl-logo`) so the ⓘ + wordmark are the sole Mapbox
 * chrome, together in one corner — the minimal footprint the Mapbox ToS allows (both must stay visible).
 */
export function MapAttribution() {
  return <AttributionControl compact position="bottom-right" />;
}

const CORNER_POS: Record<string, string> = {
  "top-left": "left-2 top-2 items-start",
  "top-right": "right-2 top-2 items-end",
  "bottom-left": "bottom-2 left-2 items-start",
  "bottom-right": "bottom-2 right-2 items-end",
};

/**
 * A positioned overlay slot for app controls on a map — an absolutely-positioned `z-10` flex
 * column at one corner, with a consistent inset + gap. The wrapper is `pointer-events-none` so
 * the gaps between stacked children never swallow map drags; each direct child re-enables
 * pointer events. Bottom-right is reserved for `MapAttribution`, so don't use it here.
 */
export function MapCorner({
  corner,
  className,
  children,
}: {
  corner: "top-left" | "top-right" | "bottom-left" | "bottom-right";
  className?: string;
  children: ReactNode;
}) {
  return (
    <div
      className={cn(
        "pointer-events-none absolute z-10 flex flex-col gap-1.5 [&>*]:pointer-events-auto",
        CORNER_POS[corner],
        className,
      )}
    >
      {children}
    </div>
  );
}
