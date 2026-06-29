"use client";

import { useCallback, useEffect, useState } from "react";
import Link from "next/link";
import { useParams } from "next/navigation";
import { ArrowLeft, Save, Target } from "lucide-react";
import {
  getCampaign,
  getCampaignSummary,
  updateCampaign,
  type CampaignKpis,
} from "@/lib/api/campaigns";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Skeleton } from "@/components/ui/skeleton";
import { SectionCard } from "@uprise/field";
import { ProgressBar } from "@uprise/field";
import { useToast } from "@/components/ui/toast";

export default function GoalsPage() {
  const { campaignId } = useParams<{ campaignId: string }>();
  const { showToast } = useToast();
  const [doorsGoal, setDoorsGoal] = useState("");
  const [convGoal, setConvGoal] = useState("");
  const [kpis, setKpis] = useState<CampaignKpis | null>(null);
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState(false);

  const load = useCallback(async () => {
    const [c, s] = await Promise.all([getCampaign(campaignId), getCampaignSummary(campaignId)]);
    if (c.ok) {
      const goals = (c.data.goals ?? {}) as Record<string, number>;
      setDoorsGoal(goals.doors ? String(goals.doors) : "");
      setConvGoal(goals.conversations ? String(goals.conversations) : "");
    }
    if (s.ok) setKpis(s.data);
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

  return (
    <div className="page-stack max-w-xl">
      <div className="flex items-center gap-2">
        <Button asChild variant="ghost" size="sm">
          <Link href="/canvass">
            <ArrowLeft className="mr-1 h-4 w-4" />
            Canvass
          </Link>
        </Button>
        <h1 className="text-2xl font-extrabold">Goals &amp; pace</h1>
      </div>

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

      {doorsTarget > 0 ? (
        <SectionCard title={<span className="flex items-center gap-1.5"><Target className="h-3.5 w-3.5" />Pace to target</span>}>
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
        </SectionCard>
      ) : null}
    </div>
  );
}
