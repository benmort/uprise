"use client";

import { useEffect, useRef } from "react";
import { useControl } from "react-map-gl/mapbox";

/** Corner to place the control in — matches the map's FullscreenControl position so the
 *  size toggle sits in the same control group, right next to the fullscreen button. */
export type MapControlPosition = "top-left" | "top-right" | "bottom-left" | "bottom-right";

// Lucide Maximize2 / Minimize2 as inline SVG (the control renders raw DOM, not React).
const ICON_ENLARGE =
  '<svg xmlns="http://www.w3.org/2000/svg" width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="#333" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round"><path d="M15 3h6v6M9 21H3v-6M21 3l-7 7M3 21l7-7"/></svg>';
const ICON_SHRINK =
  '<svg xmlns="http://www.w3.org/2000/svg" width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="#333" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round"><path d="M4 14h6v6M20 10h-6V4M14 10l7-7M3 21l7-7"/></svg>';

/** A mapbox custom control: one button, styled like the built-in controls, that toggles the
 *  map between its regular on-page size and a large one. Lives in the same control group as
 *  the FullscreenControl (native mapbox layout → no pixel-nudging to sit "next to" it). */
class SizeToggleControl {
  private container: HTMLDivElement;
  private button: HTMLButtonElement;

  constructor(private readonly onToggle: () => void) {
    this.container = document.createElement("div");
    this.container.className = "mapboxgl-ctrl mapboxgl-ctrl-group";
    this.button = document.createElement("button");
    this.button.type = "button";
    this.button.style.display = "flex";
    this.button.style.alignItems = "center";
    this.button.style.justifyContent = "center";
    this.button.addEventListener("click", (e) => {
      e.preventDefault();
      this.onToggle();
    });
    this.container.appendChild(this.button);
    this.setLarge(false);
  }

  /** Swap the icon + label to reflect the current size. */
  setLarge(large: boolean): void {
    this.button.innerHTML = large ? ICON_SHRINK : ICON_ENLARGE;
    const label = large ? "Shrink map" : "Enlarge map";
    this.button.title = label;
    this.button.setAttribute("aria-label", label);
    this.button.setAttribute("aria-pressed", String(large));
  }

  onAdd(): HTMLElement {
    return this.container;
  }

  onRemove(): void {
    this.container.parentNode?.removeChild(this.container);
  }
}

/**
 * Renders a size toggle next to the map's fullscreen button. Controlled: the parent owns the
 * `large` boolean (and applies the actual height change + `map.resize()`); this just draws the
 * button and reports clicks. Place it as a child of the map, alongside `<FullscreenControl>`,
 * with the SAME `position`.
 */
export function MapSizeControl({
  large,
  onToggle,
  position = "top-left",
}: {
  large: boolean;
  onToggle: () => void;
  position?: MapControlPosition;
}) {
  // useControl adds the control once; a stable ref feeds it the latest onToggle so the
  // control never needs re-adding when the handler identity changes.
  const onToggleRef = useRef(onToggle);
  onToggleRef.current = onToggle;
  const control = useControl<SizeToggleControl>(() => new SizeToggleControl(() => onToggleRef.current()), {
    position,
  });
  useEffect(() => {
    control.setLarge(large);
  }, [control, large]);
  return null;
}
