"use client";

import { StatusBadge } from "@uprise/ui";
import type { ChannelSetupStep, SetupStep } from "@uprise/api-client";
import { chipStatus } from "@/lib/setup/setup-state";

/** Human labels where the auto-derived Title Case reads poorly. */
const LABELS: Record<string, string> = {
  DONE: "Done",
  TODO: "To do",
  RECOMMENDED: "Recommended",
  IN_PROGRESS: "In progress",
  ACTION_REQUIRED: "Action required",
  REQUESTED: "Requested",
  PLAN_LOCKED: "Plan",
  FAILED: "Failed",
};

/** The one chip for setup steps — page rows, tracker rows and channel cards all use this,
 *  so the status vocabulary can never drift between surfaces. */
export function SetupChip({ step, className }: { step: SetupStep | ChannelSetupStep; className?: string }) {
  const status = chipStatus(step);
  return <StatusBadge status={status} label={LABELS[status]} className={className} />;
}
