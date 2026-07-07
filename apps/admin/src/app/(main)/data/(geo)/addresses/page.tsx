"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import dynamic from "next/dynamic";
import { Check, LocateFixed, MapPin, Plus, Scissors, Search, UserCheck } from "lucide-react";
import { Spinner } from "@uprise/ui";
import { createTurfFromSources, nearbyAddresses, type NearbyAddress } from "@/lib/api/geo";
import { useCutTurf } from "@/lib/canvass/use-cut-turf";
import { useGeoExplorerUrlState } from "@/components/canvass/use-geo-explorer-url-state";
import { stateBounds } from "@/lib/canvass/states";
import { useTurfBasket } from "@/lib/canvass/turf-basket";
import { MyTurfPanel } from "@/components/canvass/my-turf-panel";
import { RegionHierarchy } from "@/components/canvass/region-hierarchy";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import { EmptyState } from "@/components/ui/empty-state";
import { Card, CardContent } from "@/components/ui/card";
import { cn } from "@/lib/utils";
import { AU_BOUNDS, SectionCard } from "@uprise/field";

// mapbox-gl touches window: keep it out of SSR (same as the areas/divisions pages).
const TurfMap = dynamic(() => import("@uprise/field").then((m) => m.TurfMap), {
  ssr: false,
  loading: () => <Skeleton className="h-full w-full" />,
});

/** A Mapbox forward-geocoding hit (AU, address-biased). */
type GeocodeHit = {
  id: string;
  label: string;
  context: string;
  lat: number;
  lng: number;
};

const MAPBOX_TOKEN = process.env.NEXT_PUBLIC_MAPBOX_TOKEN ?? "";

/** Live forward-geocode via Mapbox (the search half; our G-NAF is the data half –
 *  national labels don't carry street names, so free-text search rides Mapbox). */
async function geocode(q: string): Promise<GeocodeHit[]> {
  const url =
    `https://api.mapbox.com/geocoding/v5/mapbox.places/${encodeURIComponent(q)}.json` +
    `?access_token=${encodeURIComponent(MAPBOX_TOKEN)}&country=au&types=address,postcode,locality,place&autocomplete=true&limit=8`;
  const res = await fetch(url);
  if (!res.ok) throw new Error(`Address search failed (${res.status})`);
  const body = (await res.json()) as {
    features?: Array<{ id: string; place_name?: string; text?: string; center?: [number, number] }>;
  };
  return (body.features ?? [])
    .filter((f) => Array.isArray(f.center))
    .map((f) => {
      const [lng, lat] = f.center as [number, number];
      const label = f.text ?? f.place_name ?? "";
      const context = (f.place_name ?? "").replace(`${label}, `, "");
      return { id: f.id, label: f.place_name ?? label, context, lat, lng };
    });
}

// Common AU street-type abbreviations for the compact door label.
const STREET_TYPE_ABBR: Record<string, string> = {
  street: "St", road: "Rd", avenue: "Ave", lane: "Ln", drive: "Dr", court: "Ct",
  place: "Pl", crescent: "Cres", parade: "Pde", terrace: "Tce", boulevard: "Blvd",
  highway: "Hwy", close: "Cl", circuit: "Cct", esplanade: "Esp", way: "Way",
  grove: "Grove", walk: "Walk", crest: "Crest", rise: "Rise", square: "Sq",
};

const titleCase = (s: string) =>
  s.replace(/\w\S*/g, (w) => w.charAt(0).toUpperCase() + w.slice(1).toLowerCase());

/**
 * Compact door label — "17 Fulham St · 2042" — from a G-NAF `address_label` or a
 * geocode label. Takes the street segment (before the first comma, or the "·" in
 * the minimal national load), title-cases it, abbreviates the trailing street
 * type, and appends the postcode. NB: when the loaded `address_label` is only
 * "number · postcode" (the minimal G-NAF load), there is no street to show and it
 * passes the number through — richer labels need a G-NAF load with STREET_LOCALITY.
 */
function formatDoorLabel(raw: string): string {
  const postcode = raw.match(/\b\d{4}\b/)?.[0] ?? null;
  const head = (raw.includes(",") ? raw.split(",")[0] : raw.split("·")[0])
    .trim()
    .replace(/\s+\d{4}$/, "")
    .trim();
  let street = head;
  if (/[A-Za-z]/.test(head)) {
    const words = titleCase(head).split(/\s+/).filter(Boolean);
    const lastKey = words[words.length - 1]?.toLowerCase();
    if (lastKey && STREET_TYPE_ABBR[lastKey]) words[words.length - 1] = STREET_TYPE_ABBR[lastKey];
    street = words.join(" ");
  }
  return postcode && street && street !== postcode ? `${street} · ${postcode}` : street || raw;
}

/**
 * Addresses explorer panel. Chrome (kind switcher, search box, view toggle)
 * lives in the persistent (geo) layout; this page reads ?q/?view – which is
 * exactly what makes the search term survive list↔map flips and reloads.
 */
export default function AddressesPage() {
  const { q, view, state, setView } = useGeoExplorerUrlState({
    viewStorageKey: "uprise.addressesView",
  });
  // The shared State Filter frames the map to the picked state.
  const focusBounds = stateBounds(state);
  const { addAddress, hasAddress, removeAddress, coveredBy } = useTurfBasket();
  // Direct single-door cut (parity with the other kinds' "cut from this row"); the
  // basket path (MyTurfPanel) handles multi-door + campaign assignment.
  const { cutTurf, busy } = useCutTurf("hybrid");

  // ── List mode: live geocode over ?q (the layout already debounced the write) ─
  const [hits, setHits] = useState<GeocodeHit[]>([]);
  const [searching, setSearching] = useState(false);
  const [error, setError] = useState("");

  // ── Map mode: the picked point + the nearest real doors around it ──────────
  const [picked, setPicked] = useState<GeocodeHit | null>(null);
  const [doors, setDoors] = useState<NearbyAddress[]>([]);
  const [loadingDoors, setLoadingDoors] = useState(false);
  const [doorsError, setDoorsError] = useState("");
  const [doorsDenied, setDoorsDenied] = useState(false);
  const [activePid, setActivePid] = useState<string>("");

  const trimmed = q.trim();

  // Guards the map-view auto-plot: the q we last plotted, so a rerun (or the
  // list→map flip after a manual pick) doesn't re-plot / override. Set on both an
  // auto-plot and a manual pick; a ref lets pick() read the live q without a dep.
  const autoPlottedQ = useRef("");
  const trimmedRef = useRef(trimmed);
  trimmedRef.current = trimmed;

  // Picking a hit plots it + fans out to the nearest G-NAF doors. The flip to
  // map view goes through the URL (persist:false – a programmatic flip must not
  // overwrite the user's saved default view; in map view it's already a no-op).
  const pick = useCallback(
    async (hit: GeocodeHit) => {
      // A manual pick counts as plotting the current q, so the map-view geocode
      // effect below won't override it with the top hit on its next run.
      autoPlottedQ.current = trimmedRef.current;
      setPicked(hit);
      setView("map", { persist: false });
      setActivePid("");
      setDoors([]);
      setDoorsError("");
      setDoorsDenied(false);
      setLoadingDoors(true);
      const res = await nearbyAddresses(hit.lat, hit.lng, 30);
      setLoadingDoors(false);
      if (res.ok) {
        setDoors(res.data);
      } else {
        setDoorsError(res.error);
        setDoorsDenied(res.status === 403);
      }
    },
    [setView],
  );

  // Live geocode over the shared ?q (the layout owns the ONE 250ms debounce).
  // Runs in BOTH views: list shows the hits to pick from; map has no result list,
  // so it auto-plots the top hit — which is what makes a typed query in the
  // default (map) view, or a shared ?view=map&q=… link, resolve to doors without
  // a manual pick. autoPlottedQ stops the same term re-plotting on every rerun.
  useEffect(() => {
    if (trimmed.length < 3) {
      setHits([]);
      setError("");
      autoPlottedQ.current = "";
      return;
    }
    if (!MAPBOX_TOKEN) {
      setHits([]);
      setError("Set NEXT_PUBLIC_MAPBOX_TOKEN to enable address search.");
      return;
    }
    let alive = true;
    setSearching(true);
    void (async () => {
      try {
        const results = await geocode(trimmed);
        if (!alive) return;
        setHits(results);
        setError("");
        if (view === "map" && results.length > 0 && autoPlottedQ.current !== trimmed) {
          autoPlottedQ.current = trimmed;
          void pick(results[0]);
        }
      } catch (err) {
        if (!alive) return;
        setHits([]);
        setError(String(err instanceof Error ? err.message : err));
      }
      if (alive) setSearching(false);
    })();
    return () => {
      alive = false;
    };
  }, [trimmed, view, pick]);

  const stops = useMemo(
    () =>
      doors.map((d) => ({
        id: d.gnafPid,
        lat: d.lat,
        lng: d.lng,
        // Green = already a contact; primary = cold door (TurfMap's status palette).
        status: d.hasContact ? "VISITED" : "PENDING",
      })),
    [doors],
  );
  const active = doors.find((d) => d.gnafPid === activePid) ?? null;

  if (view === "map") {
    return (
      <div className="section-stack">
        {error ? (
          <p className="rounded-lg bg-warning-container px-3 py-2 text-sm font-medium text-warning-foreground">
            {error}
          </p>
        ) : null}
        <div className="grid gap-4 lg:grid-cols-[1fr_320px]">
          <div className="relative h-[65vh] overflow-hidden rounded-2xl border border-border">
            <TurfMap
              mode="view"
              stops={stops}
              activeStopId={activePid || undefined}
              userPosition={picked ? { lat: picked.lat, lng: picked.lng } : undefined}
              focusPoint={picked ? { lat: picked.lat, lng: picked.lng } : null}
              onStopTap={(id) => setActivePid(activePid === id ? "" : id)}
              defaultBounds={AU_BOUNDS}
              focusBounds={focusBounds}
            />
            {!picked && (
              <div className="pointer-events-none absolute inset-x-0 bottom-3 z-10 flex justify-center">
                <span className="rounded-lg border border-border bg-surface/95 px-3 py-1.5 text-xs font-medium text-muted-foreground shadow-card backdrop-blur">
                  Search an address above, then pick a result to plot it here.
                </span>
              </div>
            )}
          </div>

          <div className="space-y-4">
            <SectionCard title="Searched address">
              {picked ? (
                <>
                  <div className="flex items-start gap-2.5">
                    <MapPin className="mt-0.5 h-5 w-5 shrink-0 text-primary" />
                    <p className="text-lg font-bold leading-snug text-foreground">{picked.label}</p>
                  </div>
                  <p className="mt-2 text-xs text-muted-foreground tabular-nums">
                    {picked.lat.toFixed(5)}, {picked.lng.toFixed(5)}
                  </p>
                  <Button
                    variant="outline"
                    size="sm"
                    className="mt-3 w-full"
                    onClick={() => setView("list", { persist: false })}
                  >
                    <Search className="mr-1.5 h-3.5 w-3.5" />
                    Back to results
                  </Button>
                </>
              ) : (
                <p className="text-sm text-muted-foreground">Nothing plotted yet.</p>
              )}
            </SectionCard>

            {active ? (
              <SectionCard title="Selected door">
                <p className="text-sm font-semibold text-foreground">{active.address}</p>
                <ul className="mt-2 space-y-1 text-xs text-muted-foreground">
                  <li className="tabular-nums">{active.distanceM.toLocaleString()} m from the pin</li>
                  {active.hasContact ? (
                    <li className="flex items-center gap-1 text-[hsl(var(--success))]">
                      <UserCheck className="h-3.5 w-3.5" /> Existing contact at this address
                    </li>
                  ) : null}
                </ul>
                {(() => {
                  const stateDigit = active.sa4Code ? active.sa4Code.slice(0, 1) : undefined;
                  const cov = hasAddress(active.gnafPid) ? null : coveredBy({ kind: "address", stateDigit });
                  return (
                    <Button
                      variant="outline"
                      size="sm"
                      className="mt-3 w-full"
                      disabled={!!cov}
                      onClick={() =>
                        hasAddress(active.gnafPid)
                          ? removeAddress(active.gnafPid)
                          : addAddress({
                              gnafPid: active.gnafPid,
                              label: active.address,
                              lat: active.lat,
                              lng: active.lng,
                              stateDigit,
                            })
                      }
                    >
                      {cov ? (
                        <><Check className="mr-1.5 h-3.5 w-3.5" />Covered by {cov}</>
                      ) : hasAddress(active.gnafPid) ? (
                        <><Check className="mr-1.5 h-3.5 w-3.5" />In my turf</>
                      ) : (
                        <><Plus className="mr-1.5 h-3.5 w-3.5" />Add door to my turf</>
                      )}
                    </Button>
                  );
                })()}
                <Button
                  size="sm"
                  className="mt-2 w-full"
                  disabled={busy === active.gnafPid}
                  onClick={() =>
                    void cutTurf({
                      id: active.gnafPid,
                      name: active.address,
                      create: () =>
                        createTurfFromSources({ name: active.address, gnafPids: [active.gnafPid] }),
                    })
                  }
                >
                  {busy === active.gnafPid ? (
                    <><Spinner className="mr-2" />Cutting…</>
                  ) : (
                    <><Scissors className="mr-1.5 h-3.5 w-3.5" />Cut turf from this door</>
                  )}
                </Button>
              </SectionCard>
            ) : null}

            {active ? <RegionHierarchy kind="address" code={active.gnafPid} /> : null}

            <SectionCard title={`Nearest doors${doors.length ? ` (${doors.length})` : ""}`}>
              {loadingDoors ? (
                <div className="space-y-2">
                  <Skeleton className="h-8 w-full" />
                  <Skeleton className="h-8 w-full" />
                  <Skeleton className="h-8 w-full" />
                </div>
              ) : doorsDenied ? (
                <p className="text-sm text-muted-foreground">
                  You don't have permission to view the address set. Ask an organisation owner.
                </p>
              ) : doorsError ? (
                <>
                  <p className="text-sm text-error">{doorsError}</p>
                  <Button
                    variant="outline"
                    size="sm"
                    className="mt-2 w-full"
                    onClick={() => picked && void pick(picked)}
                  >
                    Try again
                  </Button>
                </>
              ) : doors.length === 0 ? (
                <p className="text-sm text-muted-foreground">
                  {picked ? "No addresses in the national set near this point." : "Plot an address first."}
                </p>
              ) : (
                <>
                  <ul className="max-h-72 space-y-1 overflow-y-auto">
                  {doors.map((d) => (
                    <li key={d.gnafPid}>
                      <button
                        type="button"
                        onClick={() => setActivePid(activePid === d.gnafPid ? "" : d.gnafPid)}
                        title={d.address}
                        className={cn(
                          "flex w-full items-center gap-2 rounded-lg px-2 py-1.5 text-left text-sm hover:bg-surface-variant",
                          activePid === d.gnafPid && "bg-primary-container/20",
                        )}
                      >
                        <LocateFixed className="h-3.5 w-3.5 shrink-0 text-muted-foreground" />
                        <span className="truncate font-medium text-foreground">{formatDoorLabel(d.address)}</span>
                        {d.hasContact ? (
                          <UserCheck className="h-3.5 w-3.5 shrink-0 text-[hsl(var(--success))]" />
                        ) : null}
                        <span className="ml-auto shrink-0 text-xs text-muted-foreground tabular-nums">
                          {d.distanceM.toLocaleString()} m
                        </span>
                      </button>
                    </li>
                  ))}
                  </ul>
                  <Button
                    size="sm"
                    className="mt-3 w-full"
                    disabled={busy === "nearby"}
                    onClick={() =>
                      void cutTurf({
                        id: "nearby",
                        name: picked ? `Doors near ${picked.label}` : "Nearby doors",
                        create: () =>
                          createTurfFromSources({
                            name: picked ? `Doors near ${picked.label}` : "Nearby doors",
                            gnafPids: doors.map((d) => d.gnafPid),
                          }),
                      })
                    }
                  >
                    {busy === "nearby" ? (
                      <><Spinner className="mr-2" />Cutting…</>
                    ) : (
                      <><Scissors className="mr-1.5 h-3.5 w-3.5" />Cut turf from these {doors.length} doors</>
                    )}
                  </Button>
                </>
              )}
            </SectionCard>

            <MyTurfPanel />
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="section-stack">
      {error ? (
        <EmptyState title="Address search unavailable" description={error} />
      ) : trimmed.length < 3 ? (
        <EmptyState
          title="Search addresses"
          description="Type at least 3 characters in the search box above – e.g. “12 Glebe Point Rd” or a suburb – then pick a result to plot it."
        />
      ) : (
        <Card>
          <CardContent className="space-y-4 pt-6">
            <div className="overflow-x-auto">
              <table className="w-full min-w-[560px] border-collapse text-sm">
                <thead>
                  <tr className="border-b border-border text-left text-xs font-label uppercase tracking-[0.08em] text-muted-foreground">
                    <th className="py-2 pr-4">Address</th>
                    <th className="py-2 pr-4">Coordinates</th>
                    <th className="py-2 pr-4">Quick Actions</th>
                  </tr>
                </thead>
                <tbody>
                  {searching
                    ? Array.from({ length: 6 }).map((_, index) => (
                        <tr key={`addr-skeleton-${index}`} className="border-b border-border/60">
                          <td className="py-3 pr-4"><Skeleton className="h-4 w-64" /></td>
                          <td className="py-3 pr-4"><Skeleton className="h-4 w-32" /></td>
                          <td className="py-3 pr-4"><Skeleton className="h-4 w-24" /></td>
                        </tr>
                      ))
                    : hits.map((h) => (
                        <tr
                          key={h.id}
                          className="group cursor-pointer border-b border-border/60 hover:bg-primary-container/10"
                          onClick={() => void pick(h)}
                        >
                          <td className="py-3 pr-4 font-medium text-primary">{h.label}</td>
                          <td className="py-3 pr-4 tabular-nums text-muted-foreground">
                            {h.lat.toFixed(5)}, {h.lng.toFixed(5)}
                          </td>
                          <td className="py-3 pr-4">
                            <div className="flex items-center gap-2 opacity-60 transition group-hover:opacity-100">
                              <Button
                                size="sm"
                                variant="outline"
                                onClick={(event) => {
                                  event.stopPropagation();
                                  void pick(h);
                                }}
                              >
                                <MapPin className="mr-1.5 h-3.5 w-3.5" />
                                Plot on map
                              </Button>
                            </div>
                          </td>
                        </tr>
                      ))}
                  {!searching && hits.length === 0 && (
                    <tr>
                      <td colSpan={3} className="py-6 text-center text-muted-foreground">
                        No addresses match &ldquo;{trimmed}&rdquo;.
                      </td>
                    </tr>
                  )}
                </tbody>
              </table>
            </div>
            {!searching && hits.length > 0 && (
              <p className="flex items-center gap-1.5 text-xs text-muted-foreground">
                <MapPin className="h-3.5 w-3.5" />
                Pick a result to plot it and load the nearest doors from the national address set.
              </p>
            )}
          </CardContent>
        </Card>
      )}
    </div>
  );
}
