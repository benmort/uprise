"use client";

import { createContext, useCallback, useContext, useEffect } from "react";
import { usePathname, useSearchParams } from "next/navigation";
import { useLocalStorage, type WalkMode } from "@uprise/field";

/**
 * The (geo) layout owns the tab row; the Areas map view owns its own search
 * combobox (state lives inside TurfDrawMap). This context hands the page the
 * layout's tab-row slot element so the map's Areas|Places + search box can
 * portal UP onto the tab row — matching where the shared search sits on the
 * other kinds. Null when the current view has no slot (any non-areas-map view).
 */
export const GeoTabRowSlotContext = createContext<HTMLElement | null>(null);
export function useGeoTabRowSlot(): HTMLElement | null {
  return useContext(GeoTabRowSlotContext);
}

/**
 * The one URL-state contract for the geo explorer (divisions/areas/addresses),
 * replacing three divergent schemes (hash-only, ?layer=-read/#hash-write
 * mismatch, and none): `?q=` search, `?view=list|map`, `?tab=` sub-level.
 *
 * Writes use native `window.history.replaceState` – Next 14.2 syncs it into
 * `useSearchParams` with NO server round-trip (a `router.replace` here would
 * re-fetch the RSC payload on every debounced keystroke). Kind switches are
 * real navigations (prefetching <Link>s in the shell chrome).
 *
 * View precedence: valid `?view=` wins (shareable links behave) → the page's
 * per-kind localStorage default → "map". A USER toggle writes both; merely
 * loading a `?view=map` link never rewrites someone's saved default.
 */

export type GeoExplorerKind = "divisions" | "states" | "areas" | "addresses";

/** The layout's view toggle persists the per-kind default through this event so
 *  the page hook stays the ONE localStorage writer (a direct setItem from the
 *  layout would desync the hook's in-memory state until the next remount). */
export const GEO_VIEW_PERSIST_EVENT = "uprise:geo-view-persist";

export function kindFromPathname(pathname: string | null): GeoExplorerKind | null {
  const p = pathname ?? "";
  if (p === "/data/divisions") return "divisions";
  if (p === "/data/states") return "states";
  if (p === "/data/areas") return "areas";
  if (p === "/data/addresses") return "addresses";
  return null;
}

/** Query-param write that PRESERVES the hash – legacy #federal-style deep
 *  links must survive the mount-time ?view seeding that runs before the
 *  hash→?tab mapping effect reads them. */
export function writeGeoParam(key: string, value: string | null): void {
  const url = new URL(window.location.href);
  if (value === null || value === "") url.searchParams.delete(key);
  else url.searchParams.set(key, value);
  window.history.replaceState(null, "", url.pathname + url.search + url.hash);
}

/** Read+write `?q=` / `?tab=` / `?view=` on the current explorer route. */
export function useGeoExplorerUrlState(opts?: {
  /** localStorage key for the view default (per kind); omit = no persistence. */
  viewStorageKey?: string;
  /** Legacy deep-link aliases mapped into ?tab= on mount (e.g. #federal → ced). */
  legacyHashToTab?: Record<string, string>;
  /** Legacy query param read as ?tab= when ?tab= is absent (areas' old ?layer=). */
  legacyTabParam?: string;
}) {
  const searchParams = useSearchParams();
  const pathname = usePathname();
  const [storedView, setStoredView] = useLocalStorage<WalkMode>(
    opts?.viewStorageKey ?? "uprise.geoView.unused",
    "map",
  );

  const q = searchParams.get("q") ?? "";
  const rawView = searchParams.get("view");
  const view: WalkMode =
    rawView === "map" || rawView === "list" ? rawView : opts?.viewStorageKey ? storedView : "map";
  const tab = searchParams.get("tab") ?? (opts?.legacyTabParam ? searchParams.get(opts.legacyTabParam) : null);
  // Shared state filter (abbreviation, e.g. "NSW") + the areas "Places" search
  // toggle — both round-trip the URL so the filter carries across kinds/reload.
  const state = searchParams.get("state") ?? "";
  const places = searchParams.get("places") === "1";

  // Seed the resolved default INTO the URL once, so the (persistent) layout
  // chrome and this page always agree on the view via the URL alone.
  useEffect(() => {
    if (!rawView && opts?.viewStorageKey) {
      writeGeoParam("view", storedView);
    }
    // Mount-time only – later view changes go through setView.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // Legacy hash deep-links (#federal → ?tab=ced) keep old bookmarks working.
  useEffect(() => {
    const aliases = opts?.legacyHashToTab;
    if (!aliases) return;
    const hash = window.location.hash.replace(/^#/, "");
    if (hash && aliases[hash] && !searchParams.get("tab")) {
      const url = new URL(window.location.href);
      url.searchParams.set("tab", aliases[hash]);
      url.hash = "";
      window.history.replaceState(null, "", url.pathname + url.search);
    }
    // Run once per mount – the hash only matters at entry.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [pathname]);

  // The layout's toggle signals deliberate persists here (see the event doc).
  useEffect(() => {
    if (!opts?.viewStorageKey) return;
    const onPersist = (e: Event) => {
      const detail = (e as CustomEvent<{ key: string; value: WalkMode }>).detail;
      if (detail?.key === opts.viewStorageKey && (detail.value === "map" || detail.value === "list")) {
        setStoredView(detail.value);
      }
    };
    window.addEventListener(GEO_VIEW_PERSIST_EVENT, onPersist);
    return () => window.removeEventListener(GEO_VIEW_PERSIST_EVENT, onPersist);
  }, [opts?.viewStorageKey, setStoredView]);

  const setQ = useCallback((value: string) => writeGeoParam("q", value || null), []);
  const setTab = useCallback((value: string) => writeGeoParam("tab", value), []);
  const setState = useCallback((value: string) => writeGeoParam("state", value || null), []);
  const setPlaces = useCallback((value: boolean) => writeGeoParam("places", value ? "1" : null), []);
  const setView = useCallback(
    (value: WalkMode, opts2?: { persist?: boolean }) => {
      writeGeoParam("view", value);
      // Only a deliberate user toggle updates the saved default.
      if (opts2?.persist !== false) setStoredView(value);
    },
    [setStoredView],
  );

  return { q, view, tab, state, places, setQ, setTab, setState, setPlaces, setView };
}
