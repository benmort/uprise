import type { EventEnvelope, Reaction } from "@uprise/events";
import type { EmailProvisioningService } from "./email-provisioning.service";

/**
 * The email-identity provisioning chain: each step's completion event triggers
 * the next. VALIDATION_FAILED has NO reaction — it is the wait state (the cron
 * poll + "validate now" drive it), exactly like COMPLIANCE_SUBMITTED on the
 * telephony chain. Failures are persisted INSIDE the service (FAILED +
 * resumeStatus + failed event) because the registry swallows reaction errors.
 */
export function buildEmailProvisioningReactions(deps: {
  provisioning: EmailProvisioningService;
}): Reaction[] {
  const { provisioning } = deps;
  const runId = (event: EventEnvelope): string =>
    String((event.payload as { runId?: string })?.runId ?? event.aggregateId);

  return [
    {
      trigger: "email.provisioning.requested",
      emits: ["email.provisioning.subuser-created", "email.provisioning.failed"],
      async handle(event) {
        await provisioning.stepCreateSubuser(runId(event));
      },
    },
    {
      trigger: "email.provisioning.subuser-created",
      emits: [
        "email.provisioning.domain-auth-created",
        "email.provisioning.domain-verified", // SINGLE_ADDRESS fast-path (skipped hops)
        "email.provisioning.failed",
      ],
      async handle(event) {
        await provisioning.stepCreateDomainAuth(runId(event));
      },
    },
    {
      trigger: "email.provisioning.domain-auth-created",
      emits: ["email.provisioning.dns-configured", "email.provisioning.failed"],
      async handle(event) {
        await provisioning.stepConfigureDns(runId(event));
      },
    },
    {
      trigger: "email.provisioning.dns-configured",
      emits: [
        "email.provisioning.domain-verified",
        "email.provisioning.validation-failed",
        "email.provisioning.failed",
      ],
      async handle(event) {
        // Automated (uprise-subdomain) DNS is live within seconds — validate
        // immediately with a propagation grace. Custom domains wait for the
        // tenant's DNS change: the cron poll + "validate now" own those.
        const kind = String((event.payload as { kind?: string })?.kind ?? "");
        if (kind === "UPRISE_SUBDOMAIN") {
          await provisioning.stepValidateDomain(runId(event), { attempts: 4, delayMs: 10_000 });
        }
      },
    },
    {
      trigger: "email.provisioning.domain-verified",
      emits: ["email.provisioning.webhooks-configured", "email.provisioning.failed"],
      async handle(event) {
        await provisioning.stepConfigureWebhooks(runId(event));
      },
    },
    {
      trigger: "email.provisioning.webhooks-configured",
      emits: ["email.provisioning.activated", "email.provisioning.failed"],
      async handle(event) {
        await provisioning.stepActivate(runId(event));
      },
    },
  ];
}
