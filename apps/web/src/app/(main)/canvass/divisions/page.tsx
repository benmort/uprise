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
import { SectionCard } from "@/components/canvass/section-card";
import { DataTable } from "@/components/canvass/data-table";
import { useToast } from "@/components/ui/toast";
import { cn } from "@/lib/utils";

const TABS: Array<{ type: DivisionType; label: string; soon?: boolean }> = [
  { type: "ced", label: "Federal" },
  { type: "sed", label: "State" },
  { type: "lga", label: "Local (LGA)", soon: true }, // federal + state only; LGA not mapped
];

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
              onClick={() => !t.soon && setType(t.type)}
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

      {loading ? (
        <Skeleton className="h-64 w-full" />
      ) : error ? (
        <EmptyState
          title="Geo data not loaded"
          description={`${error}. Load the G-NAF + boundary datasets from Settings → Data.`}
        />
      ) : (
        <DataTable
          rows={filtered}
          rowKey={(d) => d.code}
          empty="No divisions."
          columns={[
            {
              key: "name",
              header: "Division",
              cell: (d) => (
                <Link href={`/canvass/divisions/${type}/${encodeURIComponent(d.code)}`} className="font-semibold text-primary hover:underline">
                  {d.name}
                </Link>
              ),
            },
            { key: "state", header: "State", cell: (d) => d.state ?? "—" },
            { key: "addresses", header: "Addresses", numeric: true, cell: (d) => d.addressCount.toLocaleString() },
            {
              key: "actions",
              header: "",
              cell: (d) => (
                <Button size="sm" variant="outline" disabled={busy === d.code} onClick={() => cutTurf(d)}>
                  <Scissors className="mr-1.5 h-3.5 w-3.5" />
                  {busy === d.code ? "Cutting…" : "Cut turf"}
                </Button>
              ),
            },
          ]}
        />
      )}

      <p className="flex items-center gap-1.5 text-xs text-muted-foreground">
        <MapIcon className="h-3.5 w-3.5" />
        Click a division to see its boundary, address coverage and contacts without a record.
      </p>
    </div>
  );
}
