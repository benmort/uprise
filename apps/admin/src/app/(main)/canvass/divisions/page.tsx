"use client";

import { useCallback, useEffect, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { ArrowLeft, Map as MapIcon, Scissors } from "lucide-react";
import {
  createTurfFromDivision,
  listDivisions,
  type Division,
  type DivisionType,
  type TurfUniverse,
} from "@/lib/api/geo";
import { loadTurfUniverse } from "@/lib/api";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Skeleton } from "@/components/ui/skeleton";
import { EmptyState } from "@/components/ui/empty-state";
import { Card, CardContent } from "@/components/ui/card";
import { PaginationControls } from "@/components/ui/pagination-controls";
import { useToast } from "@/components/ui/toast";
import { cn } from "@/lib/utils";
import { Spinner } from "@uprise/ui";

const TABS: Array<{ type: DivisionType; label: string; soon?: boolean }> = [
  { type: "ced", label: "Federal" },
  { type: "sed", label: "State" },
  { type: "lga", label: "Local (LGA)" }, // all three levels live (LGA addresses mapped via geo:map)
];

// Deep-link aliases: /canvass/divisions#federal|#state|#local selects the tab and
// the Data page (Settings → Data) links straight to #federal / #state.
const HASH_TO_TYPE: Record<string, DivisionType> = { federal: "ced", state: "sed", local: "lga" };
const TYPE_TO_HASH: Record<DivisionType, string> = { ced: "federal", sed: "state", lga: "local" };

export default function DivisionsPage() {
  const router = useRouter();
  const { showToast } = useToast();
  const [type, setType] = useState<DivisionType>("ced");
  const [rows, setRows] = useState<Division[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [filter, setFilter] = useState("");
  const [busy, setBusy] = useState("");
  const [universe, setUniverse] = useState<TurfUniverse>("hybrid");
  const [page, setPage] = useState(0);
  const pageSize = 8;

  const load = useCallback(async (t: DivisionType) => {
    setLoading(true);
    const res = await listDivisions(t);
    if (!res.ok) setError(res.error);
    else {
      setRows(res.data);
      setError("");
    }
    setLoading(false);
  }, []);

  useEffect(() => {
    void load(type);
  }, [type, load]);

  // Honour a deep-link hash (#federal/#state) on mount and on hashchange.
  useEffect(() => {
    const apply = () => {
      const key = window.location.hash.replace(/^#/, "").toLowerCase();
      const next = HASH_TO_TYPE[key];
      const tab = next && TABS.find((t) => t.type === next);
      if (tab && !tab.soon) setType(next);
    };
    apply();
    window.addEventListener("hashchange", apply);
    return () => window.removeEventListener("hashchange", apply);
  }, []);

  const cutTurf = useCallback(
    async (d: Division) => {
      setBusy(d.code);
      const res = await createTurfFromDivision({ type, code: d.code, name: d.name });
      if (!res.ok) {
        setBusy("");
        showToast({ tone: "error", title: "Couldn't cut turf", description: res.error });
        return;
      }
      // Materialise cold doors inside the boundary when the universe wants them.
      const cold =
        universe === "existing" ? null : await loadTurfUniverse(res.data.id, universe);
      setBusy("");
      const coldCount = cold?.ok ? cold.data.materialised : 0;
      showToast({
        tone: "success",
        title: `Turf cut from ${d.name}`,
        description: coldCount > 0 ? `${coldCount.toLocaleString()} cold doors loaded.` : undefined,
      });
      router.push("/canvass");
    },
    [type, universe, router, showToast],
  );

  const filtered = rows.filter((r) => r.name.toLowerCase().includes(filter.trim().toLowerCase()));
  const paged = filtered.slice(page * pageSize, page * pageSize + pageSize);

  // Reset to the first page whenever the division type or filter changes the result set.
  useEffect(() => {
    setPage(0);
  }, [type, filter]);

  return (
    <div className="page-stack">
      <div className="flex items-center gap-2">
        <Button asChild variant="ghost" size="sm">
          <Link href="/canvass">
            <ArrowLeft className="mr-1 h-4 w-4" />
            Canvass
          </Link>
        </Button>
        <h1 className="text-2xl font-extrabold">Divisions</h1>
      </div>
      <p className="text-sm text-muted-foreground">
        Every address mapped to its federal, state and local division — find where the cold
        doors are and cut turf straight from a boundary.
      </p>

      <div className="flex flex-wrap items-center gap-2">
        <div className="flex rounded-xl border border-border p-0.5">
          {TABS.map((t) => (
            <button
              key={t.type}
              type="button"
              disabled={t.soon}
              title={t.soon ? "LGA boundaries not loaded yet" : undefined}
              onClick={() => {
                if (t.soon) return;
                setType(t.type);
                // replaceState (not location.hash=) so the URL stays shareable without
                // pushing history or re-triggering the hashchange listener.
                window.history.replaceState(null, "", `#${TYPE_TO_HASH[t.type]}`);
              }}
              className={cn(
                "flex items-center gap-1.5 rounded-lg px-3 py-1.5 text-sm font-semibold transition",
                t.soon
                  ? "cursor-not-allowed text-muted-foreground/60"
                  : type === t.type
                    ? "bg-primary text-white"
                    : "text-foreground",
              )}
            >
              {t.label}
              {t.soon ? (
                <span className="rounded-full bg-surface-variant px-1.5 py-0.5 text-[10px] font-bold uppercase tracking-wide text-muted-foreground">
                  Soon
                </span>
              ) : null}
            </button>
          ))}
        </div>
        <Input
          value={filter}
          onChange={(e) => setFilter(e.target.value)}
          placeholder="Filter divisions…"
          className="h-9 max-w-xs"
        />
        <div className="ml-auto flex items-center gap-2">
          <span className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">
            Cut with
          </span>
          <select
            value={universe}
            onChange={(e) => setUniverse(e.target.value as TurfUniverse)}
            className="h-9 rounded-lg border border-border bg-surface px-2 text-sm font-semibold text-foreground"
            title="Which addresses land in the turf when you cut it"
          >
            <option value="hybrid">Existing + cold doors</option>
            <option value="none">Cold doors only</option>
            <option value="existing">Existing contacts only</option>
          </select>
        </div>
      </div>

      {error && !loading ? (
        <EmptyState
          title="Geo data not loaded"
          description={`${error}. Load the G-NAF + boundary datasets from Settings → Data.`}
        />
      ) : (
        <Card>
          <CardContent className="space-y-4 pt-6">
            <div className="overflow-x-auto">
              <table className="w-full min-w-[640px] border-collapse text-sm">
                <thead>
                  <tr className="border-b border-border text-left text-xs font-label uppercase tracking-[0.08em] text-muted-foreground">
                    <th className="py-2 pr-4">Division</th>
                    <th className="py-2 pr-4">State</th>
                    <th className="py-2 pr-4">Addresses</th>
                    <th className="py-2 pr-4">Quick Actions</th>
                  </tr>
                </thead>
                <tbody>
                  {loading
                    ? Array.from({ length: pageSize }).map((_, index) => (
                        <tr key={`division-skeleton-${index}`} className="border-b border-border/60">
                          <td className="py-3 pr-4">
                            <Skeleton className="h-4 w-44" />
                            <Skeleton className="mt-2 h-3 w-24" />
                          </td>
                          {Array.from({ length: 3 }).map((__, cell) => (
                            <td key={cell} className="py-3 pr-4">
                              <Skeleton className="h-4 w-16" />
                            </td>
                          ))}
                        </tr>
                      ))
                    : paged.map((d) => (
                        <tr
                          key={d.code}
                          className="group cursor-pointer border-b border-border/60 hover:bg-primary-container/10"
                          onClick={() => router.push(`/canvass/divisions/${type}/${encodeURIComponent(d.code)}`)}
                        >
                          <td className="py-3 pr-4">
                            <p className="font-medium text-primary">{d.name}</p>
                            <p className="text-xs text-muted-foreground">{d.code}</p>
                          </td>
                          <td className="py-3 pr-4 text-muted-foreground">{d.state ?? "—"}</td>
                          <td className="py-3 pr-4 tabular-nums">{d.addressCount.toLocaleString()}</td>
                          <td className="py-3 pr-4">
                            <div className="flex items-center gap-2 opacity-60 transition group-hover:opacity-100">
                              <Button
                                size="sm"
                                variant="outline"
                                disabled={busy === d.code}
                                onClick={(event) => {
                                  event.stopPropagation();
                                  void cutTurf(d);
                                }}
                              >
                                <Scissors className="mr-1.5 h-3.5 w-3.5" />
                                {busy === d.code ? (<><Spinner className="mr-2" />Cutting…</>) : "Cut turf"}
                              </Button>
                            </div>
                          </td>
                        </tr>
                      ))}
                  {!loading && paged.length === 0 && (
                    <tr>
                      <td colSpan={4} className="py-6 text-center text-muted-foreground">
                        No divisions.
                      </td>
                    </tr>
                  )}
                </tbody>
              </table>
            </div>
            <div className="flex flex-wrap items-center justify-between gap-2">
              <p className="text-xs text-muted-foreground">
                Showing {paged.length} of {filtered.length} divisions
              </p>
              <PaginationControls
                page={page}
                pageSize={pageSize}
                total={filtered.length}
                onPrev={() => setPage((prev) => Math.max(0, prev - 1))}
                onNext={() => setPage((prev) => prev + 1)}
              />
            </div>
          </CardContent>
        </Card>
      )}

      <p className="flex items-center gap-1.5 text-xs text-muted-foreground">
        <MapIcon className="h-3.5 w-3.5" />
        Click a division to see its boundary, address coverage and contacts without a record.
      </p>
    </div>
  );
}
