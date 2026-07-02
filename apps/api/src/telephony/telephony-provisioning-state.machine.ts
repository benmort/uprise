import { TelephonyProvisioningStatus } from "@uprise/db";
import { ApiHttpException } from "../common/http/api-response";

const S = TelephonyProvisioningStatus;

/**
 * Provisioning FSM (mirrors blast-state.machine.ts). The happy path is linear;
 * COMPLIANCE_REJECTED → COMPLIANCE_DRAFT is the edit-and-resubmit loop; any
 * in-flight state may FAIL, and FAILED re-enters ONLY at the recorded
 * resumeStatus (guarded in the service, like FAILED → SENDING on blasts).
 * Campaign runs that reuse the tenant's account/bundle still walk each hop —
 * the reused steps are recorded as SKIPPED timeline rows.
 */
const allowed: Record<TelephonyProvisioningStatus, TelephonyProvisioningStatus[]> = {
  [S.REQUESTED]: [S.SUBACCOUNT_CREATED, S.FAILED],
  [S.SUBACCOUNT_CREATED]: [S.COMPLIANCE_DRAFT, S.FAILED],
  [S.COMPLIANCE_DRAFT]: [S.COMPLIANCE_SUBMITTED, S.FAILED],
  [S.COMPLIANCE_SUBMITTED]: [S.COMPLIANCE_APPROVED, S.COMPLIANCE_REJECTED, S.FAILED],
  [S.COMPLIANCE_APPROVED]: [S.NUMBER_PURCHASED, S.FAILED],
  [S.COMPLIANCE_REJECTED]: [S.COMPLIANCE_DRAFT, S.FAILED],
  [S.NUMBER_PURCHASED]: [S.WEBHOOKS_CONFIGURED, S.FAILED],
  [S.WEBHOOKS_CONFIGURED]: [S.ACTIVE, S.FAILED],
  [S.ACTIVE]: [],
  [S.FAILED]: [
    // Guarded further in the service: only the run's recorded resumeStatus.
    S.REQUESTED,
    S.SUBACCOUNT_CREATED,
    S.COMPLIANCE_DRAFT,
    S.COMPLIANCE_SUBMITTED,
    S.COMPLIANCE_APPROVED,
    S.COMPLIANCE_REJECTED,
    S.NUMBER_PURCHASED,
    S.WEBHOOKS_CONFIGURED,
  ],
};

export function assertValidProvisioningTransition(
  from: TelephonyProvisioningStatus,
  to: TelephonyProvisioningStatus,
): void {
  if (!allowed[from]?.includes(to)) {
    throw new ApiHttpException(
      "INVALID_PROVISIONING_TRANSITION",
      `Cannot transition provisioning run from ${from} to ${to}`,
      409,
    );
  }
}

export function canTransitionProvisioning(
  from: TelephonyProvisioningStatus,
  to: TelephonyProvisioningStatus,
): boolean {
  return allowed[from]?.includes(to) ?? false;
}
