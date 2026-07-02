import type { EventEnvelope, Reaction } from "@uprise/events";
import type { TelephonyProvisioningService } from "./telephony-provisioning.service";

/**
 * The provisioning chain (meld doc 12 reaction style): each step's completion
 * event triggers the next step. COMPLIANCE_SUBMITTED has no reaction — the run
 * waits for the bundle-status webhook (or the cron poll). Failures are handled
 * INSIDE the service (FAILED + resumeStatus + failed event) because the
 * registry swallows reaction errors — a throw here would be lost.
 */
export function buildTelephonyProvisioningReactions(deps: {
  provisioning: TelephonyProvisioningService;
}): Reaction[] {
  const { provisioning } = deps;
  const runId = (event: EventEnvelope): string =>
    String((event.payload as { runId?: string })?.runId ?? event.aggregateId);

  return [
    {
      trigger: "telephony.provisioning.requested",
      emits: ["telephony.provisioning.subaccount-created", "telephony.provisioning.failed"],
      async handle(event) {
        await provisioning.stepCreateSubaccount(runId(event));
      },
    },
    {
      trigger: "telephony.provisioning.subaccount-created",
      emits: [
        "telephony.provisioning.compliance-drafted",
        "telephony.provisioning.compliance-approved", // reuse fast-path (skipped hops)
        "telephony.provisioning.failed",
      ],
      async handle(event) {
        await provisioning.stepDraftCompliance(runId(event));
      },
    },
    {
      trigger: "telephony.provisioning.compliance-drafted",
      emits: ["telephony.provisioning.compliance-submitted", "telephony.provisioning.failed"],
      async handle(event) {
        await provisioning.stepSubmitBundle(runId(event));
      },
    },
    {
      trigger: "telephony.provisioning.compliance-approved",
      emits: ["telephony.provisioning.number-purchased", "telephony.provisioning.failed"],
      async handle(event) {
        await provisioning.stepPurchaseNumber(runId(event));
      },
    },
    {
      trigger: "telephony.provisioning.number-purchased",
      emits: ["telephony.provisioning.webhooks-configured", "telephony.provisioning.failed"],
      async handle(event) {
        await provisioning.stepConfigureWebhooks(runId(event));
      },
    },
    {
      trigger: "telephony.provisioning.webhooks-configured",
      emits: ["telephony.provisioning.activated", "telephony.provisioning.failed"],
      async handle(event) {
        await provisioning.stepActivate(runId(event));
      },
    },
  ];
}
