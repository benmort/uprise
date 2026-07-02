import { EmailProvisioningStatus } from "@uprise/db";
import { ApiHttpException } from "../common/http/api-response";

const S = EmailProvisioningStatus;

/**
 * Email-identity provisioning FSM (mirrors telephony-provisioning-state.machine).
 * DNS_CONFIGURED is the wait state (DNS propagation / the tenant adding records
 * for CUSTOM_DOMAIN) — validation has no webhook, so a cron poll or an explicit
 * "validate now" drives it forward. VALIDATION_FAILED is the calm re-check loop.
 * SINGLE_ADDRESS runs fast-path SUBUSER_CREATED → DOMAIN_VERIFIED with SKIPPED
 * hops. FAILED re-enters ONLY at the recorded resumeStatus (guarded in service).
 */
const allowed: Record<EmailProvisioningStatus, EmailProvisioningStatus[]> = {
  [S.REQUESTED]: [S.SUBUSER_CREATED, S.FAILED],
  [S.SUBUSER_CREATED]: [S.DOMAIN_AUTH_CREATED, S.DOMAIN_VERIFIED, S.FAILED],
  [S.DOMAIN_AUTH_CREATED]: [S.DNS_CONFIGURED, S.FAILED],
  [S.DNS_CONFIGURED]: [S.DOMAIN_VERIFIED, S.VALIDATION_FAILED, S.FAILED],
  [S.VALIDATION_FAILED]: [S.DOMAIN_VERIFIED, S.DNS_CONFIGURED, S.FAILED],
  [S.DOMAIN_VERIFIED]: [S.WEBHOOKS_CONFIGURED, S.FAILED],
  [S.WEBHOOKS_CONFIGURED]: [S.ACTIVE, S.FAILED],
  [S.ACTIVE]: [],
  [S.FAILED]: [
    // Guarded further in the service: only the run's recorded resumeStatus.
    S.REQUESTED,
    S.SUBUSER_CREATED,
    S.DOMAIN_AUTH_CREATED,
    S.DNS_CONFIGURED,
    S.VALIDATION_FAILED,
    S.DOMAIN_VERIFIED,
    S.WEBHOOKS_CONFIGURED,
  ],
};

export function assertValidEmailProvisioningTransition(
  from: EmailProvisioningStatus,
  to: EmailProvisioningStatus,
): void {
  if (!allowed[from]?.includes(to)) {
    throw new ApiHttpException(
      "INVALID_EMAIL_PROVISIONING_TRANSITION",
      `Cannot transition email provisioning run from ${from} to ${to}`,
      409,
    );
  }
}

export function canTransitionEmailProvisioning(
  from: EmailProvisioningStatus,
  to: EmailProvisioningStatus,
): boolean {
  return allowed[from]?.includes(to) ?? false;
}
