"use client";

import { Lock } from "lucide-react";
import { StatusBadge, StepProgress } from "@uprise/ui";
import type { ChannelSetupStep, SetupStep } from "@uprise/api-client";
import { FLOW_META, type SetupFlowKey } from "@/lib/setup/step-registry";
import { flowProgress } from "@/lib/setup/setup-state";
import { Button } from "@/components/ui/button";
import { SetupStepRow } from "./setup-step-row";

type AnyStep = SetupStep | ChannelSetupStep;

/**
 * One flow (Self / Organisation / Channels) as a card: header with the flow's label,
 * blurb and "n of m" progress, the step rows, then any embedded content (the channel
 * cards). A channels flow whose every step is plan-locked collapses to the upgrade
 * banner — with the reassurance that shared-channel sending is unaffected.
 */
export function SetupFlowSection({
  flow,
  steps,
  children,
}: {
  flow: SetupFlowKey;
  steps: AnyStep[];
  children?: React.ReactNode;
}) {
  const meta = FLOW_META[flow];
  const progress = flowProgress(steps);
  const Icon = meta.icon;
  const allPlanLocked =
    steps.length > 0 && steps.every((s) => "planLocked" in s && (s as ChannelSetupStep).planLocked);

  return (
    <section
      id={flow}
      className="rounded-2xl border border-border bg-surface shadow-card animate-fade-up"
    >
      <div className="flex flex-wrap items-center justify-between gap-3 px-5 pb-2 pt-5">
        <div className="min-w-0">
          <h2 className="flex items-center gap-2.5 text-base font-bold text-foreground">
            <Icon className="h-4.5 w-4.5 text-primary" />
            {meta.label}
          </h2>
          <p className="mt-0.5 text-sm text-muted-foreground">{meta.blurb}</p>
        </div>
        {flow === "account" ? (
          // Account setup is a recommended extra, not counted setup work — a chip, not a score.
          <StatusBadge status="RECOMMENDED" label="Recommended" className="shrink-0" />
        ) : progress.total > 0 && !allPlanLocked ? (
          <div className="flex shrink-0 items-center gap-2.5">
            <span className="text-xs font-semibold text-muted-foreground tabular-nums">
              {progress.done}/{progress.total}
            </span>
            <StepProgress current={progress.done} total={progress.total} className="w-28" />
          </div>
        ) : null}
      </div>

      {allPlanLocked ? (
        <div className="px-5 pb-5 pt-1">
          <div className="flex flex-wrap items-start gap-3 rounded-xl border border-dashed border-border bg-surface-variant p-4">
            <Lock className="mt-0.5 h-4 w-4 shrink-0 text-muted-foreground" />
            <p className="min-w-0 flex-1 text-sm text-muted-foreground">
              <span className="font-semibold text-foreground">
                Dedicated channels aren&apos;t part of your plan.
              </span>{" "}
              You&apos;re sending on shared Uprise numbers and addresses — that keeps working exactly as
              it does today. Upgrade to text, call and email from numbers your organisation owns.
            </p>
            <Button asChild size="sm" variant="outline" className="shrink-0">
              <a href="mailto:support@uprise.org.au?subject=Upgrading%20our%20plan">
                Talk to us about upgrading
              </a>
            </Button>
          </div>
        </div>
      ) : (
        <>
          <div className="px-2 pb-2">
            {steps.map((s) => (
              <SetupStepRow key={s.key} step={s} />
            ))}
          </div>
          {children ? <div className="space-y-4 px-5 pb-5">{children}</div> : null}
        </>
      )}
    </section>
  );
}
