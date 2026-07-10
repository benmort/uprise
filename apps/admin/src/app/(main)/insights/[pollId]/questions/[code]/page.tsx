"use client";

import dynamic from "next/dynamic";
import { useMemo, useState } from "react";
import { useParams, useRouter } from "next/navigation";
import { MessageCircleQuestion, Map as MapIcon, Target } from "lucide-react";
import {
  getPollQuestion,
  resolvePollThreshold,
  type Crosstab,
  type ChoroplethCell,
} from "@/lib/api/insights";
import { createTurfFromSources, type TurfDivisionType } from "@/lib/api/geo";
import { useApi } from "@/lib/use-api";
import { PageShell } from "@/components/shell/page-shell";
import { Breadcrumbs } from "@/components/ui/breadcrumbs";
import { StateRegion } from "@/components/shell/state-region";
import { Skeleton } from "@/components/ui/skeleton";
import { Button } from "@/components/ui/button";
import { useToast } from "@/components/ui/toast";
import { QuestionCharts } from "@/components/insights/question-charts";
import { SectionCard } from "@uprise/field";
import { cn } from "@/lib/utils";

// The choropleth pulls in mapbox-gl — client-only, loaded on demand.
const PollChoroplethMap = dynamic(
  () => import("@/components/insights/poll-choropleth-map").then((m) => m.PollChoroplethMap),
  { ssr: false, loading: () => <Skeleton className="h-[380px] w-full rounded-xl" /> },
);

const pct = (v: number | null | undefined) => (typeof v === "number" ? `${Math.round(v)}%` : "—");

export default function QuestionPage() {
  const { pollId, code } = useParams<{ pollId: string; code: string }>();
  const { data, loading, error, noPermission, refetch } = useApi(
    `/insights/polls/${pollId}/questions/${code}`,
    () => getPollQuestion(pollId, code),
    { ttlMs: 60_000 },
  );

  return (
    <PageShell
      icon={MessageCircleQuestion}
      title={data ? `[${data.question.code}] ${data.question.title}` : "Question"}
      actions={
        data ? (
          <Breadcrumbs
            items={[
              { label: "Polling", href: "/insights" },
              { label: data.poll.title, href: `/insights/${pollId}` },
              { label: data.question.code },
            ]}
          />
        ) : undefined
      }
    >
      <StateRegion
        loading={loading}
        error={error}
        noPermission={noPermission}
        onRetry={() => void refetch()}
        skeleton={<Skeleton className="h-96 w-full" />}
      >
        {data ? <QuestionBody data={data} pollId={pollId} code={code} /> : null}
      </StateRegion>
    </PageShell>
  );
}

function QuestionBody({ data, pollId, code }: { data: Crosstab; pollId: string; code: string }) {
  // Breakdown-group filter: Total is always shown; the rest are opt-in (there can
  // be ~19 crossbreaks). Open on the whole sample, which is what the chart draws first.
  const groupNames = data.groups.map((g) => g.group).filter((g) => g !== "Total");
  const geoGroupName = data.groups.find((g) => g.columns.some((c) => c.geoKind))?.group ?? null;
  const [selectedGroup, setSelectedGroup] = useState<string>("Total");

  const totalGroup = data.groups.find((g) => g.group === "Total");
  const activeGroup = data.groups.find((g) => g.group === selectedGroup && g.group !== "Total");
  const columns = [...(totalGroup?.columns ?? []), ...(activeGroup?.columns ?? [])];

  // Choropleth: the geo group's columns for the chosen response row.
  const geoGroup = geoGroupName ? data.groups.find((g) => g.group === geoGroupName) : undefined;
  // Non-null only while the geographic group is the active breakdown — that is when the
  // chart block yields, because the map above is already drawing exactly those numbers.
  const geoGroupKind =
    selectedGroup === geoGroupName ? (geoGroup?.columns.find((c) => c.geoKind)?.geoKind ?? null) : null;
  const [responseLabel, setResponseLabel] = useState<string>(
    data.responses.find((r) => r.isNet)?.label ?? data.responses[0]?.label ?? "",
  );
  const activeResponse = data.responses.find((r) => r.label === responseLabel);

  const choroplethCells: ChoroplethCell[] = useMemo(() => {
    if (!geoGroup || !activeResponse) return [];
    return geoGroup.columns.map((col) => ({
      geoKind: col.geoKind,
      geoCode: col.geoCode,
      breakdownValue: col.value,
      percent: activeResponse.cells[col.ordinal] ?? null,
      baseN: col.baseN,
      reportable: col.reportable,
    }));
  }, [geoGroup, activeResponse]);

  // ── Targeting: turn "electorates where {response} {op} {value}%" into turf ──
  const { showToast } = useToast();
  const router = useRouter();
  const geoKind = geoGroup?.columns[0]?.geoKind ?? "sed_upper";
  const [op, setOp] = useState<">" | ">=">(">=");
  const [threshold, setThreshold] = useState(50);
  const [creating, setCreating] = useState(false);

  // Live preview off the already-loaded cells (the backend resolver is authoritative
  // on create). Only reportable, geocoded regions can be targeted.
  const matches = choroplethCells.filter(
    (c) =>
      c.geoCode &&
      c.reportable &&
      typeof c.percent === "number" &&
      (op === ">" ? c.percent > threshold : c.percent >= threshold),
  );

  async function createTurf() {
    setCreating(true);
    const resolved = await resolvePollThreshold({
      pollId,
      questionCode: code,
      response: responseLabel,
      op,
      value: threshold,
      geoKind,
    });
    if (!resolved.ok) {
      setCreating(false);
      showToast({ tone: "error", title: "Couldn't resolve electorates", description: resolved.error });
      return;
    }
    if (resolved.data.length === 0) {
      setCreating(false);
      showToast({ tone: "info", title: "No electorates match", description: "Lower the threshold and try again." });
      return;
    }
    const name = `${data.question.code} · ${responseLabel} ${op} ${threshold}%`;
    const res = await createTurfFromSources({
      name,
      divisions: resolved.data.map((c) => ({ type: geoKind as TurfDivisionType, code: c })),
    });
    setCreating(false);
    if (!res.ok) {
      showToast({ tone: "error", title: "Couldn't create turf", description: res.error });
      return;
    }
    showToast({
      tone: "success",
      title: "Turf created",
      description: `${resolved.data.length} electorate${resolved.data.length === 1 ? "" : "s"} → “${name}”.`,
    });
    router.push("/canvass");
  }

  return (
    <div className="section-stack">
      <p className="text-sm text-muted-foreground">
        {data.poll.title}
        {data.poll.attribution ? ` · ${data.poll.attribution}` : ""}
      </p>

      {/* One toolbar for the page: the chart, the map and the table all read from it. */}
      <div className="flex flex-wrap items-center gap-x-4 gap-y-2">
        <div className="flex items-center gap-2">
          <label
            htmlFor="breakdown"
            className="text-xs font-semibold uppercase tracking-wide text-muted-foreground"
          >
            Breakdown
          </label>
          <select
            id="breakdown"
            value={selectedGroup}
            onChange={(e) => setSelectedGroup(e.target.value)}
            className="h-9 rounded-lg border border-border bg-surface px-2 text-sm font-semibold text-foreground"
          >
            <option value="Total">Whole sample</option>
            {groupNames.map((g) => (
              <option key={g} value={g}>
                {g}
              </option>
            ))}
          </select>
        </div>

        <div className="flex items-center gap-2">
          <label htmlFor="response" className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">
            Response
          </label>
          <select
            id="response"
            value={responseLabel}
            onChange={(e) => setResponseLabel(e.target.value)}
            className="h-9 rounded-lg border border-border bg-surface px-2 text-sm font-semibold text-foreground"
          >
            {data.responses.map((r) => (
              <option key={r.label} value={r.label}>
                {r.label}
              </option>
            ))}
          </select>
        </div>
      </div>

      {/* ── Regional choropleth (only for the geographic crossbreak) ── */}
      {geoGroup ? (
        <SectionCard
          title={
            <span className="inline-flex items-center gap-1.5">
              <MapIcon className="h-4 w-4" />
              {geoGroup.group}
            </span>
          }
        >
          <PollChoroplethMap cells={choroplethCells} geoKind={geoKind} />
          <p className="mt-2 text-xs text-muted-foreground">
            Regions shaded by “{responseLabel}”. Regions with a small base are shown as no-data.
          </p>

          {/* Targeting — turn a threshold into canvassing turf over these electorates. */}
          <div className="mt-3 flex flex-wrap items-center gap-2 rounded-xl bg-surface-variant p-3">
            <Target className="h-4 w-4 shrink-0 text-primary" />
            <span className="text-sm text-foreground">Electorates where “{responseLabel}” is</span>
            <select
              value={op}
              onChange={(e) => setOp(e.target.value as ">" | ">=")}
              className="h-9 rounded-lg border border-border bg-surface px-2 text-sm font-semibold text-foreground"
            >
              <option value=">=">at least</option>
              <option value=">">above</option>
            </select>
            <div className="flex items-center gap-1">
              <input
                type="number"
                min={0}
                max={100}
                value={threshold}
                onChange={(e) => setThreshold(Math.max(0, Math.min(100, Number(e.target.value))))}
                className="h-9 w-16 rounded-lg border border-border bg-surface px-2 text-sm font-semibold tabular-nums text-foreground"
              />
              <span className="text-sm text-foreground">%</span>
            </div>
            <span className="text-sm text-muted-foreground">
              {matches.length} match{matches.length === 1 ? "" : "es"}
            </span>
            <Button
              size="sm"
              className="ml-auto"
              disabled={creating || matches.length === 0}
              onClick={() => void createTurf()}
            >
              {creating ? "Creating…" : "Create turf"}
            </Button>
          </div>
        </SectionCard>
      ) : null}

      {/* ── The picture of the crosstab, above the crosstab ── */}
      <SectionCard
        title={selectedGroup === "Total" ? "Whole sample" : selectedGroup}
        description="The chart follows the breakdown above. Its type is chosen from the shape of the data."
      >
        <QuestionCharts crosstab={data} group={selectedGroup} response={responseLabel} geoKind={geoGroupKind} />
      </SectionCard>

      {/* ── Crosstab table (Total + one breakdown) ── */}
      <SectionCard title="Crosstab">
        <div className="overflow-x-auto">
          <table className="w-full border-collapse text-sm">
            <thead>
              <tr>
                <th className="sticky left-0 z-10 bg-surface px-2 py-1.5 text-left font-semibold text-muted-foreground" />
                {columns.map((c) => (
                  <th
                    key={c.ordinal}
                    className={cn(
                      "min-w-[64px] px-2 py-1.5 text-right align-bottom text-xs font-semibold",
                      c.reportable ? "text-foreground" : "text-muted-foreground/60",
                    )}
                  >
                    <div className="whitespace-nowrap">{c.value}</div>
                    {typeof c.baseN === "number" ? (
                      <div className="font-normal text-muted-foreground tabular-nums">n={c.baseN}</div>
                    ) : null}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {data.responses.map((r) => (
                <tr key={r.label} className="border-t border-border">
                  <td
                    className={cn(
                      "sticky left-0 z-10 bg-surface px-2 py-1.5 text-left",
                      r.isNet ? "font-semibold text-foreground" : "text-foreground",
                    )}
                  >
                    {r.label}
                  </td>
                  {columns.map((c) => (
                    <td
                      key={c.ordinal}
                      className={cn(
                        "px-2 py-1.5 text-right tabular-nums",
                        !c.reportable && "text-muted-foreground/50",
                        r.isNet && "font-semibold",
                      )}
                    >
                      {c.reportable ? pct(r.cells[c.ordinal]) : "—"}
                    </td>
                  ))}
                </tr>
              ))}
            </tbody>
          </table>
        </div>
        <p className="mt-3 text-xs text-muted-foreground">
          Weighted column percentages, rounded to whole numbers. NET rows are emphasised. Columns with a
          base below the reporting threshold are suppressed.
        </p>
      </SectionCard>
    </div>
  );
}
