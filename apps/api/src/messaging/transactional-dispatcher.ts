/**
 * Cross-domain seam (meld doc 06) — the analogue of prog's CROSS_DOMAIN_DISPATCHER,
 * minus the bus. Other domains (IAM 2FA/verification, payment receipts) inject
 * this token to send transactional messages WITHOUT depending on the messaging
 * internals. Bound to TransactionalMessagingService in MessagingModule.
 */
export const TRANSACTIONAL_DISPATCHER = Symbol("TRANSACTIONAL_DISPATCHER");

export interface TransactionalSmsInput {
  tenantId: string;
  toPhone: string;
  /** Raw body, OR resolve from a MessageTemplate via templateKey. */
  body?: string;
  templateKey?: string;
  vars?: Record<string, string>;
  /** e.g. "verification_code" | "2fa" | "payment_receipt" — for the ledger + analytics. */
  purpose: string;
}

export interface TransactionalEmailInput {
  tenantId: string;
  toAddress: string;
  templateKey: string;
  vars?: Record<string, string>;
  purpose: string;
}

export interface TransactionalDispatcher {
  sendSms(input: TransactionalSmsInput): Promise<void>;
  sendEmail(input: TransactionalEmailInput): Promise<void>;
}
