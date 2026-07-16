"use client";

import { useCallback, useEffect, useState } from "react";
import { useParams } from "next/navigation";
import { Save, Target } from "lucide-react";
import { CampaignPageHeader } from "@/components/canvass/campaign-page-header";
import {
  getCampaign,
  getCampaignResults,
  getCampaignSummary,
  updateCampaign,
  type CampaignKpis,
} from "@/lib/api/campaigns";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Skeleton } from "@/components/ui/skeleton";
import { SectionCard } from "@uprise/field";
import { ProgressBar } from "@uprise/field";
import { StateRegion } from "@/components/shell/state-region";
import { useToast } from "@/components/ui/toast";

export default function GoalsPage() {
  const { campaignId } = useParams<{ campaignId: string }>();
  const { showToast } = useToast();
  const [doorsGoal, setDoorsGoal] = useState("");
  const [convGoal, setConvGoal] = useState("");
  const [kpis, setKpis] = useState<CampaignKpis | null>(null);
  const [contacted, setContacted] = useState(0);
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [noPermission, setNoPermission] = useState(false);

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    setNoPermission(false);
    // getCampaign carries the goals JSON, so its failure drives the page state;
    // the summary + results feed the pace bars and degrade to zero on error.
    const [c, s, r] = await Promise.all([
      getCampaign(campaignId),
      getCampaignSummary(campaignId),
      getCampaignResults(campaignId),
    ]);
    if (!c.ok) {
      setNoPermission(c.status === 403);
      setError(c.error);
      setLoading(false);
      return;
    }
    const goals = (c.data.goals ?? {}) as Record<string, number>;
    setDoorsGoal(goals.doors ? String(goals.doors) : "");
    setConvGoal(goals.conversations ? String(goals.conversations) : "");
    if (s.ok) setKpis(s.data);
    if (r.ok) setContacted(r.data.funnel.contacted);
    setLoading(false);
  }, [campaignId]);

  useEffect(() => {
    void load();
  }, [load]);

  const save = useCallback(async () => {
    setBusy(true);
    const goals: Record<string, number> = {};
    if (Number(doorsGoal) > 0) goals.doors = Number(doorsGoal);
    if (Number(convGoal) > 0) goals.conversations = Number(convGoal);
    const res = await updateCampaign(campaignId, { goals: Object.keys(goals).length ? goals : null });
    setBusy(false);
    if (!res.ok) {
      showToast({ tone: "error", title: "Couldn't save goals", description: res.error });
      return;
    }
    showToast({ tone: "success", title: "Goals saved" });
  }, [campaignId, doorsGoal, convGoal, showToast]);

  if (loading) return <div className="page-stack"><Skeleton className="h-48 w-full" /></div>;

  const doorsKnocked = kpis?.knockedStops ?? 0;
  const doorsTarget = Number(doorsGoal) || 0;
  const convTarget = Number(convGoal) || 0;

  return (
    <div className="page-stack max-w-xl">
      {/* Goals are per-campaign configuration — no cross-campaign aggregate makes sense here. */}
      <CampaignPageHeader title="Goals & pace" icon={Target} allowAllCampaigns={false} />

      <StateRegion error={error} noPermission={noPermission} onRetry={() => void load()}>
        <SectionCard title="Targets">
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
          <Button className="mt-3" onClick={save} disabled={busy}>
            <Save className="mr-1.5 h-4 w-4" />
            Save goals
          </Button>
        </SectionCard>

        {doorsTarget > 0 || convTarget > 0 || contacted > 0 ? (
          <SectionCard title={<span className="flex items-center gap-1.5"><Target className="h-3.5 w-3.5" />Pace to target</span>}>
            <div className="space-y-4">
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
          </SectionCard>
        ) : null}
      </StateRegion>
    </div>
  );
}
