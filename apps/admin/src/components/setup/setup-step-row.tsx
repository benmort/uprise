"use client";

import Link from "next/link";
import { AlertCircle, CheckCircle2, Circle, Clock3, Lock } from "lucide-react";
import type { ChannelSetupStep, SetupStep } from "@uprise/api-client";
import { cn } from "@/lib/utils";
import { Button } from "@/components/ui/button";
import { STEP_META, stepTitle } from "@/lib/setup/step-registry";
import { chipStatus } from "@/lib/setup/setup-state";
import { SetupChip } from "./setup-chip";

type AnyStep = SetupStep | ChannelSetupStep;

function RowIcon({ status }: { status: string }) {
  switch (status) {
    case "DONE":
      return <CheckCircle2 className="h-5 w-5 text-success" />;
    case "ACTION_REQUIRED":
    case "FAILED":
      return <AlertCircle className="h-5 w-5 text-warning-foreground" />;
    case "IN_PROGRESS":
    case "REQUESTED":
      return <Clock3 className="h-5 w-5 text-primary" />;
    case "PLAN_LOCKED":
      return <Lock className="h-5 w-5 text-muted-foreground" />;
    default:
      return <Circle className="h-5 w-5 text-muted-foreground/50" />;
  }
}

/**
 * One setup step — full row for the getting-started page, `compact` for the tracker.
 * Chips never carry actions; the CTA does. Plan-locked rows grey out and lose the CTA
 * (the flow section's upgrade banner carries the escape hatch).
 */
export function SetupStepRow({ step, compact = false }: { step: AnyStep; compact?: boolean }) {
  const status = chipStatus(step);
  const meta = STEP_META[step.key];
  const done = status === "DONE";
  const planLocked = status === "PLAN_LOCKED";
  const reason = "reason" in step ? step.reason : null;

  if (compact) {
    return (
      <Link
        href={meta?.href ?? "/getting-started"}
        className={cn(
          "flex items-center gap-2.5 rounded-lg px-2.5 py-2 text-sm font-medium text-foreground transition-colors hover:bg-surface-variant",
          planLocked && "pointer-events-none opacity-60",
        )}
      >
        <RowIcon status={status} />
        <span className={cn("min-w-0 flex-1 truncate", done && "text-muted-foreground line-through")}>
          {stepTitle(step.key)}
        </span>
        <SetupChip step={step} />
      </Link>
    );
  }

  return (
    <div className={cn("flex items-center gap-3.5 rounded-xl px-3 py-3 hover:bg-background", planLocked && "opacity-60")}>
      <span className="shrink-0"><RowIcon status={status} /></span>
      <div className="min-w-0 flex-1">
        <p className={cn("text-sm font-semibold text-foreground", done && "font-medium text-muted-foreground line-through")}>
          {stepTitle(step.key)}
        </p>
        {meta?.blurb ? <p className="mt-0.5 text-xs text-muted-foreground">{meta.blurb}</p> : null}
        {reason ? <p className="mt-1 text-xs font-medium text-warning-foreground">{reason}</p> : null}
      </div>
      <SetupChip step={step} className="shrink-0" />
      {!done && !planLocked && meta ? (
        <Button
          asChild
          size="sm"
          variant={status === "ACTION_REQUIRED" ? "default" : "outline"}
          className="shrink-0"
        >
          <Link href={meta.href}>{status === "ACTION_REQUIRED" ? "Fix" : meta.cta}</Link>
        </Button>
      ) : null}
    </div>
  );
}
