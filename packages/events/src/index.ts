/**
 * Typed domain-event catalogue + the Reaction contract for the hybrid
 * outbox/reactions backbone (meld doc 05).
 *
 * Event names follow `<domain>.<thing>.<pastTenseVerb>`, dot-separated, aligned
 * with the per-domain schema namespaces (doc 02). The catalogue grows as domains
 * are ported (docs 06–11) — entries here are the typed contract the OutboxService
 * `append` and every Reaction `handle` are generic over.
 */
export const EVENT_TYPES = {
  AUDIENCE_IMPORTED: "audience.imported",
  SEGMENT_RECOMPUTED: "audience.segment.recomputed",
  BLAST_CREATED: "messaging.blast.created",
  BLAST_SCHEDULED: "messaging.blast.scheduled",
  BLAST_SENT: "messaging.blast.sent",
  TX_SMS_REQUESTED: "messaging.tx-sms.requested",
  INBOUND_RECEIVED: "messaging.inbound.received",
  USER_CREATED: "iam.user.created",
  TENANT_INVITATION_SENT: "tenant.invitation.sent",
  EMAIL_QUEUED: "email.email.queued",
  EMAIL_SENDING: "email.email.sending",
  EMAIL_SENT: "email.email.sent",
  EMAIL_FAILED: "email.email.failed",
  EMAIL_OPENED: "email.email.opened",
  EMAIL_CLICKED: "email.email.clicked",
  PAYMENT_SUCCEEDED: "payment.payment.succeeded",
  PAYMENT_REFUNDED: "payment.payment.refunded",
  CALL_INITIATED: "telephony.call.initiated",
  CALL_STATUS_CHANGED: "telephony.call.status-changed",
  ORG_CREDENTIAL_UPDATED: "tenant.org-credential.updated",
  TENANT_CREATED: "tenant.tenant.created",
  TENANT_MEMBER_ADDED: "tenant.member.added",
  TENANT_MEMBER_REMOVED: "tenant.member.removed",
  TENANT_MEMBER_ROLE_UPDATED: "tenant.member.role-updated",
  NETWORK_CREATED: "tenant.network.created",
  SUBSCRIPTION_CHANGED: "payment.subscription.changed",
  PAYMENT_STATUS_CHANGED: "payment.status.changed",
  EMAIL_DELIVERED: "email.email.delivered",
  EMAIL_BOUNCED: "email.email.bounced",
  CALL_COMPLETED: "telephony.call.completed",
  USER_SIGNED_IN: "iam.user.signed-in",
  USER_EMAIL_VERIFIED: "iam.user.email-verified",
  USER_EMAIL_CHANGED: "iam.user.email-changed",
  USER_PASSWORD_RESET: "iam.user.password-reset",
  USER_MOBILE_VERIFIED: "iam.user.mobile-verified",
  USER_2FA_ENABLED: "iam.user.2fa-enabled",
  USER_2FA_DISABLED: "iam.user.2fa-disabled",
  USER_DELETED: "iam.user.deleted",
  INVITATION_ACCEPTED: "tenant.invitation.accepted",
  INVITATION_DECLINED: "tenant.invitation.declined",
  INVITATION_REVOKED: "tenant.invitation.revoked",
  JOIN_REQUEST_SUBMITTED: "tenant.join-request.submitted",
  JOIN_REQUEST_APPROVED: "tenant.join-request.approved",
  JOIN_REQUEST_REJECTED: "tenant.join-request.rejected",
  TENANT_RENAMED: "tenant.tenant.renamed",
  TENANT_DELETED: "tenant.tenant.deleted",
  API_KEY_ISSUED: "tenant.api-key.issued",
  API_KEY_REVOKED: "tenant.api-key.revoked",
  FILE_UPLOADED: "tenant.file.uploaded",
  FILE_DELETED: "tenant.file.deleted",
} as const;

export type EventType = (typeof EVENT_TYPES)[keyof typeof EVENT_TYPES] | string;

/** Payload shape per event type. Extended as domains are ported. */
export interface DomainEventMap {
  "audience.imported": { audienceId: string; tenantId: string; count: number };
  "audience.segment.recomputed": { segmentId: string; tenantId: string; memberCount: number };
  "messaging.blast.created": { blastId: string; tenantId: string; title: string };
  "messaging.blast.scheduled": { blastId: string; tenantId: string; scheduledAt: string };
  "messaging.blast.sent": { blastId: string; tenantId: string; recipientCount: number };
  "messaging.tx-sms.requested": { tenantId: string; toPhone: string; purpose: string };
  "messaging.inbound.received": { tenantId: string; contactPhone: string; channel: string };
  "iam.user.created": { userId: string; email: string; tenantId: string };
  "tenant.invitation.sent": { invitationId: string; tenantId: string; email: string };
  "email.email.queued": { emailId: string; tenantId: string; toAddress: string };
  "email.email.sending": { emailId: string; tenantId: string; toAddress: string };
  "email.email.sent": { emailId: string; tenantId: string; toAddress: string };
  "email.email.failed": { emailId: string; tenantId: string; toAddress: string; reason: string };
  "email.email.opened": { emailId: string; tenantId: string; toAddress: string };
  "email.email.clicked": { emailId: string; tenantId: string; toAddress: string };
  "payment.payment.succeeded": { paymentId: string; tenantId: string; amountCents: number };
  "payment.payment.refunded": { paymentId: string; tenantId: string; amountCents: number };
  "telephony.call.initiated": { callId: string; tenantId: string; toNumber: string };
  "telephony.call.status-changed": { callId: string; tenantId: string; status: string };
  "tenant.org-credential.updated": { orgProfileId: string; tenantId: string };
  "tenant.tenant.created": { tenantId: string; slug: string; name: string; networkId: string | null };
  "tenant.member.added": { tenantId: string; userId: string; role: string };
  "tenant.member.removed": { tenantId: string; userId: string };
  "tenant.member.role-updated": { tenantId: string; userId: string; role: string };
  "tenant.network.created": { networkId: string; name: string };
  "payment.subscription.changed": {
    tenantId: string | null;
    networkId: string | null;
    subscriptionId: string;
    status: string;
  };
  "payment.status.changed": { paymentId: string; tenantId: string; status: string };
  "email.email.delivered": { emailId: string; tenantId: string; toAddress: string };
  "email.email.bounced": { emailId: string; tenantId: string; toAddress: string; reason: string };
  "telephony.call.completed": { callId: string; tenantId: string; durationSeconds: number | null };
  "iam.user.signed-in": { userId: string; tenantId: string };
  "iam.user.email-verified": { userId: string; tenantId: string };
  "iam.user.email-changed": { userId: string; tenantId: string; newEmail: string };
  "iam.user.password-reset": { userId: string; tenantId: string };
  "iam.user.mobile-verified": { userId: string; tenantId: string };
  "iam.user.2fa-enabled": { userId: string; tenantId: string };
  "iam.user.2fa-disabled": { userId: string; tenantId: string };
  "iam.user.deleted": { userId: string; tenantId: string };
  "tenant.invitation.accepted": { invitationId: string; tenantId: string; userId: string };
  "tenant.invitation.declined": { invitationId: string; tenantId: string };
  "tenant.invitation.revoked": { invitationId: string; tenantId: string };
  "tenant.join-request.submitted": { requestId: string; tenantId: string; email: string; requestedRole: string };
  "tenant.join-request.approved": { requestId: string; tenantId: string; userId: string; role: string };
  "tenant.join-request.rejected": { requestId: string; tenantId: string; userId: string };
  "tenant.tenant.renamed": { tenantId: string; name: string };
  "tenant.tenant.deleted": { tenantId: string };
  "tenant.api-key.issued": { apiKeyId: string; tenantId: string; name: string };
  "tenant.api-key.revoked": { apiKeyId: string; tenantId: string };
  "tenant.file.uploaded": { fileId: string; tenantId: string; name: string };
  "tenant.file.deleted": { fileId: string; tenantId: string };
}

export interface EventMetadata {
  correlationId?: string;
  causationId?: string;
  actorId?: string;
}

/** The published shape a reaction receives. Payload is loosely typed at the
 * boundary (it crosses a queue as JSON); domain reactions narrow it. */
export interface EventEnvelope<P = unknown> {
  id: string;
  eventType: EventType;
  tenantId: string;
  aggregateId: string;
  payload: P;
  metadata: EventMetadata;
  occurredAt: string;
}

/** A typed envelope for a known event type (used by emitters). */
export type TypedEventEnvelope<K extends keyof DomainEventMap> = EventEnvelope<DomainEventMap[K]>;

/**
 * A reaction runs a side-effect when its `trigger` event is published. `emits`
 * declares the events it may raise (for loop-safety). Handlers must be
 * idempotent — delivery is at-least-once at the queue and deduped per
 * (source, eventId) at the registry.
 */
export interface Reaction {
  /** The event type this reaction fires on. */
  readonly trigger: EventType;
  /** Event types this reaction may emit (must not include its own trigger). */
  readonly emits?: readonly EventType[];
  handle(event: EventEnvelope): Promise<void>;
}

/**
 * Fail-fast loop-safety: a reaction must not emit its own trigger (an immediate
 * self-loop). Run at registry boot. Returns the offending pairs; throws via
 * assertReactionsLoopSafe.
 */
export function loopUnsafeReactions(reactions: ReadonlyArray<Reaction>): Array<{ trigger: EventType; emit: EventType }> {
  const unsafe: Array<{ trigger: EventType; emit: EventType }> = [];
  for (const r of reactions) {
    for (const emit of r.emits ?? []) {
      if (emit === r.trigger) unsafe.push({ trigger: r.trigger, emit });
    }
  }
  return unsafe;
}

export function assertReactionsLoopSafe(reactions: ReadonlyArray<Reaction>): void {
  const unsafe = loopUnsafeReactions(reactions);
  if (unsafe.length > 0) {
    const detail = unsafe.map((u) => `${u.trigger} → ${u.emit}`).join(", ");
    throw new Error(`Loop-unsafe reactions (a reaction emits its own trigger): ${detail}`);
  }
}
