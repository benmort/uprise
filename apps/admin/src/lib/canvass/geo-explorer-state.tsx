"use client";

import { createContext, useCallback, useContext, useMemo, useState, type ReactNode } from "react";
import type { AreaHit, DivisionType, NearbyAddress, TurfUniverse } from "@/lib/api/geo";
import type { SelectedArea } from "@/components/canvass/turf-draw-map";

/** A Mapbox forward-geocoding hit (AU, address-biased) — the Addresses kind's picked
 *  point. Shared here (was local to the addresses page) so it survives a kind switch. */
export type GeocodeHit = {
  id: string;
  label: string;
  context: string;
  lat: number;
  lng: number;
};

export type DivisionSelection = { type: DivisionType; code: string } | null;

/**
 * Durable state for the unified geo explorer (Phase 2). Mounted by the `(geo)`
 * layout, inside `TurfBasketProvider`, so it spans all four kinds and survives a
 * kind switch — the map/panels move into the always-mounted layout, but React
 * state that used to live in each page would otherwise be lost when the panel
 * cross-fades. Only holds what's genuinely lost + needed by the map or panels;
 * everything already carried by the URL (`?q/?view/?tab/?state/?code`) or the
 * `useApi` module cache stays out.
 */
type GeoExplorerValue = {
  // Shared "who to include" (unifies the 4 per-page copies).
  universe: TurfUniverse;
  setUniverse: (u: TurfUniverse) => void;

  // Divisions: the picked division (its detail is re-fetched from the useApi cache).
  divisionSelected: DivisionSelection;
  setDivisionSelected: (sel: DivisionSelection) => void;

  // Areas: the on-map selection + drawn polygons + the viewport "in view" list.
  selectedAreas: SelectedArea[];
  setSelectedAreas: (areas: SelectedArea[]) => void;
  toggleSelectedArea: (area: SelectedArea) => void;
  drawnPolygons: GeoJSON.Polygon[];
  setDrawnPolygons: (polys: GeoJSON.Polygon[]) => void;
  clearToken: number;
  bumpClearToken: () => void;
  viewportAreas: AreaHit[];
  viewTooZoomed: boolean;
  setViewportAreas: (areas: AreaHit[], tooZoomed: boolean) => void;

  // Addresses: the plotted point + the nearest-door fan-out around it.
  picked: GeocodeHit | null;
  setPicked: (hit: GeocodeHit | null) => void;
  doors: NearbyAddress[];
  setDoors: (doors: NearbyAddress[]) => void;
  activePid: string;
  setActivePid: (pid: string) => void;
};

const GeoExplorerContext = createContext<GeoExplorerValue | null>(null);

export function GeoExplorerProvider({ children }: { children: ReactNode }) {
  const [universe, setUniverse] = useState<TurfUniverse>("hybrid");
  const [divisionSelected, setDivisionSelected] = useState<DivisionSelection>(null);
  const [selectedAreas, setSelectedAreas] = useState<SelectedArea[]>([]);
  const [drawnPolygons, setDrawnPolygons] = useState<GeoJSON.Polygon[]>([]);
  const [clearToken, setClearToken] = useState(0);
  const [viewportAreas, setViewportAreasState] = useState<AreaHit[]>([]);
  const [viewTooZoomed, setViewTooZoomed] = useState(false);
  const [picked, setPicked] = useState<GeocodeHit | null>(null);
  const [doors, setDoors] = useState<NearbyAddress[]>([]);
  const [activePid, setActivePid] = useState("");

  const toggleSelectedArea = useCallback((area: SelectedArea) => {
    setSelectedAreas((cur) => {
      const i = cur.findIndex((a) => a.level === area.level && a.code === area.code);
      return i === -1 ? [...cur, area] : cur.filter((_, j) => j !== i);
    });
  }, []);
  const bumpClearToken = useCallback(() => setClearToken((t) => t + 1), []);
  const setViewportAreas = useCallback((areas: AreaHit[], tooZoomed: boolean) => {
    setViewportAreasState(areas);
    setViewTooZoomed(tooZoomed);
  }, []);

  const value = useMemo<GeoExplorerValue>(
    () => ({
      universe,
      setUniverse,
      divisionSelected,
      setDivisionSelected,
      selectedAreas,
      setSelectedAreas,
      toggleSelectedArea,
      drawnPolygons,
      setDrawnPolygons,
      clearToken,
      bumpClearToken,
      viewportAreas,
      viewTooZoomed,
      setViewportAreas,
      picked,
      setPicked,
      doors,
      setDoors,
      activePid,
      setActivePid,
    }),
    [
      universe,
      divisionSelected,
      selectedAreas,
      toggleSelectedArea,
      drawnPolygons,
      clearToken,
      bumpClearToken,
      viewportAreas,
      viewTooZoomed,
      setViewportAreas,
      picked,
      doors,
      activePid,
    ],
  );

  return <GeoExplorerContext.Provider value={value}>{children}</GeoExplorerContext.Provider>;
}

export function useGeoExplorer(): GeoExplorerValue {
  const ctx = useContext(GeoExplorerContext);
  if (!ctx) throw new Error("useGeoExplorer must be used within a GeoExplorerProvider");
  return ctx;
}
