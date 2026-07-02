"use client";

import { Check, CircleDashed, Loader2, SkipForward, X } from "lucide-react";
import type {
  TelephonyProvisioningRun,
  TelephonyProvisioningStatus,
  TelephonyProvisioningStep,
} from "@uprise/api-client";
import { cn } from "@uprise/ui";

/** Canonical step order for the provisioning journey (append-only rows fold onto these). */
const STEPS: Array<{ key: string; label: string; hint?: string }> = [
  { key: "run.requested", label: "Requested" },
  { key: "subaccount.create", label: "Twilio subaccount" },
  { key: "compliance.draft", label: "Compliance details" },
  { key: "compliance.submit", label: "Submitted for review" },
  { key: "compliance.review", label: "Regulatory review", hint: "Review by Twilio can take hours – days" },
  { key: "number.purchase", label: "Mobile number purchased" },
  { key: "webhooks.configure", label: "Webhooks configured" },
  { key: "activate", label: "Live" },
];

/** Which canonical step is "in progress" for each run status. */
const CURRENT_STEP: Record<TelephonyProvisioningStatus, string | null> = {
  REQUESTED: "subaccount.create",
  SUBACCOUNT_CREATED: "compliance.draft",
  COMPLIANCE_DRAFT: "compliance.submit",
  COMPLIANCE_SUBMITTED: "compliance.review",
  COMPLIANCE_APPROVED: "number.purchase",
  COMPLIANCE_REJECTED: "compliance.review",
  NUMBER_PURCHASED: "webhooks.configure",
  WEBHOOKS_CONFIGURED: "activate",
  ACTIVE: null,
  FAILED: null,
};

type RowState = "done" | "skipped" | "failed" | "current" | "pending";

function rowState(
  stepKey: string,
  latest: TelephonyProvisioningStep | undefined,
  run: Pick<TelephonyProvisioningRun, "status" | "lastError">,
): RowState {
  const current = CURRENT_STEP[run.status];
  if (latest?.status === "SUCCEEDED") return "done";
  if (latest?.status === "SKIPPED") return "skipped";
  if (latest?.status === "FAILED") return "failed";
  if (run.status !== "FAILED" && current === stepKey) return "current";
  return "pending";
}

/**
 * Read-only provisioning timeline, shared by the super-admin tenant page and
 * the owner's tenant-settings card. Folds the append-only step rows onto the
 * canonical journey; the run status drives the in-progress marker.
 */
export function ProvisioningTimeline({
  run,
  steps,
}: {
  run: Pick<TelephonyProvisioningRun, "status" | "lastError">;
  steps: TelephonyProvisioningStep[];
}) {
  const latestByStep = new Map<string, TelephonyProvisioningStep>();
  for (const step of steps) latestByStep.set(step.step, step); // rows arrive oldest → newest

  return (
    <ol className="space-y-0">
      {STEPS.map((def, i) => {
        const latest = latestByStep.get(def.key);
        const state = rowState(def.key, latest, run);
        const isLast = i === STEPS.length - 1;
        return (
          <li key={def.key} className="relative flex gap-3 pb-4 last:pb-0">
            {!isLast ? <span className="absolute left-[11px] top-6 h-full w-px bg-border" aria-hidden /> : null}
            <span
              className={cn(
                "z-10 flex h-6 w-6 shrink-0 items-center justify-center rounded-full border text-white",
                state === "done" && "border-transparent bg-success",
                state === "skipped" && "border-transparent bg-muted-foreground/60",
                state === "failed" && "border-transparent bg-error",
                state === "current" && "border-transparent bg-brand-500",
                state === "pending" && "border-border bg-surface text-muted-foreground",
              )}
            >
              {state === "done" ? <Check className="h-3.5 w-3.5" /> : null}
              {state === "skipped" ? <SkipForward className="h-3.5 w-3.5" /> : null}
              {state === "failed" ? <X className="h-3.5 w-3.5" /> : null}
              {state === "current" ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : null}
              {state === "pending" ? <CircleDashed className="h-3.5 w-3.5" /> : null}
            </span>
            <div className="min-w-0 flex-1 pt-0.5">
              <p
                className={cn(
                  "text-sm font-semibold",
                  state === "pending" ? "text-muted-foreground" : "text-foreground",
                )}
              >
                {def.label}
                {state === "skipped" ? (
                  <span className="ml-2 text-xs font-normal text-muted-foreground">reused – no action needed</span>
                ) : null}
              </p>
              {state === "current" && def.hint ? (
                <p className="text-xs text-muted-foreground">{def.hint}</p>
              ) : null}
              {latest?.createdAt && state !== "pending" && state !== "current" ? (
                <p className="text-xs text-muted-foreground tabular-nums">
                  {new Date(latest.createdAt).toLocaleString()}
                </p>
              ) : null}
              {state === "failed" && (latest?.error || run.lastError) ? (
                <p className="mt-1 break-words text-xs text-error">{latest?.error ?? run.lastError}</p>
              ) : null}
            </div>
          </li>
        );
      })}
    </ol>
  );
}
