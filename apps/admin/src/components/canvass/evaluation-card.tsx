"use client";

import { Spinner } from "@uprise/ui";
import { useCallback, useEffect, useState } from "react";
import { FlaskConical, Snowflake } from "lucide-react";
import {
  type CampaignEvaluation,
  type EvaluationPower,
  disableEvaluation,
  enableEvaluation,
  getCampaignEvaluation,
  getEvaluationPower,
  snapshotCampaignHeat,
} from "@/lib/api/campaigns";
import { CollapsibleCard } from "@/components/canvass/geo-panels/collapsible-card";
import { Button } from "@/components/ui/button";
import { useToast } from "@/components/ui/toast";

/**
 * Evaluation mode: pair-matched randomised holdouts so the campaign's effect can be
 * read honestly (comparing canvassed to un-canvassed areas without randomisation is
 * the model grading its own homework). Shows the power maths BEFORE committing, and
 * the pre-election snapshot freeze that makes post-election validation out-of-sample.
 */
export function EvaluationCard({
  id,
  campaignId,
  onChanged,
}: {
  /** Accordion id. */
  id: string;
  campaignId: string;
  /** Assignment changed — reload the heat overlay so holdouts (un)hatch. */
  onChanged?: (evaluation: CampaignEvaluation | null) => void;
}) {
  const { showToast } = useToast();
  const [evaluation, setEvaluation] = useState<CampaignEvaluation | null>(null);
  const [power, setPower] = useState<EvaluationPower | null>(null);
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState(false);

  const load = useCallback(async () => {
    const res = await getCampaignEvaluation(campaignId);
    if (res.ok) {
      setEvaluation(res.data.evaluation);
      onChanged?.(res.data.evaluation);
      if (!res.data.evaluation) {
        const p = await getEvaluationPower(campaignId);
        if (p.ok) setPower(p.data);
      }
    }
    setLoading(false);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [campaignId]);

  useEffect(() => {
    void load();
  }, [load]);

  const enable = async () => {
    setBusy(true);
    const res = await enableEvaluation(campaignId);
    setBusy(false);
    if (!res.ok) return showToast({ tone: "error", title: "Couldn't enable evaluation", description: res.error });
    setEvaluation(res.data);
    onChanged?.(res.data);
    showToast({ tone: "success", title: "Holdout assigned", description: `${res.data.holdoutCodes.length} areas withheld — the assignment is now immutable.` });
  };

  const disable = async () => {
    setBusy(true);
    const res = await disableEvaluation(campaignId);
    setBusy(false);
    if (!res.ok) return showToast({ tone: "error", title: "Couldn't disable", description: res.error });
    setEvaluation(null);
    onChanged?.(null);
    void load();
  };

  const freeze = async () => {
    setBusy(true);
    const res = await snapshotCampaignHeat(campaignId);
    setBusy(false);
    if (!res.ok) return showToast({ tone: "error", title: "Couldn't freeze snapshot", description: res.error });
    showToast({
      tone: "success",
      title: "Snapshot frozen",
      description: "This score run is now the pre-election benchmark — post-election validation reads against it.",
    });
  };

  return (
    <CollapsibleCard id={id} title="Evaluation" description="Randomised holdout + pre-election snapshot">
      {loading ? (
        <Spinner className="h-4 w-4 animate-spin text-muted-foreground" />
      ) : evaluation ? (
        <div className="space-y-2 text-sm">
          <p className="flex items-center gap-1.5 font-semibold text-foreground">
            <FlaskConical className="h-4 w-4" />
            Holdout live — {evaluation.holdoutCodes.length} of{" "}
            {evaluation.holdoutCodes.length + evaluation.treatmentCodes.length} areas withheld
          </p>
          <p className="text-muted-foreground">
            Detectable effect ≈ {evaluation.power.mdePercentagePoints}pp ·{" "}
            {evaluation.power.clustersPerArm} clusters/arm · design effect ×{evaluation.power.designEffect}
          </p>
          {evaluation.power.warning ? (
            <p className="text-xs text-warning-foreground">{evaluation.power.warning}</p>
          ) : null}
          <p className="text-xs text-muted-foreground">
            Holdout areas are shaded on the map — turf cut there is refused. Assignment locks once
            walklists exist.
          </p>
          <div className="flex gap-2 pt-1">
            <Button size="sm" variant="outline" disabled={busy} onClick={() => void freeze()}>
              <Snowflake className="mr-1.5 h-3.5 w-3.5" />
              Freeze snapshot
            </Button>
            <Button size="sm" variant="ghost" disabled={busy} onClick={() => void disable()}>
              Disable
            </Button>
          </div>
        </div>
      ) : (
        <div className="space-y-2 text-sm">
          <p className="text-muted-foreground">
            Withhold a randomised, pair-matched set of areas so the program's effect can be measured
            against booth results — the only comparison that survives scrutiny.
          </p>
          {power ? (
            power.refusal ? (
              <p className="text-xs text-warning-foreground">{power.refusal}</p>
            ) : (
              <p className="text-xs text-muted-foreground">
                This boundary supports ~{power.clustersPerArm} clusters/arm — detectable effect ≈{" "}
                {power.mdePercentagePoints}pp{power.warning ? ` · ${power.warning}` : ""}
              </p>
            )
          ) : null}
          <div className="flex gap-2 pt-1">
            <Button size="sm" disabled={busy || Boolean(power?.refusal)} onClick={() => void enable()}>
              <FlaskConical className="mr-1.5 h-3.5 w-3.5" />
              Enable evaluation
            </Button>
            <Button size="sm" variant="outline" disabled={busy} onClick={() => void freeze()}>
              <Snowflake className="mr-1.5 h-3.5 w-3.5" />
              Freeze snapshot
            </Button>
          </div>
        </div>
      )}
    </CollapsibleCard>
  );
}
