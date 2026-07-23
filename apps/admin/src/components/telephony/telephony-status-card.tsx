"use client";

import { Spinner } from "@uprise/ui";
import { useCallback, useEffect, useMemo, useState } from "react";
import { ChevronDown, Phone, PhoneOff, Plus } from "lucide-react";
import {
  telephony,
  type TelephonyPhoneNumber,
  type TelephonyProvisioningRun,
  type TelephonyProvisioningStep,
} from "@uprise/api-client";
import { StatusBadge, StepProgress, isAuMobile } from "@uprise/ui";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { getFeatureFlags } from "@/lib/api";
import { getSession } from "@/lib/session";
import { cn } from "@/lib/utils";
import { ProvisioningTimeline, telephonyStepIndex } from "./provisioning-timeline";
import { ProvisionNumberDialog } from "./provision-number-dialog";
import { LockedAction } from "@/components/setup/locked-action";
import { useSetupGate } from "@/components/setup/use-setup-state";

type RunWithSteps = TelephonyProvisioningRun & { steps: TelephonyProvisioningStep[] };

const LIVE_POLL_MS = 5_000;
const TERMINAL = new Set(["ACTIVE", "FAILED"]);

/** The number outbound calls originate from (voice-capable + marked transactional). */
function callsNumber(numbers: TelephonyPhoneNumber[]): TelephonyPhoneNumber | null {
  return (
    numbers.find(
      (n) => n.status === "ACTIVE" && n.purpose === "transactional" && !isAuMobile(n.phoneNumberE164),
    ) ?? null
  );
}

/**
 * Owner-facing telephony card for the calls/channels pages: the organisation's
 * numbers with voice/SMS capability tags, the live provisioning progress
 * (status chip + step bar + expandable timeline, polled while a run is in
 * flight), self-serve "get a local number" provisioning, and the blocked-state
 * warning when only SMS-only mobiles exist (+614 can't place outbound calls).
 *
 * By default it self-hides when there is nothing to show (flag off / no history).
 * Pass `onboarding` to instead render a "set up a number" prompt in that case.
 */
export function TelephonyStatusCard({
  tenantId: tenantIdProp,
  onboarding = false,
}: {
  tenantId?: string;
  onboarding?: boolean;
}) {
  const [visible, setVisible] = useState(false);
  const [canProvision, setCanProvision] = useState(false);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [numbers, setNumbers] = useState<TelephonyPhoneNumber[]>([]);
  const [latestRun, setLatestRun] = useState<RunWithSteps | null>(null);
  const [timelineOpen, setTimelineOpen] = useState(false);
  const [provisionOpen, setProvisionOpen] = useState(false);
  const [savingNumberId, setSavingNumberId] = useState<string | null>(null);

  const load = useCallback(async () => {
    const tenantId = tenantIdProp ?? (await getSession())?.tenantId ?? undefined;
    if (!tenantId) return;
    const [numbersRes, runsRes] = await Promise.all([
      telephony.listNumbers(tenantId),
      telephony.listRuns(tenantId),
    ]);
    if (numbersRes.ok) setNumbers(numbersRes.data);
    else setError(numbersRes.error);
    if (!runsRes.ok) setError(runsRes.error);
    const newest = runsRes.ok ? runsRes.data[0] : undefined;
    if (newest) {
      const run = await telephony.getRun(newest.id);
      if (run.ok) setLatestRun(run.data);
    } else {
      setLatestRun(null);
    }
  }, [tenantIdProp]);

  useEffect(() => {
    let alive = true;
    void (async () => {
      const [flags, session] = await Promise.all([getFeatureFlags(), getSession()]);
      const on = flags.ok ? Boolean(flags.data.FEATURE_TENANT_TELEPHONY_ENABLED) : false;
      if (!alive) return;
      setVisible(on);
      // Self-serve provisioning is owner/organiser territory (manage telephony.all).
      setCanProvision(
        Boolean(session?.isSuperAdmin || session?.role === "OWNER" || session?.role === "ORGANISER"),
      );
      if (on) await load();
      if (alive) setLoading(false);
    })();
    return () => {
      alive = false;
    };
  }, [load]);

  // Poll while a run is in flight so the chip/progress track the automation live.
  const runLive = Boolean(latestRun && !TERMINAL.has(latestRun.status));
  useEffect(() => {
    if (!runLive || !latestRun) return;
    const id = setInterval(() => {
      void telephony.getRun(latestRun.id).then((res) => {
        if (!res.ok) return;
        setLatestRun(res.data);
        // A finished run changes the numbers list too (purchase → ACTIVE).
        if (TERMINAL.has(res.data.status)) void load();
      });
    }, LIVE_POLL_MS);
    return () => clearInterval(id);
  }, [runLive, latestRun, load]);

  const activeVoice = callsNumber(numbers);
  const voiceCandidates = useMemo(
    () => numbers.filter((n) => n.status === "ACTIVE" && !isAuMobile(n.phoneNumberE164)),
    [numbers],
  );
  // Blocked: every usable number is an SMS-only mobile (or none exist at all).
  const voiceBlocked = !loading && !activeVoice && voiceCandidates.length === 0;
  const localRunLive = runLive && latestRun?.numberType === "local";

  const useForCalls = async (n: TelephonyPhoneNumber) => {
    setSavingNumberId(n.id);
    const res = await telephony.setPurpose(n.id, "transactional");
    setSavingNumberId(null);
    if (res.ok) setNumbers((prev) => prev.map((p) => (p.id === n.id ? res.data : p)));
    else setError(res.error);
  };

  // Advisory mirror of the server's provisioning gate: the CTA stays visible but locked
  // (with the missing-steps popover) until org identification is complete. The dialog's
  // 422 branch remains the server-truth fallback.
  const gate = useSetupGate("canProvisionTelephony");
  const provisionCta = canProvision ? (
    <LockedAction
      locked={gate.locked}
      planLocked={gate.planLocked}
      missing={gate.missing}
      label="Get a local number for calls"
    >
      <Button size="sm" variant="outline" onClick={() => setProvisionOpen(true)}>
        <Plus className="mr-1.5 h-4 w-4" />
        Get a local number for calls
      </Button>
    </LockedAction>
  ) : null;

  // Something meaningful to render — but only when the feature is on for this tenant.
  const showReal = visible && (loading || Boolean(error) || numbers.length > 0 || Boolean(latestRun));

  const dialog = (
    <ProvisionNumberDialog
      open={provisionOpen}
      onClose={() => setProvisionOpen(false)}
      onStarted={(run) => {
        setLatestRun({ ...run, steps: [] });
        setTimelineOpen(true);
      }}
    />
  );

  if (!showReal) {
    // Nothing to show: onboarding placement prompts setup; elsewhere it self-hides.
    if (!visible || !onboarding) return null;
    return (
      <Card id="numbers" className="scroll-mt-24">
        {dialog}
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <Phone className="h-4 w-4" />
            Set up your calling &amp; text number
          </CardTitle>
        </CardHeader>
        <CardContent className="space-y-3">
          <p className="text-sm text-muted-foreground">
            Get a dedicated number so your calls and texts come from your organisation — a local
            number places calls; a mobile number sends texts.
          </p>
          {provisionCta}
        </CardContent>
      </Card>
    );
  }

  return (
    <Card id="numbers" className="scroll-mt-24">
      {dialog}
      <CardHeader className="flex-row items-center justify-between space-y-0">
        <CardTitle className="flex items-center gap-2">
          <Phone className="h-4 w-4" />
          Phone numbers
        </CardTitle>
        {!loading && !voiceBlocked ? provisionCta : null}
      </CardHeader>
      <CardContent className="space-y-4">
        {loading ? (
          <Spinner className="h-5 w-5 animate-spin text-muted-foreground" />
        ) : error ? (
          <p className="text-sm text-error">Couldn&rsquo;t load telephony status: {error}</p>
        ) : (
          <>
            {voiceBlocked && !localRunLive ? (
              <div className="flex flex-wrap items-center gap-3 rounded-lg border border-warning/40 bg-warning-container/40 p-3">
                <PhoneOff className="h-4 w-4 shrink-0 text-warning-foreground" />
                <p className="min-w-0 flex-1 text-sm text-warning-foreground">
                  Mobile numbers can&rsquo;t place outbound calls — calls need a local number.
                </p>
                {provisionCta}
              </div>
            ) : null}

            {numbers.length > 0 ? (
              <ul className="space-y-2">
                {numbers.map((n) => {
                  const mobile = isAuMobile(n.phoneNumberE164);
                  const isCallsNumber = activeVoice?.id === n.id;
                  const canUseForCalls =
                    canProvision && !mobile && n.status === "ACTIVE" && !isCallsNumber;
                  return (
                    <li
                      key={n.id}
                      className="flex flex-wrap items-center gap-3 rounded-lg border border-border p-3"
                    >
                      <span className="font-mono text-sm font-semibold">{n.phoneNumberE164}</span>
                      {n.nickname?.trim() ? (
                        <span className="truncate text-xs text-muted-foreground">{n.nickname}</span>
                      ) : null}
                      <span
                        className={cn(
                          "rounded-full px-2 py-0.5 text-xs font-bold uppercase",
                          mobile
                            ? "bg-surface-variant text-muted-foreground"
                            : "bg-primary-container text-foreground",
                        )}
                      >
                        {mobile ? "SMS only" : "Calls"}
                      </span>
                      <StatusBadge status={n.status} />
                      {isCallsNumber ? (
                        <span className="rounded-full bg-success-container px-2 py-0.5 text-xs font-bold uppercase text-success">
                          Calls number
                        </span>
                      ) : null}
                      {canUseForCalls ? (
                        <Button
                          size="sm"
                          variant="ghost"
                          className="ml-auto"
                          disabled={savingNumberId === n.id}
                          onClick={() => void useForCalls(n)}
                        >
                          {savingNumberId === n.id ? (
                            <Spinner className="mr-1.5 h-3.5 w-3.5 animate-spin" />
                          ) : null}
                          Use for calls
                        </Button>
                      ) : null}
                    </li>
                  );
                })}
              </ul>
            ) : null}

            {latestRun && latestRun.status !== "ACTIVE" ? (
              <div className="rounded-lg border border-border p-3">
                <div className="flex flex-wrap items-center gap-3">
                  <StatusBadge status={latestRun.status} />
                  <span className="text-sm font-semibold text-foreground">
                    {latestRun.numberType === "local" ? "Local number" : "Mobile number"} setup
                  </span>
                  {(() => {
                    const { step, total } = telephonyStepIndex(
                      latestRun.status === "FAILED"
                        ? latestRun.resumeStatus ?? latestRun.status
                        : latestRun.status,
                    );
                    return (
                      <span className="text-xs text-muted-foreground tabular-nums">
                        step {step} of {total}
                      </span>
                    );
                  })()}
                  <button
                    type="button"
                    onClick={() => setTimelineOpen((v) => !v)}
                    aria-expanded={timelineOpen}
                    className="ml-auto flex items-center gap-1 text-xs font-semibold text-muted-foreground transition hover:text-foreground"
                  >
                    Details
                    <ChevronDown className={cn("h-3.5 w-3.5 transition-transform", timelineOpen && "rotate-180")} />
                  </button>
                </div>
                <StepProgress
                  className="mt-2"
                  current={
                    telephonyStepIndex(
                      latestRun.status === "FAILED"
                        ? latestRun.resumeStatus ?? latestRun.status
                        : latestRun.status,
                    ).step
                  }
                  total={telephonyStepIndex(latestRun.status).total}
                />
                {timelineOpen ? (
                  <div className="mt-3 border-t border-border pt-3">
                    <ProvisioningTimeline run={latestRun} steps={latestRun.steps} />
                  </div>
                ) : null}
              </div>
            ) : null}
          </>
        )}
      </CardContent>
    </Card>
  );
}
