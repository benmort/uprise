"use client";

import { Spinner } from "@uprise/ui";
import { Check, CircleDashed, SkipForward, X } from "lucide-react";
import { cn } from "@uprise/ui";

export type TimelineStepDef = { key: string; label: string; hint?: string };

/** Structural run/step shapes so any provisioning domain can feed the timeline. */
export type TimelineRun = { status: string; lastError: string | null };
export type TimelineStep = {
  step: string;
  status: "STARTED" | "SUCCEEDED" | "FAILED" | "SKIPPED";
  error?: string | null;
  createdAt: string;
};

/** Telephony defaults (append-only rows fold onto these). */
export const TELEPHONY_STEPS: TimelineStepDef[] = [
  { key: "run.requested", label: "Requested" },
  { key: "subaccount.create", label: "Twilio subaccount" },
  { key: "compliance.draft", label: "Compliance details" },
  { key: "compliance.submit", label: "Submitted for review" },
  { key: "compliance.review", label: "Regulatory review", hint: "Review by Twilio can take hours – days" },
  { key: "number.purchase", label: "Number purchased" },
  { key: "webhooks.configure", label: "Webhooks configured" },
  { key: "activate", label: "Live" },
];

/** Which canonical step is "in progress" for each telephony run status. */
export const TELEPHONY_CURRENT_STEP: Record<string, string | null> = {
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

/** Email-identity provisioning step defs + status map (SendGrid journey). */
export const EMAIL_TIMELINE_STEPS: TimelineStepDef[] = [
  { key: "run.requested", label: "Requested" },
  { key: "subuser.create", label: "SendGrid subuser" },
  { key: "domain-auth.create", label: "Domain authentication" },
  { key: "dns.configure", label: "DNS records" },
  { key: "domain.validate", label: "Domain verified", hint: "DNS can take a little while to propagate" },
  { key: "webhooks.configure", label: "Webhooks configured" },
  { key: "activate", label: "Live" },
];

export const EMAIL_TIMELINE_CURRENT_STEP: Record<string, string | null> = {
  REQUESTED: "subuser.create",
  SUBUSER_CREATED: "domain-auth.create",
  DOMAIN_AUTH_CREATED: "dns.configure",
  DNS_CONFIGURED: "domain.validate",
  VALIDATION_FAILED: "domain.validate",
  DOMAIN_VERIFIED: "webhooks.configure",
  WEBHOOKS_CONFIGURED: "activate",
  ACTIVE: null,
  FAILED: null,
};

/**
 * Compact "step N of M" for a telephony run status — the calls-page progress bar.
 * ACTIVE = all done; FAILED callers should pass the run's resumeStatus instead.
 */
export function telephonyStepIndex(status: string): { step: number; total: number } {
  const total = TELEPHONY_STEPS.length;
  if (status === "ACTIVE") return { step: total, total };
  const key = TELEPHONY_CURRENT_STEP[status] ?? null;
  const i = key ? TELEPHONY_STEPS.findIndex((s) => s.key === key) : -1;
  return { step: i >= 0 ? i + 1 : 1, total };
}

type RowState = "done" | "skipped" | "failed" | "current" | "pending";

function rowState(
  stepKey: string,
  latest: TimelineStep | undefined,
  run: TimelineRun,
  currentByStatus: Record<string, string | null>,
): RowState {
  const current = currentByStatus[run.status] ?? null;
  if (latest?.status === "SUCCEEDED") return "done";
  if (latest?.status === "SKIPPED") return "skipped";
  if (latest?.status === "FAILED") return "failed";
  if (run.status !== "FAILED" && current === stepKey) return "current";
  return "pending";
}

/**
 * Read-only provisioning timeline shared across provisioning domains
 * (telephony numbers, email identities) and both audiences (super-admin pages,
 * owner tenant-settings cards). Folds the append-only step rows onto the
 * canonical journey; the run status drives the in-progress marker. Defaults to
 * the telephony journey; pass stepDefs/currentStepByStatus for others.
 */
export function ProvisioningTimeline({
  run,
  steps,
  stepDefs = TELEPHONY_STEPS,
  currentStepByStatus = TELEPHONY_CURRENT_STEP,
}: {
  run: TimelineRun;
  steps: TimelineStep[];
  stepDefs?: TimelineStepDef[];
  currentStepByStatus?: Record<string, string | null>;
}) {
  const latestByStep = new Map<string, TimelineStep>();
  for (const step of steps) latestByStep.set(step.step, step); // rows arrive oldest → newest

  return (
    <ol className="space-y-0">
      {stepDefs.map((def, i) => {
        const latest = latestByStep.get(def.key);
        const state = rowState(def.key, latest, run, currentStepByStatus);
        const isLast = i === stepDefs.length - 1;
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
              {state === "current" ? <Spinner className="h-3.5 w-3.5 animate-spin" /> : null}
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
