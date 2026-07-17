"use client";

import { useCallback, useEffect, useState } from "react";
import { useParams } from "next/navigation";
import { AlertTriangle, BarChart3, CheckCircle2, Download, Save, ShieldCheck, Target } from "lucide-react";
import {
  getCampaign,
  getCampaignResults,
  getCampaignSummary,
  updateCampaign,
  type CampaignKpis,
  type CampaignResults,
} from "@/lib/api/campaigns";
import { getQaReview, resolveQaFlag, type QaFlag } from "@/lib/api";
import { CampaignPageHeader } from "@/components/canvass/campaign-page-header";
import { useApi } from "@/lib/use-api";
import { StateRegion } from "@/components/shell/state-region";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Skeleton } from "@/components/ui/skeleton";
import { SectionCard, ProgressBar, SupportLevelBar, type SupportLevel } from "@uprise/field";
import { useToast } from "@/components/ui/toast";

// RFC-4180 quote: wrap in double quotes and double any internal quotes.
function csv(value: unknown): string {
  return `"${String(value ?? "").replace(/"/g, '""')}"`;
}
function toCsv(r: CampaignResults): string {
  const row = (section: string, key: unknown, value: unknown) =>
    [csv(section), csv(key), csv(value)].join(",");
  const lines = [row("section", "key", "value")];
  r.dispositionBreakdown.forEach((d) => lines.push(row("disposition", d.code, d.count)));
  r.supportDistribution.forEach((s) => lines.push(row("support", s.supportLevel, s.count)));
  Object.entries(r.funnel).forEach(([k, v]) => lines.push(row("funnel", k, v)));
  return lines.join("\n");
}

/**
 * Canvass Insights — the merged Results + Goals + Data-quality surface (one stacked page,
 * one nav entry). On the campaign-less aggregate route (/canvass/insights) results + data
 * quality span every campaign and Goals is hidden (goals are per-campaign configuration).
 */
export default function InsightsPage() {
  const { campaignId } = useParams<{ campaignId?: string }>();
  const { showToast } = useToast();

  // ── Results (shared: also feeds the Goals pace bars) ──────────────────────
  const {
    data: results,
    loading: resultsLoading,
    error: resultsError,
    noPermission: resultsNoPerm,
    refetch: refetchResults,
  } = useApi(
    campaignId ? `/canvass/${campaignId}/results` : "/canvass/results",
    () => getCampaignResults(campaignId),
    { ttlMs: 15_000 },
  );

  // ── Data quality (QA flags) ───────────────────────────────────────────────
  const {
    data: qa,
    loading: qaLoading,
    error: qaError,
    noPermission: qaNoPerm,
    refetch: refetchQa,
  } = useApi(
    campaignId ? `/canvass/campaigns/${campaignId}/qa` : "/canvass/campaigns/qa",
    () => getQaReview(campaignId),
  );
  const flags = qa?.flags ?? [];
  const [busyFlag, setBusyFlag] = useState<string | null>(null);

  const actFlag = useCallback(
    async (f: QaFlag, input: { state?: "RESOLVED" | "DISMISSED"; resolved?: boolean }, successTitle: string) => {
      if (!campaignId) return; // read-only in the aggregate view
      setBusyFlag(f.id);
      const res = await resolveQaFlag(campaignId, { doorKnockId: f.doorKnockId, kind: f.kind, ...input });
      setBusyFlag(null);
      if (!res.ok) {
        showToast({ tone: "error", title: "Couldn't update flag", description: res.error });
        return;
      }
      showToast({ tone: "success", title: successTitle });
      await refetchQa();
    },
    [campaignId, showToast, refetchQa],
  );

  // ── Goals (per-campaign only; reuses `results.funnel.contacted`) ──────────
  const [doorsGoal, setDoorsGoal] = useState("");
  const [convGoal, setConvGoal] = useState("");
  const [kpis, setKpis] = useState<CampaignKpis | null>(null);
  const [goalsBusy, setGoalsBusy] = useState(false);

  const loadGoals = useCallback(async () => {
    if (!campaignId) return;
    const [c, s] = await Promise.all([getCampaign(campaignId), getCampaignSummary(campaignId)]);
    if (c.ok) {
      const goals = (c.data.goals ?? {}) as Record<string, number>;
      setDoorsGoal(goals.doors ? String(goals.doors) : "");
      setConvGoal(goals.conversations ? String(goals.conversations) : "");
    }
    if (s.ok) setKpis(s.data);
  }, [campaignId]);

  useEffect(() => {
    void loadGoals();
  }, [loadGoals]);

  const saveGoals = useCallback(async () => {
    if (!campaignId) return;
    setGoalsBusy(true);
    const goals: Record<string, number> = {};
    if (Number(doorsGoal) > 0) goals.doors = Number(doorsGoal);
    if (Number(convGoal) > 0) goals.conversations = Number(convGoal);
    const res = await updateCampaign(campaignId, { goals: Object.keys(goals).length ? goals : null });
    setGoalsBusy(false);
    if (!res.ok) {
      showToast({ tone: "error", title: "Couldn't save goals", description: res.error });
      return;
    }
    showToast({ tone: "success", title: "Goals saved" });
  }, [campaignId, doorsGoal, convGoal, showToast]);

  function exportCsv() {
    if (!results) return;
    const blob = new Blob([toCsv(results)], { type: "text/csv" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `campaign-${campaignId ?? "all"}-insights.csv`;
    a.click();
    URL.revokeObjectURL(url);
  }

  const maxDisp = Math.max(1, ...(results?.dispositionBreakdown.map((d) => d.count) ?? [1]));
  const supportCounts = Object.fromEntries(
    (results?.supportDistribution ?? [])
      .filter((s) => s.supportLevel)
      .map((s) => [s.supportLevel as SupportLevel, s.count]),
  ) as Partial<Record<SupportLevel, number>>;
  const funnel = results?.funnel;
  const contacted = funnel?.contacted ?? 0;
  const doorsKnocked = kpis?.knockedStops ?? 0;
  const doorsTarget = Number(doorsGoal) || 0;
  const convTarget = Number(convGoal) || 0;

  return (
    <div className="page-stack">
      <CampaignPageHeader
        title="Insights"
        icon={BarChart3}
        actions={
          results ? (
            <Button variant="outline" size="sm" onClick={exportCsv}>
              <Download className="mr-1.5 h-3.5 w-3.5" />
              Export CSV
            </Button>
          ) : undefined
        }
      />

      {/* ── Results ──────────────────────────────────────────────────────── */}
      <StateRegion
        loading={resultsLoading}
        error={resultsError}
        noPermission={resultsNoPerm}
        onRetry={() => void refetchResults()}
        errorTitle="Can't load results"
        skeleton={<Skeleton className="h-64 w-full" />}
      >
        {results ? (
          <>
            <div className="grid gap-4 md:grid-cols-2">
              <SectionCard title="Disposition breakdown">
                {results.dispositionBreakdown.length === 0 ? (
                  <p className="text-sm text-muted-foreground">No dispositions logged yet.</p>
                ) : (
                  <ul className="space-y-2">
                    {results.dispositionBreakdown.map((d) => (
                      <li key={d.code}>
                        <ProgressBar
                          tone="primary"
                          value={d.count}
                          max={maxDisp}
                          label={
                            <>
                              <span className="capitalize">{d.code.replaceAll("_", " ")}</span>
                              <span>{d.count}</span>
                            </>
                          }
                        />
                      </li>
                    ))}
                  </ul>
                )}
              </SectionCard>

              <SectionCard title="Support level">
                <SupportLevelBar counts={supportCounts} />
              </SectionCard>
            </div>

            {funnel ? (
              <SectionCard title="Door + text funnel">
                <div className="space-y-2">
                  {[
                    { label: "Doors attempted", value: funnel.doorsAttempted },
                    { label: "Contacted", value: funnel.contacted },
                    { label: "Surveyed", value: funnel.surveyed },
                    { label: "New supporters", value: funnel.newSupporters },
                  ].map((step) => (
                    <ProgressBar
                      key={step.label}
                      tone="success"
                      value={step.value}
                      max={Math.max(1, funnel.doorsAttempted)}
                      label={
                        <>
                          <span>{step.label}</span>
                          <span>{step.value}</span>
                        </>
                      }
                    />
                  ))}
                </div>
              </SectionCard>
            ) : null}
          </>
        ) : null}
      </StateRegion>

      {/* ── Goals & pace (per-campaign only) ─────────────────────────────── */}
      {campaignId ? (
        <div className="max-w-xl space-y-4">
          <SectionCard title={<span className="flex items-center gap-1.5"><Target className="h-3.5 w-3.5" />Goals &amp; pace</span>}>
            <div className="grid grid-cols-2 gap-3">
              <div>
                <label className="mb-1 block text-xs text-muted-foreground">Doors target</label>
                <Input value={doorsGoal} onChange={(e) => setDoorsGoal(e.target.value)} type="number" />
              </div>
              <div>
                <label className="mb-1 block text-xs text-muted-foreground">Conversations target</label>
                <Input value={convGoal} onChange={(e) => setConvGoal(e.target.value)} type="number" />
              </div>
            </div>
            <Button className="mt-3" onClick={saveGoals} disabled={goalsBusy}>
              <Save className="mr-1.5 h-4 w-4" />
              Save goals
            </Button>

            {doorsTarget > 0 || convTarget > 0 || contacted > 0 ? (
              <div className="mt-5 space-y-4 border-t border-border pt-4">
                {doorsTarget > 0 ? (
                  <ProgressBar
                    value={doorsKnocked}
                    max={doorsTarget}
                    label={
                      <>
                        <span>Doors knocked</span>
                        <span>
                          {doorsKnocked}/{doorsTarget} ({Math.round((doorsKnocked / doorsTarget) * 100)}%)
                        </span>
                      </>
                    }
                  />
                ) : null}
                {convTarget > 0 ? (
                  <ProgressBar
                    value={contacted}
                    max={convTarget}
                    tone="primary"
                    label={
                      <>
                        <span>Conversations</span>
                        <span>
                          {contacted}/{convTarget} ({Math.round((contacted / convTarget) * 100)}%)
                        </span>
                      </>
                    }
                  />
                ) : (
                  <p className="text-sm text-muted-foreground">
                    {contacted} conversation{contacted === 1 ? "" : "s"} so far – set a conversations target to track pace.
                  </p>
                )}
              </div>
            ) : null}
          </SectionCard>
        </div>
      ) : null}

      {/* ── Data quality (QA) ────────────────────────────────────────────── */}
      <StateRegion
        loading={qaLoading}
        error={qaError}
        noPermission={qaNoPerm}
        onRetry={() => void refetchQa()}
        errorTitle="Can't load data quality"
        skeleton={<Skeleton className="h-40 w-full" />}
      >
        {flags.length === 0 ? (
          <SectionCard title={<span className="flex items-center gap-1.5"><ShieldCheck className="h-3.5 w-3.5" />Data quality</span>}>
            <p className="flex items-center gap-2 text-sm text-muted-foreground">
              <ShieldCheck className="h-4 w-4 text-success" />
              No suspicious knocks flagged.
            </p>
          </SectionCard>
        ) : (
          <SectionCard
            title={<span className="flex items-center gap-1.5"><ShieldCheck className="h-3.5 w-3.5" />Data quality · {flags.length} flagged</span>}
            description={
              campaignId
                ? "Too-fast cadence or missing GPS — spot-check these."
                : "Across all campaigns — too-fast cadence or missing GPS. Open a campaign to resolve."
            }
          >
            <ul className="space-y-2">
              {flags.map((f) => (
                <li
                  key={f.id}
                  className={`flex flex-wrap items-center gap-2 rounded-xl border border-border px-3 py-2 text-sm ${
                    f.resolved ? "opacity-60" : ""
                  }`}
                >
                  {f.resolved ? (
                    <CheckCircle2 className="h-4 w-4 shrink-0 text-success" />
                  ) : (
                    <AlertTriangle className="h-4 w-4 shrink-0 text-warning-foreground" />
                  )}
                  <span className="min-w-0 flex-1 text-foreground">
                    {f.reason}
                    {f.volunteer ? ` · ${f.volunteer}` : ""}
                  </span>
                  {f.resolved ? (
                    <span className="shrink-0 rounded-full bg-surface-variant px-2 py-0.5 text-[10px] font-bold uppercase tracking-[0.05em] text-muted-foreground">
                      {f.state === "DISMISSED" ? "Dismissed" : "Resolved"}
                    </span>
                  ) : null}
                  <span className="shrink-0 text-xs text-muted-foreground tabular-nums">
                    {new Date(f.at).toLocaleString()}
                  </span>
                  {campaignId ? (
                    <span className="flex shrink-0 items-center gap-1.5">
                      {f.resolved ? (
                        <Button
                          variant="ghost"
                          size="sm"
                          disabled={busyFlag === f.id}
                          onClick={() => void actFlag(f, { resolved: false }, "Flag reopened")}
                        >
                          Undo
                        </Button>
                      ) : (
                        <>
                          <Button
                            variant="outline"
                            size="sm"
                            disabled={busyFlag === f.id}
                            onClick={() => void actFlag(f, { state: "RESOLVED" }, "Flag resolved")}
                          >
                            Resolve
                          </Button>
                          <Button
                            variant="ghost"
                            size="sm"
                            disabled={busyFlag === f.id}
                            onClick={() => void actFlag(f, { state: "DISMISSED" }, "Flag dismissed")}
                          >
                            Dismiss
                          </Button>
                        </>
                      )}
                    </span>
                  ) : null}
                </li>
              ))}
            </ul>
          </SectionCard>
        )}
      </StateRegion>
    </div>
  );
}
