"use client";

import { Suspense, useEffect, useRef, useState } from "react";
import Link from "next/link";
import { usePathname, useSearchParams } from "next/navigation";
import { Layers, Search } from "lucide-react";
import { Input } from "@/components/ui/input";
import { WalkModeToggle, type WalkMode } from "@uprise/field";
import { cn } from "@/lib/utils";
import { TurfBasketProvider, useTurfBasket } from "@/lib/canvass/turf-basket";
import {
  GEO_VIEW_PERSIST_EVENT,
  kindFromPathname,
  writeGeoParam,
  type GeoExplorerKind,
} from "@/components/canvass/use-geo-explorer-url-state";

/**
 * The unified geo-explorer shell – ONE base layout + search interface for
 * Divisions, Areas and Addresses. This is a route-group layout, so it stays
 * MOUNTED when switching between the three (the segmented control's <Link>s
 * are plain client navigations: "just push state" – the search input never
 * loses focus or content). Detail routes ([type]/[code], [layer]/[code]) live
 * OUTSIDE the (geo) group, so everything rendered here IS an index page – no
 * pathname gating needed.
 *
 * State contract (shared with the pages via the URL only – no context):
 *   ?q=    the search term – the layout owns the input + the ONE 250ms
 *          debounce and writes via history.replaceState (no RSC re-fetch);
 *          pages own execution (client filter / server search / geocode).
 *   ?view= list|map – written by the toggle here, read by the pages.
 *   ?tab=  the page's sub-level (ced/sed/lga · mb/sa1–4) – written by pages.
 */

const KINDS: Array<{ kind: GeoExplorerKind; label: string; href: string }> = [
  { kind: "divisions", label: "Divisions", href: "/data/divisions" },
  { kind: "states", label: "States", href: "/data/states" },
  { kind: "areas", label: "Areas", href: "/data/areas" },
  { kind: "addresses", label: "Addresses", href: "/data/addresses" },
];

const PLACEHOLDER: Record<GeoExplorerKind, string> = {
  divisions: "Search divisions by name…",
  states: "Search states and territories…",
  areas: "Search areas by name or code…",
  addresses: "Search an address, street or suburb…",
};

const TITLE: Record<GeoExplorerKind, string> = {
  divisions: "Divisions",
  states: "States",
  areas: "Areas",
  addresses: "Addresses",
};

const DESCRIPTION: Record<GeoExplorerKind, string> = {
  divisions: "Federal, state and local electoral boundaries – browse, inspect and cut turf.",
  states: "States and territories – browse, inspect and cut turf, or stack whole states into your turf.",
  areas: "ASGS statistical areas (meshblock → SA4) – search a level or work on the map.",
  addresses: "Search any address live, plot it, and see the real doors around it.",
};

function GeoExplorerChrome() {
  const pathname = usePathname();
  const searchParams = useSearchParams();
  const kind = kindFromPathname(pathname);

  const urlQ = searchParams.get("q") ?? "";
  const rawView = searchParams.get("view");
  // Map is the explorer default; the page hook seeds ?view= from the saved
  // per-kind preference on mount, so this fallback only shows pre-seed.
  const view: WalkMode = rawView === "list" ? "list" : "map";
  // Areas map view has its own in-map search combobox (it also selects areas on
  // the map) bound to the same ?q= — so suppress this header box there to keep
  // ONE visible search box per view.
  const hideSearch = kind === "areas" && view === "map";

  // The input is local state (keystrokes must never wait on the URL); the ONE
  // debounce point writes ?q= after 250ms. lastWritten distinguishes our own
  // URL writes from external changes (kind switch carrying ?q, back/forward,
  // deep links) – only external changes sync back into the input.
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

  // Kind switches carry the search term (?q) but drop the per-kind ?view/?tab.
  const kindHref = (base: string) => (input.trim() ? `${base}?q=${encodeURIComponent(input.trim())}` : base);

  // The view toggle writes ?view= (Next 14.2 syncs history.replaceState into
  // useSearchParams – no router call needed) and signals the page hook to
  // persist the per-kind default (the hook is the one localStorage writer;
  // writing it directly here would desync the hook's in-memory state).
  const VIEW_KEY: Record<GeoExplorerKind, string> = {
    divisions: "uprise.divisionsView",
    states: "uprise.statesView",
    areas: "uprise.areasView",
    addresses: "uprise.addressesView",
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
      <div className="flex flex-wrap items-center gap-2">
        <h1 className="text-2xl font-extrabold">{TITLE[kind]}</h1>
        <div className="ml-auto flex items-center gap-2">
          <MyTurfChip onOpen={() => setView("map")} />
          <WalkModeToggle value={view} onChange={setView} />
        </div>
      </div>
      <p className="text-sm text-muted-foreground">{DESCRIPTION[kind]}</p>

      <div className="flex flex-wrap items-center gap-2">
        {/* Segmented kind control – client navigation under the persistent
            layout: the shell (and this input) never remounts. */}
        <div className="flex rounded-xl border border-border p-0.5">
          {KINDS.map((k) => (
            <Link
              key={k.kind}
              href={kindHref(k.href)}
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
        {!hideSearch ? (
          <div className="relative max-w-md flex-1">
            <Search className="pointer-events-none absolute left-2.5 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
            <Input
              value={input}
              onChange={(e) => setInput(e.target.value)}
              placeholder={PLACEHOLDER[kind]}
              className="h-9 pl-8"
              aria-label={`Search ${TITLE[kind].toLowerCase()}`}
            />
          </div>
        ) : null}
      </div>
    </div>
  );
}

/** The "My turf (N)" basket indicator — visible in every view (incl. list mode
 *  where the panel isn't shown); clicking flips to map view to review/cut. */
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
    // The basket spans all three explorer tabs (persistent group layout).
    <TurfBasketProvider>
      <div className="page-stack">
        {/* Suspense: useSearchParams in a client layout – cheap insurance against
            the CSR-bailout build check, independent of (main)/loading.tsx. */}
        <Suspense fallback={null}>
          <GeoExplorerChrome />
        </Suspense>
        {children}
      </div>
    </TurfBasketProvider>
  );
}
