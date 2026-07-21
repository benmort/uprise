import { EmailProvisioningRequestStatus } from "@uprise/db";
import { ApiHttpException } from "../common/http/api-response";

const R = EmailProvisioningRequestStatus;

/**
 * Email setup-request FSM. A tenant owner's ask is OPEN until an operator fulfils it
 * (start-run with requestId) or declines it, or the owner withdraws it. Every resolution
 * is terminal — a new ask is a new request row (the partial unique allows it once the
 * old one leaves OPEN).
 */
const allowed: Record<EmailProvisioningRequestStatus, readonly EmailProvisioningRequestStatus[]> = {
  [R.OPEN]: [R.FULFILLED, R.DECLINED, R.WITHDRAWN],
  [R.FULFILLED]: [],
  [R.DECLINED]: [],
  [R.WITHDRAWN]: [],
};

export function assertValidEmailSetupRequestTransition(
  from: EmailProvisioningRequestStatus,
  to: EmailProvisioningRequestStatus,
): void {
  if (!allowed[from]?.includes(to)) {
    throw new ApiHttpException(
      "INVALID_REQUEST_TRANSITION",
      `Email setup request cannot move ${from} → ${to}`,
      409,
    );
  }
}
