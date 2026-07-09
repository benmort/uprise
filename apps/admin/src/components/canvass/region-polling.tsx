"use client";

import Link from "next/link";
import { BarChart3, ChevronRight } from "lucide-react";
import { getRegionPolling, type RegionKind } from "@/lib/api/geo";
import { useApi } from "@/lib/use-api";
import { SectionCard } from "@uprise/field";
import { cn } from "@/lib/utils";

const pct = (v: number | null) => (typeof v === "number" ? `${Math.round(v)}%` : "—");

/**
 * Poll estimates attached to a geo region — the read-side of the Insights domain,
 * dropped next to <RegionHierarchy> on division / area / state detail. Self-fetching
 * by kind+code. Renders NOTHING unless the region has stored estimates (only VIC
 * `sed_upper` today), so it is safe to mount on every geo detail view: loading,
 * empty, error and no-permission all collapse to null — a purely additive panel.
 */
export function RegionPolling({ kind, code }: { kind: RegionKind; code: string }) {
  const { data } = useApi(
    `/insights/region?geoKind=${kind}&geoCode=${encodeURIComponent(code)}`,
    () => getRegionPolling(kind, code),
    { ttlMs: 300_000 },
  );

  if (!data || data.polls.length === 0) return null;

  return (
    <div className="section-stack">
      {data.polls.map((poll) => (
        <SectionCard
          key={poll.pollId}
          title={
            <span className="inline-flex items-center gap-1.5">
              <BarChart3 className="h-4 w-4" />
              Polling · {poll.title}
            </span>
          }
        >
          <ul className="divide-y divide-border">
            {poll.questions.map((q) => {
              // The question's headline row: prefer the first NET row, else the first.
              const row = q.rows.find((r) => r.isNet) ?? q.rows[0];
              if (!row) return null;
              const delta =
                typeof row.regionPercent === "number" && typeof row.totalPercent === "number"
                  ? row.regionPercent - row.totalPercent
                  : null;
              return (
                <li key={q.code}>
                  <Link
                    href={`/insights/${poll.pollId}/questions/${q.code}`}
                    className="group flex items-center gap-3 py-2"
                  >
                    <div className="min-w-0 flex-1">
                      <div className="truncate text-sm text-foreground group-hover:text-primary">{q.title}</div>
                      <div className="text-xs text-muted-foreground">{row.responseLabel}</div>
                    </div>
                    <div className="shrink-0 text-right">
                      <div className="text-base font-semibold tabular-nums text-foreground">
                        {pct(row.regionPercent)}
                      </div>
                      <div className="text-[11px] tabular-nums text-muted-foreground">
                        state {pct(row.totalPercent)}
                        {delta !== null ? (
                          <span
                            className={cn(
                              "ml-1 font-medium",
                              delta > 0 ? "text-primary" : delta < 0 ? "text-muted-foreground" : "",
                            )}
                          >
                            {delta > 0 ? "+" : ""}
                            {Math.round(delta)}
                          </span>
                        ) : null}
                      </div>
                    </div>
                    <ChevronRight className="h-4 w-4 shrink-0 text-muted-foreground" />
                  </Link>
                </li>
              );
            })}
          </ul>
          {poll.attribution ? (
            <p className="mt-2 text-[11px] text-muted-foreground">{poll.attribution}</p>
          ) : null}
        </SectionCard>
      ))}
    </div>
  );
}
