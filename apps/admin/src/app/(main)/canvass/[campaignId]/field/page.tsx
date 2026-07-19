"use client";

import { useParams } from "next/navigation";
import { DoorOpen, Gauge } from "lucide-react";
import { getCampaignFieldReport, type CampaignFieldReport } from "@/lib/api/campaigns";
import { CampaignPageHeader } from "@/components/canvass/campaign-page-header";
import { useApi } from "@/lib/use-api";
import { StateRegion } from "@/components/shell/state-region";
import { Skeleton } from "@/components/ui/skeleton";
import { EmptyState } from "@/components/ui/empty-state";
import { ApexChart, ChartFigure } from "@/components/insights/apex-chart";
import { useChartPalette } from "@/components/insights/use-poll-palette";
import { useTheme } from "@/components/theme/theme-provider";
import type { ApexBundle } from "@/lib/insights/apex-options";
import type { PollPalette } from "@/lib/insights/palette";
import { DataTable, KpiTile, SectionCard } from "@uprise/field";

/** Rates arrive as fractions (0–1) or null — null renders as a dash, never a fake 0 %. */
function pct(rate: number | null): string {
  return rate == null ? "—" : `${Math.round(rate * 100)}%`;
}

type Hint = { value: string; direction: "up" | "down" | "flat" };

/** Contact-rate benchmark band: healthy door programs run 30–40 %. */
function contactHint(rate: number | null): Hint | undefined {
  if (rate == null) return undefined;
  return {
    value: "Healthy door programs run 30–40%",
    direction: rate < 0.3 ? "down" : rate <= 0.4 ? "up" : "flat",
  };
}

/** ID-rate flag: under 40 % the support question is probably being skipped. */
function idHint(rate: number | null): Hint | undefined {
  if (rate == null) return undefined;
  if (rate < 0.4) {
    return { value: "Canvassers may be skipping the support question", direction: "down" };
  }
  return { value: "Supporter IDs ÷ conversations", direction: "up" };
}

/** Weekly new-supporter columns + a cumulative line, with the goal as a dashed y-annotation. */
function accumulationBundle(
  report: CampaignFieldReport,
  p: PollPalette,
  theme: "light" | "dark",
): ApexBundle {
  const weekly = report.accumulation.weekly;
  const labels = weekly.map((w) => {
    const [y, m, d] = w.weekStart.split("-").map(Number);
    return new Date(y, m - 1, d).toLocaleDateString("en-AU", { day: "numeric", month: "short" });
  });
  const goal = report.accumulation.goal;
  const maxCumulative = Math.max(1, ...weekly.map((w) => w.cumulative));
  return {
    options: {
      chart: {
        fontFamily: "var(--font-outfit), sans-serif",
        toolbar: { show: false },
        zoom: { enabled: false },
        background: "transparent",
        animations: { enabled: true, speed: 260 },
        stacked: false,
      },
      theme: { mode: theme },
      colors: [p.seq[2], p.accent],
      stroke: { width: [0, 3], curve: "smooth" },
      plotOptions: { bar: { columnWidth: "55%", borderRadius: 3 } },
      grid: { borderColor: p.grid, strokeDashArray: 4, xaxis: { lines: { show: false } } },
      xaxis: {
        categories: labels,
        labels: { style: { colors: p.muted, fontSize: "11px" } },
        axisBorder: { show: false },
        axisTicks: { show: false },
      },
      yaxis: {
        min: 0,
        // Keep the goal line on-canvas even when the programme is far behind it.
        max: goal != null && goal > maxCumulative ? Math.ceil(goal * 1.08) : undefined,
        forceNiceScale: true,
        labels: { style: { colors: p.muted, fontSize: "11px" } },
      },
      tooltip: { theme },
      legend: { labels: { colors: p.muted }, markers: { size: 6 } },
      dataLabels: { enabled: false },
      annotations:
        goal != null
          ? {
              yaxis: [
                {
                  y: goal,
                  borderColor: p.muted,
                  strokeDashArray: 6,
                  label: {
                    text: `Goal ${goal.toLocaleString()}`,
                    position: "left",
                    textAnchor: "start",
                    style: { color: p.muted, background: "transparent" },
                  },
                },
              ],
            }
          : undefined,
    },
    series: [
      { name: "New supporter IDs", type: "column", data: weekly.map((w) => w.newSupporters) },
      { name: "Cumulative", type: "line", data: weekly.map((w) => w.cumulative) },
    ],
  };
}

/**
 * Field report — the five-number weekly review a field director actually runs on:
 * contact rate, ID rate, supporter accumulation vs goal, survey rate, and coverage,
 * overall and per turf. Per-campaign only (no all-campaigns aggregate).
 */
export default function FieldReportPage() {
  const { campaignId } = useParams<{ campaignId: string }>();
  const { theme } = useTheme();
  const palette = useChartPalette();

  const { data: report, loading, error, noPermission, refetch } = useApi(
    campaignId ? `/canvass/${campaignId}/field-report` : null,
    () => getCampaignFieldReport(campaignId),
    { ttlMs: 30_000 },
  );

  const weekly = report?.accumulation.weekly ?? [];
  const cumulative = weekly.length > 0 ? weekly[weekly.length - 1].cumulative : 0;
  const newInWindow = weekly.reduce((sum, w) => sum + w.newSupporters, 0);
  const goal = report?.accumulation.goal ?? null;

  return (
    <div className="page-stack">
      <CampaignPageHeader
        title="Field report"
        icon={Gauge}
        description="The five numbers of the door program — reviewed weekly, benchmarked against field-ops norms."
        allowAllCampaigns={false}
      />

      <StateRegion
        loading={loading}
        error={error}
        noPermission={noPermission}
        onRetry={() => void refetch()}
        errorTitle="Can't load the field report"
        skeleton={<Skeleton className="h-64 w-full" />}
      >
        {report ? (
          report.attempts === 0 ? (
            <EmptyState
              icon={DoorOpen}
              title="No door knocks yet"
              description="The five numbers appear once knocks start syncing from the field. Cut turf, build walk lists and send a shift out to seed the first week."
            />
          ) : (
            <>
              <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-5">
                <KpiTile
                  label="Contact rate"
                  value={pct(report.contactRate)}
                  delta={contactHint(report.contactRate)}
                />
                <KpiTile label="ID rate" value={pct(report.idRate)} delta={idHint(report.idRate)} />
                <KpiTile
                  label="Supporters identified"
                  value={cumulative.toLocaleString()}
                  delta={
                    goal != null
                      ? {
                          value: `${pct(cumulative / goal)} of the ${goal.toLocaleString()} goal`,
                          direction: cumulative >= goal ? "up" : "flat",
                        }
                      : { value: `+${newInWindow.toLocaleString()} in the last ${report.weeks} weeks`, direction: "flat" }
                  }
                />
                <KpiTile
                  label="Survey rate"
                  value={pct(report.qualityProxy)}
                  delta={{ value: "Surveys completed ÷ conversations", direction: "flat" }}
                />
                <KpiTile
                  label="Coverage"
                  value={pct(report.coverage.rate)}
                  delta={{
                    value: "Re-knocking easy turf while hard turf sits untouched shows here first",
                    direction: "flat",
                  }}
                />
              </div>

              <SectionCard
                title="Supporter accumulation"
                description={`New supporter IDs (strong + lean) per week, and the running total${goal != null ? " against the campaign goal" : ""}.`}
              >
                {palette ? (
                  <ChartFigure
                    summary={`Weekly new supporter IDs with a cumulative line over the last ${report.weeks} weeks${goal != null ? `, against a goal of ${goal}` : ""}. Cumulative now ${cumulative}.`}
                  >
                    <ApexChart bundle={accumulationBundle(report, palette, theme)} type="line" height={280} />
                  </ChartFigure>
                ) : (
                  <Skeleton className="h-[280px] w-full" />
                )}
              </SectionCard>

              <SectionCard
                title="By turf"
                description="Attempts here are distinct doors attempted — a re-knock doesn't inflate a turf."
              >
                <DataTable
                  rows={report.perTurf}
                  rowKey={(t) => t.turfId}
                  empty="No turf cut for this campaign yet."
                  columns={[
                    { key: "name", header: "Turf", cell: (t) => t.name },
                    { key: "doors", header: "Doors", numeric: true, cell: (t) => t.doors.toLocaleString() },
                    { key: "attempts", header: "Attempted", numeric: true, cell: (t) => t.attempts.toLocaleString() },
                    { key: "contact", header: "Contact rate", numeric: true, cell: (t) => pct(t.contactRate) },
                    { key: "id", header: "ID rate", numeric: true, cell: (t) => pct(t.idRate) },
                    { key: "coverage", header: "Coverage", numeric: true, cell: (t) => pct(t.coverage) },
                  ]}
                />
              </SectionCard>
            </>
          )
        ) : null}
      </StateRegion>
    </div>
  );
}
