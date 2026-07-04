"use client";

import { useCallback, useState } from "react";
import Link from "next/link";
import { Database, RefreshCw } from "lucide-react";
import { getGeoStatus, triggerGeoIngest, type GeoDataset } from "@/lib/api/geo";
import { useApi } from "@/lib/use-api";
import { PageShell } from "@/components/shell/page-shell";
import { StateRegion } from "@/components/shell/state-region";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import { StatusBadge } from "@/components/ui/status-badge";
import { DataTable } from "@uprise/field";
import { useToast } from "@/components/ui/toast";

const STATUS_MAP: Record<string, string> = {
  loaded: "COMPLETED",
  loading: "PROCESSING",
  pending: "PENDING",
  error: "FAILED",
};

// Where each dataset row title deep-links to. Federal/State/Local → the divisions
// explorer's matching tab; ASGS statistical areas (the full mb → sa4 hierarchy) →
// the areas explorer at that level; G-NAF → the addresses explorer. Anything
// unmapped stays plain text.
const AREA_LEVEL_LAYER: Record<string, string> = {
  asgs_mb: "mb",
  sa1: "sa1",
  sa2: "sa2",
  sa3: "sa3",
  sa4: "sa4",
};
function datasetHref(key: string): string | null {
  if (key === "ced") return "/data/divisions?tab=ced";
  if (key === "sed") return "/data/divisions?tab=sed";
  if (key === "lga") return "/data/divisions?tab=lga";
  if (AREA_LEVEL_LAYER[key]) return `/data/areas?tab=${AREA_LEVEL_LAYER[key]}`;
  if (key === "gnaf") return "/data/addresses";
  return null;
}

// Plain-language description per dataset, keyed by the geo-status dataset key.
const DATASET_DESCRIPTION: Record<string, string> = {
  gnaf: "Every Australian address — the geocoded address universe (Geoscape G-NAF).",
  ced: "Federal electoral divisions (AEC).",
  sed: "State & territory electoral districts.",
  lga: "Local government areas (councils).",
  asgs_mb: "Mesh blocks — the ABS's smallest statistical area.",
  sa1: "Statistical Area 1 — small ABS units.",
  sa2: "Statistical Area 2 — suburb-scale communities.",
  sa3: "Statistical Area 3 — regional groupings of SA2s.",
  sa4: "Statistical Area 4 — the largest sub-state regions.",
};

// Display order: electoral/council boundaries coarsest-first, then the ASGS
// hierarchy SA4 → meshblock, addresses last. The API returns rows keyed
// alphabetically; unknown future keys sink to the bottom.
const DATASET_ORDER = ["ced", "sed", "lga", "sa4", "sa3", "sa2", "sa1", "asgs_mb", "gnaf"];
const datasetRank = (key: string) => {
  const i = DATASET_ORDER.indexOf(key);
  return i === -1 ? DATASET_ORDER.length : i;
};

export default function DataSettingsPage() {
  const { showToast } = useToast();
  const [busy, setBusy] = useState(false);
  // Cached 60s: revisits render instantly and revalidate in the background.
  const { data, loading, error, noPermission, refetch } = useApi(
    "/geo/status",
    (signal) => getGeoStatus({ signal }),
    { ttlMs: 60_000 },
  );
  const rows: GeoDataset[] = [...(data ?? [])].sort((a, b) => datasetRank(a.key) - datasetRank(b.key));

  const reingest = useCallback(async () => {
    setBusy(true);
    const res = await triggerGeoIngest();
    setBusy(false);
    showToast(
      res.ok
        ? { tone: "info", title: "Ingest", description: res.data.note }
        : { tone: "error", title: "Couldn't trigger", description: res.error },
    );
    void refetch();
  }, [showToast, refetch]);

  const totalAddresses = rows.find((r) => r.key === "gnaf")?.rowCount ?? 0;

  return (
    <PageShell
      title="Datasets"
      actions={
        <Button variant="outline" size="sm" disabled={busy} onClick={reingest}>
          <RefreshCw className="mr-1.5 h-3.5 w-3.5" />
          {busy ? "…" : "Refresh / re-ingest"}
        </Button>
      }
    >
      <p className="flex items-center gap-1.5 text-sm text-muted-foreground">
        <Database className="h-4 w-4" />
        {totalAddresses
          ? `${totalAddresses.toLocaleString()} Australian addresses, mapped to federal and state electorates, councils and ASGS statistical areas.`
          : "The national address universe — every Australian address, mapped to federal and state electorates, councils and ASGS statistical areas."}
      </p>

      {/* Error, empty and no-permission are DISTINCT states — a 500 no longer
          masquerades as "no datasets loaded yet". */}
      <StateRegion
        loading={loading}
        error={error}
        noPermission={noPermission}
        onRetry={() => void refetch()}
        empty={rows.length === 0}
        emptyTitle="No datasets loaded yet"
        emptyDescription="Run the geo ETL (npm --prefix apps/api run geo:fetch && geo:load && geo:map) on a host with disk + psql."
        skeleton={<Skeleton className="h-64 w-full" />}
      >
        {/* DataTable is its own bordered card — no SectionCard wrapper (double border). */}
        <div>
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
              {
                key: "description",
                header: "Description",
                cell: (r) => (
                  <span className="text-muted-foreground">{DATASET_DESCRIPTION[r.key] ?? "—"}</span>
                ),
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
        </div>
      </StateRegion>
    </PageShell>
  );
}
