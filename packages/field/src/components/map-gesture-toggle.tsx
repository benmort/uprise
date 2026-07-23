"use client";

import { useLocalStorage } from "../hooks/use-local-storage";

/** Persisted, cross-map preference: when true, plain scroll zooms the map (Mapbox's
 *  cooperative-gestures "⌘ + scroll" requirement is turned off). Off by default so the
 *  page still scrolls past a map until the canvasser/organiser opts in. */
const SCROLL_ZOOM_KEY = "uprise.map.scrollZoom";

/** Read/write the scroll-to-zoom preference. Every map shares the one localStorage key,
 *  so ticking it on any map applies everywhere. */
export function useScrollToZoom() {
  return useLocalStorage<boolean>(SCROLL_ZOOM_KEY, false);
}

/**
 * The small on-map checkbox that sits under Mapbox's "Use ⌘ + scroll to zoom" notice.
 * Ticking it flips the shared preference so scrolling zooms directly — no modifier held.
 * Position-agnostic: it renders as a self-sized pill; the caller places it (drop it inside a
 * `<MapCorner corner="top-right">` per the shared map-placement scheme).
 */
export function MapGestureToggle({ className }: { className?: string }) {
  const [scrollZoom, setScrollZoom] = useScrollToZoom();
  return (
    <label
      className={`flex cursor-pointer select-none items-center gap-1.5 rounded-lg border border-border bg-surface/95 px-2 py-1 text-[11px] font-semibold text-foreground shadow-card backdrop-blur ${className ?? ""}`}
      title="Scroll to zoom the map without holding ⌘/Ctrl"
    >
      <input
        type="checkbox"
        checked={scrollZoom}
        onChange={(e) => setScrollZoom(e.target.checked)}
        className="h-3.5 w-3.5 accent-primary"
      />
      Scroll to zoom
    </label>
  );
}
