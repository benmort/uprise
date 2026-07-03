"use client";

import { useCallback, useEffect, useState } from "react";
import Link from "next/link";
import { ArrowLeft, Database, RefreshCw } from "lucide-react";
import { getGeoStatus, triggerGeoIngest, type GeoDataset } from "@/lib/api/geo";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import { EmptyState } from "@/components/ui/empty-state";
import { StatusBadge } from "@/components/ui/status-badge";
import { SectionCard } from "@uprise/field";
import { DataTable } from "@uprise/field";
import { useToast } from "@/components/ui/toast";

const STATUS_MAP: Record<string, string> = {
  loaded: "COMPLETED",
  loading: "PROCESSING",
  pending: "PENDING",
  error: "FAILED",
};

// Where each dataset row title deep-links to. Federal/State/Local → the divisions
// explorer's matching tab (#federal/#state/#local); ASGS statistical areas (the
// full mb → sa4 hierarchy) → the areas explorer at that level via ?layer=;
// G-NAF → the addresses explorer. Anything unmapped stays plain text.
const AREA_LEVEL_LAYER: Record<string, string> = {
  asgs_mb: "mb",
  sa1: "sa1",
  sa2: "sa2",
  sa3: "sa3",
  sa4: "sa4",
};
function datasetHref(key: string): string | null {
  if (key === "ced") return "/canvass/divisions#federal";
  if (key === "sed") return "/canvass/divisions#state";
  if (key === "lga") return "/canvass/divisions#local";
  if (AREA_LEVEL_LAYER[key]) return `/canvass/areas?layer=${AREA_LEVEL_LAYER[key]}`;
  if (key === "gnaf") return "/canvass/addresses";
  return null;
}

export default function DataSettingsPage() {
  const { showToast } = useToast();
  const [rows, setRows] = useState<GeoDataset[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);

  const load = useCallback(async () => {
    const res = await getGeoStatus();
    if (!res.ok) setError(res.error);
    else {
      setRows(res.data);
      setError("");
    }
    setLoading(false);
  }, []);

  useEffect(() => {
    void load();
  }, [load]);

  const reingest = useCallback(async () => {
    setBusy(true);
    const res = await triggerGeoIngest();
    setBusy(false);
    showToast(
      res.ok
        ? { tone: "info", title: "Ingest", description: res.data.note }
        : { tone: "error", title: "Couldn't trigger", description: res.error },
    );
  }, [showToast]);

  const totalAddresses = rows.find((r) => r.key === "gnaf")?.rowCount ?? 0;

  return (
    <div className="page-stack">
      <div className="flex items-center gap-2">
        <Button asChild variant="ghost" size="sm">
          <Link href="/settings">
            <ArrowLeft className="mr-1 h-4 w-4" />
            Settings
          </Link>
        </Button>
        <h1 className="text-2xl font-extrabold">Data</h1>
        <Button className="ml-auto" variant="outline" size="sm" disabled={busy} onClick={reingest}>
          <RefreshCw className="mr-1.5 h-3.5 w-3.5" />
          {busy ? "…" : "Refresh / re-ingest"}
        </Button>
      </div>
      <p className="flex items-center gap-1.5 text-sm text-muted-foreground">
        <Database className="h-4 w-4" />
        The G-NAF address base + ASGS/electoral/LGA boundaries that power the canvassing
        address universe. {totalAddresses ? `${totalAddresses.toLocaleString()} addresses loaded.` : ""}
      </p>

      {loading ? (
        <Skeleton className="h-64 w-full" />
      ) : error ? (
        <EmptyState
          title="No datasets loaded yet"
          description="Run the geo ETL (npm --prefix apps/api run geo:fetch && geo:load && geo:map) on a host with disk + psql."
        />
      ) : (
        <SectionCard title="Datasets">
          <DataTable
            rows={rows}
            rowKey={(r) => r.key}
            empty="No datasets."
            columns={[
              {
                key: "label",
                header: "Dataset",
                // Row titles deep-link to where you explore that dataset (see datasetHref).
                cell: (r) => {
                  const href = datasetHref(r.key);
                  return href ? (
                    <Link href={href} className="font-medium text-primary hover:underline">
                      {r.label}
                    </Link>
                  ) : (
                    r.label
                  );
                },
              },
              { key: "release", header: "Release", cell: (r) => r.releaseDate ?? "—" },
              { key: "rows", header: "Rows", numeric: true, cell: (r) => r.rowCount.toLocaleString() },
              { key: "status", header: "Status", cell: (r) => <StatusBadge status={STATUS_MAP[r.status] ?? "PENDING"} /> },
              {
                key: "ingested",
                header: "Last ingested",
                cell: (r) => (r.lastIngested ? new Date(r.lastIngested).toLocaleDateString() : "—"),
              },
            ]}
          />
          <p className="mt-3 text-xs text-muted-foreground">
            Sources: G-NAF © Geoscape Australia; ASGS & LGA © Australian Bureau of Statistics;
            federal divisions © Australian Electoral Commission. Open data, attribution required.
          </p>
        </SectionCard>
      )}
    </div>
  );
}
