"use client";

import Link from "next/link";
import { ArrowUpRight, ChevronRight } from "lucide-react";
import { getRegionHierarchy, type RegionKind, type RegionRef } from "@/lib/api/geo";
import { useApi } from "@/lib/use-api";
import { StateRegion } from "@/components/shell/state-region";
import { Skeleton } from "@/components/ui/skeleton";
import { SectionCard } from "@uprise/field";
import {
  REGION_KIND_LABEL,
  areasInStateHref,
  divisionsInStateHref,
  regionHref,
} from "@/lib/canvass/region-href";
import { cn } from "@/lib/utils";

const ASGS_ORDER: RegionKind[] = ["state", "sa4", "sa3", "sa2", "sa1", "mb"];
const ADMIN_KINDS: RegionKind[] = ["ced", "sed", "lga"];

/** A region as a link (or plain text for leaf kinds with no detail route). */
function RefLink({ r, className }: { r: RegionRef; className?: string }) {
  const href = regionHref(r);
  if (!href) return <span className={cn("text-foreground", className)}>{r.name}</span>;
  return (
    <Link href={href} className={cn("text-primary hover:underline", className)}>
      {r.name}
    </Link>
  );
}

/**
 * The containment panel: what CONTAINS this region (breadcrumb up: State › SA4 ›
 * … + electorates/LGA) and what it CONTAINS (grouped, drill-through lists down).
 * Self-fetching by kind+code so it drops into any detail view. Renders states at
 * the top of the tree and addresses at the leaf.
 */
export function RegionHierarchy({ kind, code }: { kind: RegionKind; code: string }) {
  const { data, loading, error, noPermission, refetch } = useApi(
    `/geo/hierarchy?kind=${kind}&code=${encodeURIComponent(code)}`,
    () => getRegionHierarchy(kind, code),
    { ttlMs: 300_000 },
  );

  const asgsParents = (data?.parents ?? []).filter((p) => ASGS_ORDER.includes(p.kind));
  const adminParents = (data?.parents ?? []).filter((p) => ADMIN_KINDS.includes(p.kind));

  return (
    <StateRegion
      loading={loading}
      error={error}
      noPermission={noPermission}
      onRetry={() => void refetch()}
      errorTitle="Couldn't load the containment tree"
      skeleton={<Skeleton className="h-40 w-full" />}
    >
      {data ? (
        <div className="section-stack">
          {asgsParents.length > 0 || adminParents.length > 0 ? (
            <SectionCard title="Contained within">
              {asgsParents.length > 0 ? (
                <div className="flex flex-wrap items-center gap-1 text-sm">
                  {asgsParents.map((p, i) => (
                    <span key={`${p.kind}:${p.code}`} className="flex items-center gap-1">
                      <RefLink r={p} />
                      {i < asgsParents.length - 1 ? (
                        <ChevronRight className="h-3.5 w-3.5 shrink-0 text-muted-foreground" />
                      ) : null}
                    </span>
                  ))}
                </div>
              ) : null}
              {adminParents.length > 0 ? (
                <div className="mt-2 flex flex-wrap items-center gap-2">
                  {adminParents.map((p) => (
                    <span
                      key={`${p.kind}:${p.code}`}
                      className="inline-flex items-center gap-1.5 rounded-lg bg-surface-variant px-2 py-1"
                    >
                      <span className="text-[10px] font-bold uppercase tracking-wide text-muted-foreground">
                        {REGION_KIND_LABEL[p.kind]}
                      </span>
                      <RefLink r={p} className="text-xs" />
                    </span>
                  ))}
                </div>
              ) : null}
            </SectionCard>
          ) : null}

          {data.region.kind === "state" ? (
            <div className="flex flex-wrap gap-3">
              {areasInStateHref(data.region.code) ? (
                <Link
                  href={areasInStateHref(data.region.code)!}
                  className="inline-flex items-center gap-1 text-sm font-medium text-primary hover:underline"
                >
                  View all areas in {data.region.name}
                  <ArrowUpRight className="h-3.5 w-3.5" />
                </Link>
              ) : null}
              {divisionsInStateHref(data.region.code) ? (
                <Link
                  href={divisionsInStateHref(data.region.code)!}
                  className="inline-flex items-center gap-1 text-sm font-medium text-primary hover:underline"
                >
                  View divisions in {data.region.name}
                  <ArrowUpRight className="h-3.5 w-3.5" />
                </Link>
              ) : null}
            </div>
          ) : null}

          {data.childGroups.map((g) => (
            <SectionCard key={`${g.kind}:${g.label}`} title={`${g.label} (${g.total.toLocaleString()})`}>
              <ul className="max-h-72 space-y-1 overflow-y-auto">
                {g.rows.map((r) => (
                  <li key={`${r.kind}:${r.code}`} className="flex items-center gap-2 text-sm">
                    <RefLink r={r} className="truncate font-medium" />
                    {typeof r.addressCount === "number" ? (
                      <span className="ml-auto shrink-0 text-xs text-muted-foreground tabular-nums">
                        {r.addressCount.toLocaleString()}
                      </span>
                    ) : null}
                  </li>
                ))}
              </ul>
              {g.total > g.rows.length ? (
                <p className="mt-2 text-xs text-muted-foreground">
                  +{(g.total - g.rows.length).toLocaleString()} more
                </p>
              ) : null}
            </SectionCard>
          ))}

          {data.parents.length === 0 && data.childGroups.length === 0 ? (
            <p className="text-sm text-muted-foreground">No containment relationships to show.</p>
          ) : null}
        </div>
      ) : null}
    </StateRegion>
  );
}
