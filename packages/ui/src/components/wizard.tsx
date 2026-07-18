"use client";

import * as React from "react";
import { ArrowLeft, ArrowRight, Check } from "lucide-react";
import { cn } from "../lib/utils";
import { Button } from "./button";
import { StepProgress } from "./step-progress";
import { furthestReachableStep } from "../lib/wizard-steps";

export type WizardStep = {
  key: string;
  label: string;
  content: React.ReactNode;
  /** False → this step's inputs are incomplete: Next/Complete is disabled and later steps
   *  can't be jumped to. Defaults to true (always advanceable). */
  canAdvance?: boolean;
};

export interface WizardProps {
  steps: WizardStep[];
  /** Controlled current step (0-based). Omit to let the Wizard own its position. */
  current?: number;
  onStepChange?: (index: number) => void;
  /** Fired when Complete is pressed on the last step. */
  onComplete: () => void;
  completeLabel?: string;
  busy?: boolean;
  className?: string;
}

/**
 * A reusable multi-step form shell — a segmented StepProgress header, the active step's
 * content, and a Back / Next / Complete footer. Steps declare `canAdvance` to gate progress;
 * the header only lets you jump as far as the first incomplete step. Controlled (`current` +
 * `onStepChange`, e.g. synced to `?step=`) or self-managed. Built for reuse across create and
 * management flows (events, campaigns, channels, …).
 */
export function Wizard({
  steps,
  current,
  onStepChange,
  onComplete,
  completeLabel = "Finish",
  busy = false,
  className,
}: WizardProps) {
  const [internal, setInternal] = React.useState(0);
  const idx = Math.min(Math.max(current ?? internal, 0), Math.max(steps.length - 1, 0));

  const go = (i: number) => {
    const next = Math.max(0, Math.min(i, steps.length - 1));
    onStepChange?.(next);
    if (current === undefined) setInternal(next);
  };

  const complete = steps.map((s) => s.canAdvance !== false);
  const reachable = furthestReachableStep(complete); // 0-based cap
  const step = steps[idx];
  const isLast = idx === steps.length - 1;
  const canAdvance = complete[idx] ?? true;

  return (
    <div className={cn("space-y-6", className)}>
      <StepProgress
        current={idx + 1}
        total={steps.length}
        labels={steps.map((s) => s.label)}
        reachable={reachable + 1}
        onSelect={(step1) => go(step1 - 1)}
      />
      <div className="flex items-center gap-2 text-sm">
        <span className="rounded-full bg-primary/10 px-2.5 py-0.5 font-semibold text-primary">
          Step {idx + 1} of {steps.length}
        </span>
        <span className="font-semibold text-foreground">{step?.label}</span>
      </div>

      <div>{step?.content}</div>

      <div className="flex items-center justify-between gap-2 border-t border-border pt-4">
        <Button type="button" variant="ghost" onClick={() => go(idx - 1)} disabled={idx === 0 || busy}>
          <ArrowLeft className="mr-1.5 h-4 w-4" /> Back
        </Button>
        {isLast ? (
          <Button type="button" onClick={onComplete} disabled={!canAdvance || busy}>
            <Check className="mr-1.5 h-4 w-4" /> {busy ? "Working…" : completeLabel}
          </Button>
        ) : (
          <Button type="button" onClick={() => go(idx + 1)} disabled={!canAdvance || busy}>
            Next <ArrowRight className="ml-1.5 h-4 w-4" />
          </Button>
        )}
      </div>
    </div>
  );
}
