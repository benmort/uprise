"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import dynamic from "next/dynamic";
import Link from "next/link";
import { ArrowLeft, LocateFixed, MapPin, Search, UserCheck } from "lucide-react";
import { nearbyAddresses, type NearbyAddress } from "@/lib/api/geo";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Skeleton } from "@/components/ui/skeleton";
import { EmptyState } from "@/components/ui/empty-state";
import { Card, CardContent } from "@/components/ui/card";
import { cn } from "@/lib/utils";
import { SectionCard, WalkModeToggle, useLocalStorage, type WalkMode } from "@uprise/field";

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

/** Live forward-geocode via Mapbox (the search half; our G-NAF is the data half —
 *  national labels don't carry street names, so free-text search rides Mapbox). */
async function geocode(q: string): Promise<GeocodeHit[]> {
  const url =
    `https://api.mapbox.com/geocoding/v5/mapbox.places/${encodeURIComponent(q)}.json` +
    `?access_token=${encodeURIComponent(MAPBOX_TOKEN)}&country=au&types=address,street,locality,place&autocomplete=true&limit=8`;
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

export default function AddressesPage() {
  const [mode, setMode] = useLocalStorage<WalkMode>("uprise.addressesView", "list");

  // ── List mode: live geocode search ─────────────────────────────────────────
  const [query, setQuery] = useState("");
  const [hits, setHits] = useState<GeocodeHit[]>([]);
  const [searching, setSearching] = useState(false);
  const [error, setError] = useState("");

  // ── Map mode: the picked point + the nearest real doors around it ──────────
  const [picked, setPicked] = useState<GeocodeHit | null>(null);
  const [doors, setDoors] = useState<NearbyAddress[]>([]);
  const [loadingDoors, setLoadingDoors] = useState(false);
  const [doorsError, setDoorsError] = useState("");
  const [activePid, setActivePid] = useState<string>("");

  const trimmed = query.trim();

  // Type-ahead (same 250ms debounce as the areas page).
  useEffect(() => {
    if (mode !== "list") return;
    if (trimmed.length < 3) {
      setHits([]);
      setError("");
      return;
    }
    if (!MAPBOX_TOKEN) {
      setError("Set NEXT_PUBLIC_MAPBOX_TOKEN to enable address search.");
      return;
    }
    let alive = true;
    setSearching(true);
    const t = setTimeout(async () => {
      try {
        const results = await geocode(trimmed);
        if (!alive) return;
        setHits(results);
        setError("");
      } catch (err) {
        if (!alive) return;
        setHits([]);
        setError(String(err instanceof Error ? err.message : err));
      }
      if (alive) setSearching(false);
    }, 250);
    return () => {
      alive = false;
      clearTimeout(t);
    };
  }, [trimmed, mode]);

  // Picking a hit plots it + fans out to the nearest G-NAF doors.
  const pick = useCallback(async (hit: GeocodeHit) => {
    setPicked(hit);
    setMode("map");
    setActivePid("");
    setDoors([]);
    setDoorsError("");
    setLoadingDoors(true);
    const res = await nearbyAddresses(hit.lat, hit.lng, 30);
    setLoadingDoors(false);
    if (res.ok) setDoors(res.data);
    else setDoorsError(res.error);
  }, [setMode]);

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

  return (
    <div className="page-stack">
      <div className="flex flex-wrap items-center gap-2">
        <Button asChild variant="ghost" size="sm">
          <Link href="/canvass">
            <ArrowLeft className="mr-1 h-4 w-4" />
            Canvass
          </Link>
        </Button>
        <h1 className="text-2xl font-extrabold">Addresses</h1>
        <div className="ml-auto">
          <WalkModeToggle value={mode} onChange={setMode} />
        </div>
      </div>
      <p className="text-sm text-muted-foreground">
        Search any address live, plot it on the map, and see the real doors around it — with each
        door&rsquo;s electorates and whether it&rsquo;s already a contact.
      </p>

      {mode === "list" ? (
        <>
          <div className="relative max-w-md">
            <Search className="pointer-events-none absolute left-2.5 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
            <Input
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              placeholder="Search an address, street or suburb…"
              className="h-9 pl-8"
            />
          </div>

          {error ? (
            <EmptyState title="Address search unavailable" description={error} />
          ) : trimmed.length < 3 ? (
            <EmptyState
              title="Search addresses"
              description="Type at least 3 characters — e.g. “12 Glebe Point Rd” or a suburb — then pick a result to plot it."
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
        </>
      ) : (
        <div className="grid gap-4 lg:grid-cols-[1fr_320px]">
          <div className="h-[65vh] overflow-hidden rounded-2xl border border-border">
            {picked ? (
              <TurfMap
                mode="view"
                stops={stops}
                activeStopId={activePid || undefined}
                userPosition={{ lat: picked.lat, lng: picked.lng }}
                onStopTap={(id) => setActivePid(id)}
              />
            ) : (
              <div className="flex h-full items-center justify-center p-6 text-center text-sm text-muted-foreground">
                Search an address in list view and plot it to see it here.
              </div>
            )}
          </div>

          <div className="space-y-4">
            <SectionCard title="Searched address">
              {picked ? (
                <>
                  <p className="text-sm font-semibold text-foreground">{picked.label}</p>
                  <p className="mt-1 text-xs text-muted-foreground tabular-nums">
                    {picked.lat.toFixed(5)}, {picked.lng.toFixed(5)}
                  </p>
                  <Button
                    variant="outline"
                    size="sm"
                    className="mt-3 w-full"
                    onClick={() => setMode("list")}
                  >
                    <Search className="mr-1.5 h-3.5 w-3.5" />
                    Search another
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
                  <li>Federal: <span className="font-medium text-foreground">{active.cedName ?? "—"}</span></li>
                  <li>State: <span className="font-medium text-foreground">{active.sedName ?? "—"}</span></li>
                  <li className="tabular-nums">SA1 {active.sa1Code ?? "—"} · SA2 {active.sa2Code ?? "—"}</li>
                  <li className="tabular-nums">{active.distanceM.toLocaleString()} m from the pin</li>
                  {active.hasContact ? (
                    <li className="flex items-center gap-1 text-[hsl(var(--success))]">
                      <UserCheck className="h-3.5 w-3.5" /> Existing contact at this address
                    </li>
                  ) : null}
                </ul>
              </SectionCard>
            ) : null}

            <SectionCard title={`Nearest doors${doors.length ? ` (${doors.length})` : ""}`}>
              {loadingDoors ? (
                <div className="space-y-2">
                  <Skeleton className="h-8 w-full" />
                  <Skeleton className="h-8 w-full" />
                  <Skeleton className="h-8 w-full" />
                </div>
              ) : doorsError ? (
                <p className="text-sm text-error">{doorsError}</p>
              ) : doors.length === 0 ? (
                <p className="text-sm text-muted-foreground">
                  {picked ? "No addresses in the national set near this point." : "Plot an address first."}
                </p>
              ) : (
                <ul className="max-h-72 space-y-1 overflow-y-auto">
                  {doors.map((d) => (
                    <li key={d.gnafPid}>
                      <button
                        type="button"
                        onClick={() => setActivePid(d.gnafPid)}
                        className={cn(
                          "flex w-full items-center gap-2 rounded-lg px-2 py-1.5 text-left text-sm hover:bg-surface-variant",
                          activePid === d.gnafPid && "bg-primary-container/20",
                        )}
                      >
                        <LocateFixed className="h-3.5 w-3.5 shrink-0 text-muted-foreground" />
                        <span className="truncate font-medium text-foreground">{d.address}</span>
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
              )}
            </SectionCard>
          </div>
        </div>
      )}
    </div>
  );
}
