"use client";

import { createContext, useCallback, useContext, useEffect, useMemo, useState } from "react";
import type { AreaLevel, TurfDivisionType } from "@/lib/api/geo";

/**
 * The cross-tab "my turf" basket: divisions, ASGS areas, drawn polygons and
 * individually-picked G-NAF doors accumulated across the Divisions/States/Areas/
 * Addresses explorers, then cut into ONE turf. Persisted to localStorage so it
 * survives reloads and tab switches; the (geo) layout mounts the provider so the
 * basket spans all kinds. Client-only — no server draft.
 *
 * Containment dedup: the basket understands the geo tree. Adding a whole STATE
 * drops (and blocks) everything contained in it; adding a coarser ASGS area drops
 * the finer areas it now covers. Each item carries its `stateDigit` (the ASGS
 * state digit — the leading digit of every area/state code) as the cover key.
 */

export type BasketDivision = { type: TurfDivisionType; code: string; name: string; stateDigit?: string };
export type BasketArea = { level: AreaLevel; code: string; name: string };
export type BasketAddress = { gnafPid: string; label: string; lat: number; lng: number; stateDigit?: string };

export type TurfBasket = {
  divisions: BasketDivision[];
  areas: BasketArea[];
  polygons: GeoJSON.Polygon[];
  addresses: BasketAddress[];
};

/** What to test for containment coverage before adding. */
export type CoverCandidate =
  | { kind: "area"; level: AreaLevel; code: string }
  | { kind: "division"; type: TurfDivisionType; code: string; stateDigit?: string }
  | { kind: "address"; stateDigit?: string };

const EMPTY: TurfBasket = { divisions: [], areas: [], polygons: [], addresses: [] };
const STORAGE_KEY = "uprise.turfBasket";

/** The ASGS state digit an area/state code belongs to (leading digit). */
const digitOf = (code: string) => code.slice(0, 1);
/** ASGS codes strict-prefix-nest (SA1 ⊃ SA2 ⊃ SA3 ⊃ SA4), so a coarser area
 *  (shorter code) covers a finer one whose code starts with it. */
const areaCovers = (coarser: string, finer: string) =>
  coarser.length < finer.length && finer.startsWith(coarser);

type TurfBasketContextValue = {
  basket: TurfBasket;
  count: number;
  addDivision: (d: BasketDivision) => void;
  removeDivision: (type: TurfDivisionType, code: string) => void;
  hasDivision: (type: TurfDivisionType, code: string) => boolean;
  toggleArea: (a: BasketArea) => void;
  removeArea: (level: AreaLevel, code: string) => void;
  hasArea: (level: AreaLevel, code: string) => boolean;
  setPolygons: (polygons: GeoJSON.Polygon[]) => void;
  addAddress: (a: BasketAddress) => void;
  removeAddress: (gnafPid: string) => void;
  hasAddress: (gnafPid: string) => boolean;
  /** The name of the basketed region that already covers this candidate, else null. */
  coveredBy: (candidate: CoverCandidate) => string | null;
  clear: () => void;
};

const TurfBasketContext = createContext<TurfBasketContextValue | null>(null);

export function TurfBasketProvider({ children }: { children: React.ReactNode }) {
  const [basket, setBasket] = useState<TurfBasket>(EMPTY);

  // Hydrate after mount only (SSR renders EMPTY → no hydration mismatch).
  useEffect(() => {
    try {
      const raw = window.localStorage.getItem(STORAGE_KEY);
      if (raw) setBasket({ ...EMPTY, ...(JSON.parse(raw) as Partial<TurfBasket>) });
    } catch {
      /* private mode / bad JSON — start empty */
    }
  }, []);

  useEffect(() => {
    try {
      window.localStorage.setItem(STORAGE_KEY, JSON.stringify(basket));
    } catch {
      /* storage unavailable — the in-memory basket still works this session */
    }
  }, [basket]);

  const addDivision = useCallback((d: BasketDivision) => {
    setBasket((b) => {
      if (d.type === "ste") {
        // A whole state absorbs everything contained in it.
        const digit = d.code;
        const areas = b.areas.filter((a) => digitOf(a.code) !== digit);
        const addresses = b.addresses.filter((a) => a.stateDigit !== digit);
        const divisions = b.divisions.filter((x) => !(x.type !== "ste" && x.stateDigit === digit));
        if (divisions.some((x) => x.type === "ste" && x.code === digit)) {
          return { ...b, areas, addresses, divisions };
        }
        return { ...b, areas, addresses, divisions: [...divisions, { ...d, stateDigit: digit }] };
      }
      // Electoral/LGA: blocked if a basketed state already covers it, or a dup.
      if (d.stateDigit && b.divisions.some((x) => x.type === "ste" && x.code === d.stateDigit)) return b;
      if (b.divisions.some((x) => x.type === d.type && x.code === d.code)) return b;
      return { ...b, divisions: [...b.divisions, d] };
    });
  }, []);
  const removeDivision = useCallback((type: TurfDivisionType, code: string) => {
    setBasket((b) => ({ ...b, divisions: b.divisions.filter((x) => !(x.type === type && x.code === code)) }));
  }, []);
  const hasDivision = useCallback(
    (type: TurfDivisionType, code: string) => basket.divisions.some((x) => x.type === type && x.code === code),
    [basket.divisions],
  );

  const toggleArea = useCallback((a: BasketArea) => {
    setBasket((b) => {
      const key = `${a.level}:${a.code}`;
      const exists = b.areas.some((x) => `${x.level}:${x.code}` === key);
      if (exists) return { ...b, areas: b.areas.filter((x) => `${x.level}:${x.code}` !== key) };
      // Blocked if a basketed state or a coarser basket area already covers it.
      if (b.divisions.some((x) => x.type === "ste" && x.code === digitOf(a.code))) return b;
      if (b.areas.some((x) => areaCovers(x.code, a.code))) return b;
      // Adding a coarser area drops the finer basket areas it now covers.
      const areas = b.areas.filter((x) => !areaCovers(a.code, x.code));
      return { ...b, areas: [...areas, a] };
    });
  }, []);
  const removeArea = useCallback((level: AreaLevel, code: string) => {
    setBasket((b) => ({ ...b, areas: b.areas.filter((x) => !(x.level === level && x.code === code)) }));
  }, []);
  const hasArea = useCallback(
    (level: AreaLevel, code: string) => basket.areas.some((x) => x.level === level && x.code === code),
    [basket.areas],
  );

  const setPolygons = useCallback((polygons: GeoJSON.Polygon[]) => {
    setBasket((b) => ({ ...b, polygons }));
  }, []);

  const addAddress = useCallback((a: BasketAddress) => {
    setBasket((b) => {
      if (b.addresses.some((x) => x.gnafPid === a.gnafPid)) return b;
      if (a.stateDigit && b.divisions.some((x) => x.type === "ste" && x.code === a.stateDigit)) return b;
      return { ...b, addresses: [...b.addresses, a] };
    });
  }, []);
  const removeAddress = useCallback((gnafPid: string) => {
    setBasket((b) => ({ ...b, addresses: b.addresses.filter((x) => x.gnafPid !== gnafPid) }));
  }, []);
  const hasAddress = useCallback((gnafPid: string) => basket.addresses.some((x) => x.gnafPid === gnafPid), [basket.addresses]);

  const coveredBy = useCallback(
    (c: CoverCandidate): string | null => {
      const digit =
        c.kind === "area" ? digitOf(c.code) : c.kind === "division" ? (c.type === "ste" ? c.code : c.stateDigit) : c.stateDigit;
      // Covered by a basketed whole state? (A state candidate isn't covered by itself.)
      if (digit && !(c.kind === "division" && c.type === "ste")) {
        const st = basket.divisions.find((d) => d.type === "ste" && d.code === digit);
        if (st) return st.name;
      }
      // An area covered by a coarser basket area?
      if (c.kind === "area") {
        const coarser = basket.areas.find((a) => areaCovers(a.code, c.code));
        if (coarser) return coarser.name;
      }
      return null;
    },
    [basket.divisions, basket.areas],
  );

  const clear = useCallback(() => setBasket(EMPTY), []);

  const count =
    basket.divisions.length + basket.areas.length + basket.polygons.length + basket.addresses.length;

  const value = useMemo<TurfBasketContextValue>(
    () => ({
      basket,
      count,
      addDivision,
      removeDivision,
      hasDivision,
      toggleArea,
      removeArea,
      hasArea,
      setPolygons,
      addAddress,
      removeAddress,
      hasAddress,
      coveredBy,
      clear,
    }),
    [
      basket,
      count,
      addDivision,
      removeDivision,
      hasDivision,
      toggleArea,
      removeArea,
      hasArea,
      setPolygons,
      addAddress,
      removeAddress,
      hasAddress,
      coveredBy,
      clear,
    ],
  );

  return <TurfBasketContext.Provider value={value}>{children}</TurfBasketContext.Provider>;
}

export function useTurfBasket(): TurfBasketContextValue {
  const ctx = useContext(TurfBasketContext);
  if (!ctx) throw new Error("useTurfBasket must be used within a TurfBasketProvider");
  return ctx;
}
