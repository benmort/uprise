"use client";

import { useMemo, useState } from "react";
import { useParams, usePathname, useRouter, useSearchParams } from "next/navigation";
import { CheckCircle2, Copy, PhoneOutgoing, XCircle } from "lucide-react";
import { autodialer } from "@uprise/api-client";
import { useApi, invalidateApi } from "@/lib/use-api";
import { behaviourOf } from "@/components/autodialer/behaviour";
import { CampaignEditor } from "@/components/autodialer/campaign-editor";
import { CampaignMonitor } from "@/components/autodialer/campaign-monitor";
import { CampaignResults } from "@/components/autodialer/campaign-results";
import { PageShell } from "@/components/shell/page-shell";
import { StateRegion } from "@/components/shell/state-region";
import { StatusBadge } from "@/components/ui/status-badge";
import { Skeleton } from "@/components/ui/skeleton";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { ConfirmDialog, SegmentedControl, TooltipHint } from "@uprise/ui";
import { useToast } from "@/components/ui/toast";

type Tab = "overview" | "edit" | "monitor" | "results";
const TABS: ReadonlyArray<{ value: Tab; label: string }> = [
  { value: "overview", label: "Overview" },
  { value: "edit", label: "Edit" },
  { value: "monitor", label: "Monitor" },
  { value: "results", label: "Results" },
];

/**
 * The campaign workbench: header (behaviour + status + lifecycle) over the
 * Overview | Edit | Monitor | Results tabs. Activation is gated by the
 * server-side preflight, surfaced as a readable checklist on Overview.
 */
export default function AutodialerCampaignPage() {
  const params = useParams<{ id: string }>();
  const id = params.id;
  const router = useRouter();
  const pathname = usePathname();
  const searchParams = useSearchParams();
  const { showToast } = useToast();
  const tab = ((): Tab => {
    const t = searchParams.get("tab");
    return t === "edit" || t === "monitor" || t === "results" ? t : "overview";
  })();

  const detail = useApi(`/autodialer/campaigns/${id}`, () => autodialer.get(id));
  const preflight = useApi(`/autodialer/campaigns/${id}/preflight`, () => autodialer.preflight(id), {
    ttlMs: 5_000,
  });

  const [busyAction, setBusyAction] = useState<string | null>(null);
  const [confirmComplete, setConfirmComplete] = useState(false);
  const campaign = detail.data;
  const behaviour = useMemo(() => (campaign ? behaviourOf(campaign) : null), [campaign]);

  const setTab = (next: Tab) =>
    router.replace(next === "overview" ? pathname : `${pathname}?tab=${next}`, { scroll: false });

  const runAction = async (
    key: string,
    action: () => ReturnType<typeof autodialer.activate>,
    doneTitle: string,
  ) => {
    if (busyAction) return;
    setBusyAction(key);
    const res = await action();
    setBusyAction(null);
    if (!res.ok) {
      showToast({ tone: "error", title: "Action failed", description: res.error });
      return;
    }
    showToast({ tone: "success", title: doneTitle });
    invalidateApi(`/autodialer/campaigns/${id}`);
    void detail.refetch();
    void preflight.refetch();
  };

  const clone = async () => {
    if (busyAction) return;
    setBusyAction("clone");
    const res = await autodialer.clone(id);
    setBusyAction(null);
    if (!res.ok) {
      showToast({ tone: "error", title: "Clone failed", description: res.error });
      return;
    }
    showToast({ tone: "success", title: "Campaign cloned", description: "Opening the new draft." });
    router.push(`/autodialer/${encodeURIComponent(res.data.id)}?tab=edit`);
  };

  const lifecycle = campaign ? (
    <div className="flex flex-wrap items-center gap-2">
      {campaign.status === "DRAFT" || campaign.status === "PAUSED" ? (
        <span className="inline-flex items-center gap-1">
          <Button
            size="sm"
            disabled={busyAction !== null || preflight.data?.ok === false}
            onClick={() =>
              void runAction(
                "activate",
                () => (campaign.status === "PAUSED" ? autodialer.resume(id) : autodialer.activate(id)),
                campaign.status === "PAUSED" ? "Campaign resumed" : "Campaign activated",
              )
            }
          >
            {campaign.status === "PAUSED" ? "Resume" : "Activate"}
          </Button>
          {preflight.data?.ok === false ? (
            <TooltipHint
              label={`Blocked by preflight: ${preflight.data.checks
                .filter((c) => !c.ok)
                .map((c) => c.detail)
                .join("; ")}`}
            />
          ) : null}
        </span>
      ) : null}
      {campaign.status === "ACTIVE" ? (
        <>
          <Button
            size="sm"
            variant="outline"
            disabled={busyAction !== null}
            onClick={() => void runAction("pause", () => autodialer.pause(id), "Campaign paused")}
          >
            Pause
          </Button>
          <Button size="sm" variant="outline" disabled={busyAction !== null} onClick={() => setConfirmComplete(true)}>
            Complete
          </Button>
        </>
      ) : null}
      <Button size="sm" variant="ghost" disabled={busyAction !== null} onClick={() => void clone()}>
        <Copy className="mr-1.5 h-4 w-4" /> Clone
      </Button>
    </div>
  ) : null;

  return (
    <PageShell
      icon={PhoneOutgoing}
      title={campaign?.name ?? "Campaign"}
      actions={
        campaign ? (
          <span className="flex flex-wrap items-center gap-2">
            <span className="rounded-full bg-surface-variant px-2 py-0.5 text-xs font-semibold text-muted-foreground">
              {behaviour?.label}
            </span>
            <StatusBadge status={campaign.status} />
            {lifecycle}
          </span>
        ) : null
      }
      backHref="/autodialer"
      backLabel="Campaigns"
    >
      <ConfirmDialog
        open={confirmComplete}
        title="Complete this campaign?"
        description="Dialling stops and the campaign can't be reactivated — clone it to run again."
        confirmLabel="Complete"
        busy={busyAction === "complete"}
        onCancel={() => setConfirmComplete(false)}
        onConfirm={() => {
          void runAction("complete", () => autodialer.complete(id), "Campaign completed").then(() =>
            setConfirmComplete(false),
          );
        }}
      />

      <StateRegion
        loading={detail.loading}
        error={detail.error}
        noPermission={detail.noPermission}
        onRetry={() => void detail.refetch()}
        empty={false}
        skeleton={<Skeleton className="h-96 w-full" />}
      >
        {campaign ? (
          <div className="space-y-4">
            <SegmentedControl value={tab} options={TABS} onChange={setTab} aria-label="Campaign tabs" />

            {tab === "overview" ? (
              <div className="grid gap-4 lg:grid-cols-2">
                <Card className="p-4">
                  <h3 className="text-sm font-semibold">Ready to dial?</h3>
                  <p className="mt-1 text-xs text-muted-foreground">
                    Every check must pass before the campaign can activate.
                  </p>
                  <ul className="mt-3 space-y-2">
                    {(preflight.data?.checks ?? []).map((check) => (
                      <li key={check.key} className="flex items-start gap-2 text-sm">
                        {check.ok ? (
                          <CheckCircle2 className="mt-0.5 h-4 w-4 shrink-0 text-success" aria-hidden />
                        ) : (
                          <XCircle className="mt-0.5 h-4 w-4 shrink-0 text-error" aria-hidden />
                        )}
                        <span className={check.ok ? "text-muted-foreground" : "text-foreground"}>{check.detail}</span>
                      </li>
                    ))}
                  </ul>
                </Card>
                <Card className="p-4">
                  <h3 className="text-sm font-semibold">Set-up</h3>
                  <dl className="mt-3 grid grid-cols-2 gap-x-4 gap-y-2 text-sm">
                    <dt className="text-muted-foreground">Behaviour</dt>
                    <dd>{behaviour?.label}</dd>
                    <dt className="text-muted-foreground">Calling window</dt>
                    <dd className="font-mono text-xs">{campaign.dailyStart}–{campaign.dailyFinish}</dd>
                    <dt className="text-muted-foreground">Pace</dt>
                    <dd>
                      {campaign.batchSize} calls / {campaign.dialerPeriodMinutes} min
                    </dd>
                    <dt className="text-muted-foreground">Attempt cap</dt>
                    <dd>
                      {campaign.maxCallAttempts} tries · {campaign.noCallWindowHours}h between
                    </dd>
                    <dt className="text-muted-foreground">Machine detection</dt>
                    <dd>{campaign.amdEnabled ? "On" : "Off"}</dd>
                    <dt className="text-muted-foreground">Recording</dt>
                    <dd>{campaign.recordingEnabled ? "On" : "Off"}</dd>
                  </dl>
                </Card>
              </div>
            ) : null}

            {tab === "edit" ? (
              <CampaignEditor
                campaign={campaign}
                onSaved={() => {
                  invalidateApi(`/autodialer/campaigns/${id}`);
                  void detail.refetch();
                  void preflight.refetch();
                }}
              />
            ) : null}

            {tab === "monitor" ? <CampaignMonitor campaignId={id} /> : null}
            {tab === "results" ? <CampaignResults campaignId={id} behaviour={behaviour?.key ?? "broadcast"} /> : null}
          </div>
        ) : null}
      </StateRegion>
    </PageShell>
  );
}
