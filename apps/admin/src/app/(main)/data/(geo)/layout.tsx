"use client";

import { Suspense, useEffect, useRef, useState } from "react";
import Link from "next/link";
import { usePathname, useSearchParams } from "next/navigation";
import { Layers, Map as MapIcon } from "lucide-react";
import { SearchInput } from "@/components/ui/search-input";
import { PageHeader } from "@/components/ui/page-header";
import { WalkModeToggle, type WalkMode } from "@uprise/field";
import { cn } from "@/lib/utils";
import { STATE_ABBREVS } from "@/lib/canvass/states";
import { TurfBasketProvider, useTurfBasket } from "@/lib/canvass/turf-basket";
import { GeoExplorerProvider } from "@/lib/canvass/geo-explorer-state";
import { GeoSurface } from "@/components/canvass/geo-surface";
import {
  GEO_VIEW_PERSIST_EVENT,
  kindFromPathname,
  writeGeoParam,
  type GeoExplorerKind,
} from "@/components/canvass/use-geo-explorer-url-state";

/**
 * The unified geo-explorer shell (Phase 2) — ONE persistent layout that owns the
 * chrome (kind switcher, search, state filter, list/map toggle) AND the surface
 * (the single map + the per-kind panels). Because this is a route-group layout it
 * stays MOUNTED across the four kind routes, so the kind switcher's <Link>s are
 * plain client navigations that never remount the map — `GeoSurface` just toggles
 * its layers and cross-fades the panel. The four `page.tsx` files are inert
 * markers (they render nothing); everything visible is rendered here.
 *
 * State contract (shared via the URL only):
 *   ?q=    search term — owned here (input + the ONE 250ms debounce, written via
 *          history.replaceState so there's no RSC re-fetch per keystroke).
 *   ?view= list|map — written by the toggle here, read by the surface + panels.
 *   ?tab=  the kind's sub-level (ced/sed/lga · mb/sa1–4) — written by the panels.
 *   ?state=/?code= the shared state filter + the selected state (deep-linkable).
 */

const KINDS: Array<{ kind: GeoExplorerKind; label: string; href: string }> = [
  { kind: "divisions", label: "Divisions", href: "/data/divisions" },
  { kind: "states", label: "States", href: "/data/states" },
  { kind: "areas", label: "Areas", href: "/data/areas" },
  { kind: "addresses", label: "Addresses", href: "/data/addresses" },
  { kind: "polling-places", label: "Polling places", href: "/data/polling-places" },
  { kind: "first-nations", label: "First Nations", href: "/data/first-nations" },
];

const PLACEHOLDER: Record<GeoExplorerKind, string> = {
  divisions: "Search divisions by name…",
  states: "Search states and territories…",
  areas: "Search areas by name or code…",
  addresses: "Search an address, street or suburb…",
  "polling-places": "Search booths by name, venue or suburb…",
  "first-nations": "Search Indigenous regions, areas or locations…",
};

const TITLE: Record<GeoExplorerKind, string> = {
  divisions: "Divisions",
  states: "States",
  areas: "Areas",
  addresses: "Addresses",
  "polling-places": "Polling places",
  "first-nations": "First Nations",
};

const DESCRIPTION: Record<GeoExplorerKind, string> = {
  divisions: "Federal, state and local electoral boundaries – browse, inspect and cut turf.",
  states: "States and territories – browse, inspect and cut turf, or stack whole states into your turf.",
  areas: "ASGS statistical areas (meshblock → SA4) – search a level or work on the map.",
  addresses: "Search any address live, plot it, and see the real doors around it.",
  "polling-places": "Every federal and state/territory polling booth – search, filter by jurisdiction, and plot on the map.",
  "first-nations": "ABS Indigenous Structure – Regions, Areas and Locations. Statistical geographies for reference, not cultural, language or nation boundaries, and not cuttable into turf.",
};

const VIEW_KEY: Record<GeoExplorerKind, string> = {
  divisions: "uprise.divisionsView",
  states: "uprise.statesView",
  areas: "uprise.areasView",
  addresses: "uprise.addressesView",
  "polling-places": "uprise.pollingPlacesView",
  "first-nations": "uprise.firstNationsView",
};

function GeoExplorerChrome() {
  const pathname = usePathname();
  const searchParams = useSearchParams();
  const kind = kindFromPathname(pathname);

  const urlQ = searchParams.get("q") ?? "";
  const stateParam = searchParams.get("state") ?? "";
  const rawView = searchParams.get("view");
  const view: WalkMode = rawView === "list" ? "list" : "map";

  // The input is local state (keystrokes must never wait on the URL); the ONE
  // debounce point writes ?q= after 250ms. lastWritten distinguishes our own URL
  // writes from external changes (kind switch carrying ?q, back/forward, deep
  // links) – only external changes sync back into the input.
  const [input, setInput] = useState(urlQ);
  const lastWritten = useRef(urlQ);
  useEffect(() => {
    if (urlQ !== lastWritten.current) {
      lastWritten.current = urlQ;
      setInput(urlQ);
    }
  }, [urlQ]);
  useEffect(() => {
    if (input === lastWritten.current) return;
    const t = setTimeout(() => {
      lastWritten.current = input;
      writeGeoParam("q", input || null);
    }, 250);
    return () => clearTimeout(t);
  }, [input]);

  // Kind switches carry ?q + ?state + ?view so search term, filter and List/Map
  // selection stay put across kinds (a valid ?view= wins over the target's saved
  // default). The per-kind ?tab / ?code drop.
  const kindHref = (base: string) => {
    const params = new URLSearchParams();
    if (input.trim()) params.set("q", input.trim());
    if (stateParam) params.set("state", stateParam);
    params.set("view", view);
    return `${base}?${params.toString()}`;
  };

  const setView = (next: WalkMode) => {
    writeGeoParam("view", next);
    window.dispatchEvent(
      new CustomEvent(GEO_VIEW_PERSIST_EVENT, {
        detail: { key: VIEW_KEY[kind ?? "divisions"], value: next },
      }),
    );
  };

  if (!kind) return null;

  return (
    <div className="section-stack">
      <PageHeader
        title={TITLE[kind]}
        icon={MapIcon}
        description={DESCRIPTION[kind]}
        breadcrumbs={[
          { label: "Data Sets", href: "/data/datasets" },
          { label: TITLE[kind] },
        ]}
        actions={<MyTurfChip onOpen={() => setView("map")} />}
      />

      <div className="flex flex-wrap items-center gap-2">
        {/* Segmented kind control – client navigation under the persistent layout:
            the shell, the input and the map never remount. scroll={false} keeps the
            viewport put on a kind switch. */}
        <div className="flex rounded-xl border border-border p-0.5">
          {KINDS.map((k) => (
            <Link
              key={k.kind}
              href={kindHref(k.href)}
              scroll={false}
              aria-current={kind === k.kind ? "page" : undefined}
              className={cn(
                "rounded-lg px-3 py-1.5 text-sm font-semibold transition",
                kind === k.kind ? "bg-primary text-white" : "text-foreground hover:bg-surface-variant",
              )}
            >
              {k.label}
            </Link>
          ))}
        </div>
        {/* Shared State Filter: narrows the list and frames the map to the chosen
            state on every kind. Round-trips ?state= (carried across kind switches). */}
        <label className="flex items-center gap-1.5 text-xs font-semibold uppercase tracking-wide text-muted-foreground">
          State
          <select
            value={stateParam || "all"}
            onChange={(e) => writeGeoParam("state", e.target.value === "all" ? null : e.target.value)}
            title="Filter and frame the map by state or territory"
            className="h-9 rounded-lg border border-border bg-surface px-2 text-sm font-semibold text-foreground"
          >
            <option value="all">All states</option>
            {STATE_ABBREVS.map((s) => (
              <option key={s} value={s}>
                {s}
              </option>
            ))}
          </select>
        </label>
        <SearchInput
          value={input}
          onValueChange={setInput}
          placeholder={PLACEHOLDER[kind]}
          aria-label={`Search ${TITLE[kind].toLowerCase()}`}
          wrapperClassName="max-w-md flex-1"
        />
        {/* List/Map view toggle — pinned to the far right of the controls row. */}
        <div className="ml-auto">
          <WalkModeToggle value={view} onChange={setView} />
        </div>
      </div>
    </div>
  );
}

/** The "My turf (N)" basket indicator — visible in every view; clicking flips to
 *  map view to review/cut. */
function MyTurfChip({ onOpen }: { onOpen: () => void }) {
  const { count } = useTurfBasket();
  if (count === 0) return null;
  return (
    <button
      type="button"
      onClick={onOpen}
      className="inline-flex items-center gap-1.5 rounded-lg border border-primary bg-primary/10 px-2.5 py-1.5 text-sm font-semibold text-primary transition hover:bg-primary/20 dark:bg-primary/20"
    >
      <Layers className="h-4 w-4" />
      My turf ({count})
    </button>
  );
}

export default function GeoExplorerLayout({ children }: { children: React.ReactNode }) {
  return (
    // The basket + durable explorer state span all four kinds (persistent group
    // layout). GeoExplorerProvider sits inside the basket so panels can read both.
    <TurfBasketProvider>
      <GeoExplorerProvider>
        <div className="page-stack">
          {/* Suspense: useSearchParams in a client layout – insurance against the
              CSR-bailout build check. */}
          <Suspense fallback={null}>
            <GeoExplorerChrome />
          </Suspense>
          <Suspense fallback={null}>
            <GeoSurface />
          </Suspense>
          {/* The four page.tsx are inert markers (return null) — they only exist to
              keep four bookmarkable, prefetchable segments + the kind contract. */}
          {children}
        </div>
      </GeoExplorerProvider>
    </TurfBasketProvider>
  );
}
