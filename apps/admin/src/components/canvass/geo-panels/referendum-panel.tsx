"use client";

import { useMemo } from "react";
import { useSearchParams } from "next/navigation";
import { getReferendum, type ReferendumRow } from "@/lib/api/geo";
import { useApi } from "@/lib/use-api";
import { writeGeoParam } from "@/components/canvass/use-geo-explorer-url-state";
import { ApexChart, ChartFigure } from "@/components/insights/apex-chart";
import { usePollPalette } from "@/components/insights/use-poll-palette";
import { useTheme } from "@/components/theme/theme-provider";
import { rankedBarOptions, type ChartCtx } from "@/lib/insights/apex-options";
import { StateRegion } from "@/components/shell/state-region";
import { Skeleton } from "@/components/ui/skeleton";
import { DataTable, SectionCard, type WalkMode } from "@uprise/field";
import { cn } from "@/lib/utils";

type Level = "division" | "state";
const pct = (v: number | null) => (typeof v === "number" ? `${v.toFixed(1)}%` : "—");
const num = (v: number | null) => (typeof v === "number" ? v.toLocaleString() : "—");

/** The five vote types the AEC counts, as ranked-bar rows of their share of total votes. */
function voteTypeRows(r: ReferendumRow): Array<{ label: string; percent: number }> {
  const total = r.totalVotes ?? 0;
  if (!total) return [];
  const share = (v: number | null) => Math.round(((v ?? 0) / total) * 1000) / 10;
  return [
    { label: "Ordinary", percent: share(r.ordinaryVotes) },
    { label: "Pre-poll", percent: share(r.prepollVotes) },
    { label: "Postal", percent: share(r.postalVotes) },
    { label: "Absent", percent: share(r.absentVotes) },
    { label: "Provisional", percent: share(r.provisionalVotes) },
  ].filter((x) => x.percent > 0);
}

/**
 * Referendum panel for the unified geo surface. The map (owned by GeoSurface) shades the
 * division/state boundaries by Yes share; this panel is the list + read-out beside it. Map
 * view is a compact sidebar (national headline + a scrollable list); list view is the full
 * table plus the two crosstab charts. Level (division/state) rides in `?tab`, the picked
 * region in `?code` — the same durable URL state the surface reads to shade + frame the map.
 */
export function ReferendumPanel({ view }: { view: WalkMode }) {
  const searchParams = useSearchParams();
  const level: Level = searchParams.get("tab") === "state" ? "state" : "division";
  const q = searchParams.get("q") ?? "";
  const stateParam = searchParams.get("state") ?? "";
  const code = searchParams.get("code") ?? "";

  const { data, loading, error, noPermission, refetch } = useApi(
    "/geo/referendum",
    (signal) => getReferendum({ signal }),
    { ttlMs: 300_000 },
  );
  const theme = useTheme().theme;
  const palette = usePollPalette();
  const ctx: ChartCtx = { theme };

  const rows = useMemo(() => {
    const all = level === "division" ? (data?.divisions ?? []) : (data?.states ?? []);
    const needle = q.trim().toLowerCase();
    return all.filter((r) => {
      if (stateParam && r.stateAb !== stateParam) return false;
      if (!needle) return true;
      return [r.name, r.stateAb].some((f) => f?.toLowerCase().includes(needle));
    });
  }, [data, level, q, stateParam]);

  return (
    <div className="section-stack">
      {data?.national ? <Headline national={data.national} /> : null}

      <div className="flex rounded-xl border border-border p-0.5">
        {(["division", "state"] as Level[]).map((l) => (
          <button
            key={l}
            type="button"
            onClick={() => writeGeoParam("tab", l === "division" ? null : "state")}
            aria-pressed={level === l}
            className={cn(
              "flex-1 rounded-lg px-3 py-1.5 text-sm font-semibold transition",
              level === l ? "bg-primary text-white" : "text-foreground hover:bg-surface-variant",
            )}
          >
            {l === "division" ? "Divisions" : "States"}
          </button>
        ))}
      </div>

      <StateRegion
        loading={loading}
        error={error}
        noPermission={noPermission}
        onRetry={() => void refetch()}
        empty={!loading && rows.length === 0}
        emptyTitle="No results"
        emptyDescription="Run `pnpm --filter api geo:load-referendum` to load the AEC results."
        skeleton={<Skeleton className="h-72 w-full" />}
      >
        {view === "map" ? (
          <div className="max-h-[52vh] space-y-1 overflow-y-auto rounded-xl border border-border p-1.5">
            {rows.map((r) => {
              const active = r.geoCode === code;
              return (
                <button
                  key={r.geoCode ?? r.name}
                  type="button"
                  onClick={() => writeGeoParam("code", active ? null : (r.geoCode ?? null))}
                  className={cn(
                    "flex w-full items-center justify-between gap-2 rounded-lg px-2.5 py-1.5 text-left text-sm transition-colors",
                    active ? "bg-primary/10 text-foreground" : "hover:bg-surface-variant",
                  )}
                >
                  <span className="min-w-0 truncate font-medium text-foreground">
                    {r.name}
                    {level === "division" && r.stateAb ? (
                      <span className="ml-1 text-xs text-muted-foreground">{r.stateAb}</span>
                    ) : null}
                  </span>
                  <span className="shrink-0 tabular-nums text-muted-foreground">{pct(r.yesPct)} Yes</span>
                </button>
              );
            })}
          </div>
        ) : (
          <div className="section-stack">
            <SectionCard title={level === "division" ? "Divisions" : "States & territories"}>
              <DataTable
                rows={rows}
                rowKey={(r: ReferendumRow) => `${level}:${r.geoCode ?? r.name}`}
                empty="No results."
                columns={[
                  { key: "name", header: level === "division" ? "Division" : "State", cell: (r: ReferendumRow) => r.name },
                  ...(level === "division"
                    ? [{ key: "state", header: "State", cell: (r: ReferendumRow) => r.stateAb ?? "—" }]
                    : []),
                  { key: "yes", header: "Yes", numeric: true, cell: (r: ReferendumRow) => pct(r.yesPct) },
                  { key: "no", header: "No", numeric: true, cell: (r: ReferendumRow) => pct(r.noPct) },
                  { key: "turnout", header: "Turnout", numeric: true, cell: (r: ReferendumRow) => pct(r.turnoutPct) },
                  { key: "total", header: "Votes", numeric: true, cell: (r: ReferendumRow) => num(r.totalVotes) },
                ]}
              />
            </SectionCard>

            {palette && data ? (
              <div className="grid gap-6 lg:grid-cols-2">
                <SectionCard title="Yes vote by state" description="States and territories ranked by their Yes share.">
                  <ChartFigure summary="Yes share by state, highest first">
                    <ApexChart
                      bundle={rankedBarOptions(
                        [...(data.states ?? [])]
                          .filter((s) => typeof s.yesPct === "number")
                          .map((s) => ({ label: s.name, percent: s.yesPct as number })),
                        palette,
                        ctx,
                      )}
                      type="bar"
                      height={Math.max(240, (data.states?.length ?? 0) * 34)}
                    />
                  </ChartFigure>
                </SectionCard>

                {data.national ? (
                  <SectionCard title="Votes counted by vote type" description="How the nation's votes were cast.">
                    <ChartFigure summary="Share of national votes by vote type">
                      <ApexChart bundle={rankedBarOptions(voteTypeRows(data.national), palette, ctx)} type="bar" height={240} />
                    </ChartFigure>
                  </SectionCard>
                ) : null}
              </div>
            ) : null}
          </div>
        )}
      </StateRegion>
    </div>
  );
}

/** National headline — the outcome and turnout, up top. */
function Headline({ national }: { national: ReferendumRow }) {
  const stats: Array<{ label: string; value: string; tone?: "yes" | "no" }> = [
    { label: "Yes", value: pct(national.yesPct), tone: "yes" },
    { label: "No", value: pct(national.noPct), tone: "no" },
    { label: "Turnout", value: pct(national.turnoutPct) },
  ];
  return (
    <div className="grid grid-cols-3 gap-2">
      {stats.map((s) => (
        <div key={s.label} className="rounded-xl border border-border bg-surface p-3">
          <div className="text-[11px] font-semibold uppercase tracking-wide text-muted-foreground">{s.label}</div>
          <div
            className={cn(
              "mt-0.5 text-xl font-extrabold tabular-nums",
              s.tone === "yes" && "text-poll-support-strong",
              s.tone === "no" && "text-poll-oppose-strong",
              !s.tone && "text-foreground",
            )}
          >
            {s.value}
          </div>
        </div>
      ))}
    </div>
  );
}
