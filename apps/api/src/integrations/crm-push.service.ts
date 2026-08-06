import { Inject, Injectable, NotFoundException, Optional } from "@nestjs/common";
import { UnrecoverableError } from "bullmq";
import {
  IntegrationConnectionStatus,
  IntegrationPushStatus,
  IntegrationType,
  Prisma,
} from "@uprise/db";
import type { EventEnvelope } from "@uprise/events";
import { PrismaService } from "../prisma/prisma.service";
import { DomainLogger } from "../common/logging/domain-logger.service";
import { FeatureFlagsService } from "../common/flags/feature-flags.service";
import { ContactsService } from "../contacts/contacts.service";
import { DispatchQueue } from "../common/queue/dispatch-queue";
import { DISPATCH_QUEUE_TOKEN } from "../common/queue/queue.tokens";
import { getIntegrationPushJobId, QUEUE_JOB_TYPES, QUEUE_NAMES } from "../common/queue/queue.constants";
import { IntegrationPushDeliverJobPayload } from "../common/queue/queue.payloads";
import { CredentialCryptoService, CredentialDecryptionError } from "./credential-crypto.service";
import { IntegrationAuthError } from "./integration.errors";
import { NationBuilderWriteConnector } from "./nation-builder-write.connector";
import { parseDataSyncSettings, type DataSyncSettings } from "./data-sync-settings";
import { assertPushDeliveryTransition, canTransitionPushDelivery } from "./integration-push-state.machine";
import {
  mapDispositionToOps,
  mapOptOutToOps,
  mapRsvpToOps,
  mapSurveyToOps,
  mapTagToOps,
  mapTextReplyToOps,
  type NbWriteOp,
} from "./nation-builder-push.mapper";

/** Streams the push pipeline knows. PR 6 wires disposition + tag; the rest land next. */
export type PushStream = "disposition" | "survey" | "tag" | "opt_out" | "text_reply" | "rsvp";

const STREAM_TOGGLE: Record<PushStream, keyof DataSyncSettings["push"]["streams"] | null> = {
  disposition: "dispositions",
  survey: "surveyAnswers",
  tag: "tags",
  // Opt-outs are ALWAYS on when push is on — a compliance duty, not a preference.
  opt_out: null,
  text_reply: "textReplies",
  rsvp: "rsvps",
};

/** Retry posture for this queue: minutes not the 19×9.5-min default — a CRM outage is
 *  hours, not days, and the delivery ledger (not the queue) is the source of truth. */
const PUSH_JOB_ATTEMPTS = 10;
const PUSH_JOB_BACKOFF_MS = 60_000;

/**
 * The CRM write-back pipeline (meld docs 05 + data-sync plan).
 *
 * Reaction half (`recordEventForPush`): triggered by domain events, does the absolute
 * minimum — resolve the tenant's ACTIVE NationBuilder connections, filter by settings,
 * insert an `IntegrationPushDelivery` row (the LEDGER — unique per (connection, event)),
 * enqueue. Never calls NationBuilder inline: `ReactionRegistry.dispatch` swallows
 * reaction errors with no retry, so anything slow or fallible here would be lost work.
 *
 * Worker half (`processDeliveryJob`): re-reads the delivery + the authoritative uprise
 * row (the event is the trigger; the CURRENT row is the payload — at-least-once delivery
 * and reordering converge on present truth), resolves the NB person through the identity
 * ladder, maps to operations, executes through the write connector, records the outcome.
 *
 * Circuit breaker: the first `IntegrationAuthError` flips the connection to
 * NEEDS_ATTENTION and every subsequent delivery parks as HELD after ONE cheap DB read —
 * a revoked token costs O(1) API calls, not O(backlog). Reconnecting (test passes →
 * ACTIVE) plus the sweep resumes everything.
 */
@Injectable()
export class CrmPushService {
  private readonly queue: DispatchQueue;

  constructor(
    private readonly prisma: PrismaService,
    private readonly crypto: CredentialCryptoService,
    private readonly writeConnector: NationBuilderWriteConnector,
    private readonly contacts: ContactsService,
    private readonly logger: DomainLogger,
    private readonly flags: FeatureFlagsService,
    @Optional() @Inject(DISPATCH_QUEUE_TOKEN) queue?: DispatchQueue,
  ) {
    this.queue = queue ?? { enqueue: async (job) => ({ jobId: job.id, queued: true }) };
  }

  // ── Reaction half ──────────────────────────────────────────────────────────

  async recordEventForPush(event: EventEnvelope, stream: PushStream): Promise<void> {
    // Global kill switch: off ⇒ record nothing (events are replayable from the outbox
    // if a backfill is ever wanted; silence here is the documented rollback story).
    const enabled = await this.flags.isEnabled("FEATURE_NB_PUSH_ENABLED", { tenantId: null });
    if (!enabled) return;

    const payload = (event.payload ?? {}) as Record<string, unknown>;
    // The pull-import loop breaker: a tag that CAME from NationBuilder never echoes back.
    if (stream === "tag" && payload.source === "nation_builder") return;
    if (stream === "opt_out" && event.eventType === "messaging.consent.changed") {
      // Only opt-OUT transitions push (uprise never writes an opt-in to a CRM), and an
      // opt-out that arrived FROM NationBuilder must not echo back — the second loop.
      if (payload.state !== "OPTED_OUT") return;
      if (payload.source === "nation_builder_sync") return;
    }

    const connections = await this.prisma.integrationConnection.findMany({
      where: {
        tenantId: event.tenantId,
        type: IntegrationType.NATION_BUILDER,
        status: IntegrationConnectionStatus.ACTIVE,
      },
      select: { id: true, settings: true },
    });
    for (const connection of connections) {
      const settings = parseDataSyncSettings(connection.settings);
      if (!settings.push.enabled) continue;
      const toggle = STREAM_TOGGLE[stream];
      if (toggle && !settings.push.streams[toggle]) continue;

      try {
        await this.prisma.integrationPushDelivery.create({
          data: {
            tenantId: event.tenantId,
            connectionId: connection.id,
            eventId: event.id,
            eventType: event.eventType,
            stream,
            contactId: typeof payload.contactId === "string" ? payload.contactId : null,
          },
        });
      } catch (error) {
        // P2002 = this (connection, event) is already recorded — a replay. Fall through
        // to the enqueue: the deterministic jobId makes that idempotent too.
        if (!(error instanceof Prisma.PrismaClientKnownRequestError && error.code === "P2002")) {
          throw error;
        }
      }
      const existing = await this.prisma.integrationPushDelivery.findUnique({
        where: { connectionId_eventId: { connectionId: connection.id, eventId: event.id } },
        select: { id: true, status: true },
      });
      if (!existing || existing.status !== IntegrationPushStatus.PENDING) continue;
      await this.enqueueDelivery(existing.id, event.tenantId);
    }
  }

  private async enqueueDelivery(deliveryId: string, tenantId: string) {
    const payload: IntegrationPushDeliverJobPayload = { deliveryId, tenantId };
    await this.queue.enqueue({
      id: getIntegrationPushJobId(deliveryId),
      queue: QUEUE_NAMES.INTEGRATION_PUSH,
      type: QUEUE_JOB_TYPES.INTEGRATION_PUSH_DELIVER,
      payload,
      attempts: PUSH_JOB_ATTEMPTS,
      backoffMs: PUSH_JOB_BACKOFF_MS,
      removeOnComplete: true,
    });
  }

  // ── Worker half ────────────────────────────────────────────────────────────

  async processDeliveryJob(payload: IntegrationPushDeliverJobPayload) {
    const delivery = await this.prisma.integrationPushDelivery.findUnique({
      where: { id: payload.deliveryId },
      include: {
        connection: {
          select: {
            id: true,
            type: true,
            status: true,
            encryptedCredential: true,
            settings: true,
            externalGroup: true,
          },
        },
      },
    });
    if (!delivery) return { status: "missing" as const };
    // Terminal replays are legitimate under at-least-once delivery — a silent no-op.
    if (
      delivery.status === IntegrationPushStatus.SUCCEEDED ||
      delivery.status === IntegrationPushStatus.SKIPPED ||
      delivery.status === IntegrationPushStatus.FAILED
    ) {
      return { status: delivery.status };
    }

    // Circuit breaker read: a non-ACTIVE connection parks the delivery after one DB
    // read — no credential decrypt, no HTTP. The sweep releases HELD on reactivation.
    if (delivery.connection.status !== IntegrationConnectionStatus.ACTIVE) {
      await this.transition(delivery.id, delivery.status, IntegrationPushStatus.HELD, {});
      return { status: IntegrationPushStatus.HELD };
    }

    const settings = parseDataSyncSettings(delivery.connection.settings);
    // Settings may have changed since recording — re-check at send time.
    const toggle = STREAM_TOGGLE[delivery.stream as PushStream];
    if (!settings.push.enabled || (toggle && !settings.push.streams[toggle])) {
      await this.transition(delivery.id, delivery.status, IntegrationPushStatus.SKIPPED, {
        skipReason: "stream_disabled",
        completedAt: new Date(),
      });
      return { status: IntegrationPushStatus.SKIPPED };
    }

    await this.transition(delivery.id, delivery.status, IntegrationPushStatus.SENDING, {
      attempts: { increment: 1 },
    });

    try {
      const baseUrl =
        (delivery.connection.settings as { baseUrl?: string } | null)?.baseUrl ||
        `https://${delivery.connection.externalGroup}.nationbuilder.com`;
      const apiKey = this.crypto.decrypt(delivery.connection.encryptedCredential);

      // The event is the trigger; the current row is the payload.
      const mapped = await this.buildOps(delivery, settings);
      if ("skip" in mapped) {
        await this.transition(delivery.id, IntegrationPushStatus.SENDING, IntegrationPushStatus.SKIPPED, {
          skipReason: mapped.skip,
          completedAt: new Date(),
        });
        return { status: IntegrationPushStatus.SKIPPED, skipReason: mapped.skip };
      }

      // Identity ladder: scoped mapping → NB match (persisting the mapping) → create.
      // Some streams learn their contact only from the re-read (an RSVP event carries
      // no contactId) — buildOps hands it back as an override.
      const person = await this.resolvePerson(
        { ...delivery, contactId: mapped.contactId ?? delivery.contactId },
        settings,
        apiKey,
        baseUrl,
      );
      if (!person) {
        await this.transition(delivery.id, IntegrationPushStatus.SENDING, IntegrationPushStatus.SKIPPED, {
          skipReason: "no_person_match",
          completedAt: new Date(),
        });
        return { status: IntegrationPushStatus.SKIPPED, skipReason: "no_person_match" };
      }

      // Per-op execution with per-op memory: a retry after partial success re-runs only
      // the ops that never succeeded (the reliability plan's F6 without per-op rows).
      const prior = (delivery.responseSummary as { ops?: Record<string, string> } | null)?.ops ?? {};
      const opResults: Record<string, string> = { ...prior };
      for (const [index, op] of mapped.ops.entries()) {
        const opKey = `${index}:${op.kind}`;
        if (opResults[opKey] === "ok") continue;
        await this.executeOp(op, person.externalId, apiKey, baseUrl);
        opResults[opKey] = "ok";
        // Persist per-op progress as we go, so a crash between ops resumes precisely.
        await this.prisma.integrationPushDelivery.update({
          where: { id: delivery.id },
          data: { responseSummary: { ops: opResults } as Prisma.InputJsonValue },
        });
      }

      await this.transition(delivery.id, IntegrationPushStatus.SENDING, IntegrationPushStatus.SUCCEEDED, {
        externalPersonId: person.externalId,
        requestSummary: {
          ops: mapped.ops.map((o) => o.kind),
          ...(mapped.withheld.length ? { withheld: mapped.withheld } : {}),
        } as Prisma.InputJsonValue,
        responseSummary: { ops: opResults } as Prisma.InputJsonValue,
        completedAt: new Date(),
      });
      return { status: IntegrationPushStatus.SUCCEEDED };
    } catch (error) {
      if (error instanceof IntegrationAuthError) {
        // Trip the breaker: one auth failure parks the whole connection. Do not burn
        // the retry budget — the job ends here and the sweep resumes after reconnect.
        await this.prisma.integrationConnection.updateMany({
          where: { id: delivery.connectionId, status: IntegrationConnectionStatus.ACTIVE },
          data: { status: IntegrationConnectionStatus.NEEDS_ATTENTION },
        });
        await this.transition(delivery.id, IntegrationPushStatus.SENDING, IntegrationPushStatus.HELD, {
          lastError: "NationBuilder token rejected — reconnect the nation to resume",
        });
        this.logger.warn("integrations", "integration-push circuit opened", {
          connectionId: delivery.connectionId,
          tenantId: delivery.tenantId,
          deliveryId: delivery.id,
          reason: "auth",
        });
        return { status: IntegrationPushStatus.HELD };
      }
      if (error instanceof CredentialDecryptionError) {
        // Permanent for this process (secret drift) — fail fast, no backoff churn.
        await this.transition(delivery.id, IntegrationPushStatus.SENDING, IntegrationPushStatus.PENDING, {
          lastError: "Credential could not be decrypted — INTEGRATION_CREDENTIAL_SECRET drift",
        });
        throw new UnrecoverableError(String(error));
      }
      // Retryable: back to PENDING with the error on record; rethrow so BullMQ backs off.
      const attempts = delivery.attempts + 1;
      const exhausted = attempts >= PUSH_JOB_ATTEMPTS;
      await this.transition(
        delivery.id,
        IntegrationPushStatus.SENDING,
        exhausted ? IntegrationPushStatus.FAILED : IntegrationPushStatus.PENDING,
        {
          lastError: String(error).slice(0, 500),
          ...(exhausted ? { completedAt: new Date() } : {}),
        },
      );
      this.logger.warn("integrations", "integration-push delivery failed", {
        deliveryId: delivery.id,
        connectionId: delivery.connectionId,
        eventType: delivery.eventType,
        attempt: attempts,
        willRetry: !exhausted,
        error: String(error).slice(0, 200),
      });
      throw error;
    }
  }

  /** FSM-guarded status write. Illegal transitions no-op (worker path is replay-safe). */
  private async transition(
    deliveryId: string,
    from: IntegrationPushStatus,
    to: IntegrationPushStatus,
    data: Prisma.IntegrationPushDeliveryUpdateInput | Record<string, unknown>,
  ) {
    if (!canTransitionPushDelivery(from, to)) return;
    await this.prisma.integrationPushDelivery.update({
      where: { id: deliveryId },
      data: { ...(data as Prisma.IntegrationPushDeliveryUpdateInput), status: to },
    });
  }

  /** Re-read the authoritative row for a delivery's stream and map it to NB operations.
   *  `contactId` in the result overrides the delivery's (streams whose events carry no
   *  contact learn it from the re-read — RSVPs). */
  private async buildOps(
    delivery: { stream: string; eventId: string; eventType: string; tenantId: string; contactId: string | null },
    settings: DataSyncSettings,
  ): Promise<{ ops: NbWriteOp[]; withheld: string[]; contactId?: string | null } | { skip: string }> {
    const stream = delivery.stream as PushStream;
    if (stream === "disposition") {
      // aggregateId of canvass.disposition.set IS the disposition id; the outbox event
      // row carries it, but the delivery stores only eventId — recover via OutboxEvent.
      const evt = await this.prisma.outboxEvent.findUnique({
        where: { id: delivery.eventId },
        select: { aggregateId: true },
      });
      if (!evt) return { skip: "source_event_gone" };
      const row = await this.prisma.disposition.findFirst({
        where: { id: evt.aggregateId, tenantId: delivery.tenantId },
        select: { code: true, channel: true, supportLevel: true, consentAt: true },
      });
      if (!row) return { skip: "source_row_gone" };
      return mapDispositionToOps(
        {
          code: row.code,
          channel: row.channel,
          supportLevel: row.supportLevel,
          consentAt: row.consentAt,
        },
        settings,
      );
    }
    if (stream === "tag") {
      const evt = await this.prisma.outboxEvent.findUnique({
        where: { id: delivery.eventId },
        select: { payload: true },
      });
      const key = (evt?.payload as { key?: string } | null)?.key;
      if (!key) return { skip: "source_event_gone" };
      // Current truth: if the assignment was removed since, don't push a stale tag.
      const tag = await this.prisma.contactTag.findFirst({
        where: { tenantId: delivery.tenantId, key },
        select: { id: true },
      });
      const assignment =
        tag && delivery.contactId
          ? await this.prisma.contactTagAssignment.findFirst({
              where: { tenantId: delivery.tenantId, contactId: delivery.contactId, tagId: tag.id },
              select: { id: true },
            })
          : null;
      if (!assignment) return { skip: "source_row_gone" };
      return mapTagToOps(key, settings);
    }
    if (stream === "survey") {
      const evt = await this.prisma.outboxEvent.findUnique({
        where: { id: delivery.eventId },
        select: { aggregateId: true },
      });
      if (!evt) return { skip: "source_event_gone" };
      const row = await this.prisma.questionResponse.findFirst({
        where: { id: evt.aggregateId, tenantId: delivery.tenantId },
        select: {
          valueText: true,
          channel: true,
          option: { select: { label: true } },
          question: { select: { prompt: true } },
        },
      });
      if (!row) return { skip: "source_row_gone" };
      const answer = row.option?.label ?? row.valueText ?? "";
      if (!answer.trim()) return { skip: "empty_answer" };
      return mapSurveyToOps(
        { questionPrompt: row.question?.prompt ?? "", answer, channel: row.channel },
        settings,
      );
    }
    if (stream === "opt_out") {
      const evt = await this.prisma.outboxEvent.findUnique({
        where: { id: delivery.eventId },
        select: { payload: true, eventType: true },
      });
      if (!evt) return { skip: "source_event_gone" };
      const payload = (evt.payload ?? {}) as { channel?: string; phoneE164?: string; state?: string };
      if (evt.eventType === "messaging.consent.changed") {
        // Current truth: if they re-opted in since, never push the stale opt-out.
        const current = payload.phoneE164
          ? await this.prisma.contactConsent.findFirst({
              where: {
                tenantId: delivery.tenantId,
                phoneE164: payload.phoneE164,
                channel: payload.channel as never,
              },
              select: { state: true },
            })
          : null;
        if (current?.state !== "OPTED_OUT") return { skip: "opt_out_superseded" };
        return mapOptOutToOps({ channel: payload.channel ?? "SMS" });
      }
      // autodialer.contact.opted-out — a voice DNC; the event is the fact.
      return mapOptOutToOps({ channel: "VOICE" });
    }
    if (stream === "text_reply") {
      const evt = await this.prisma.outboxEvent.findUnique({
        where: { id: delivery.eventId },
        select: { aggregateId: true },
      });
      if (!evt) return { skip: "source_event_gone" };
      const row = await this.prisma.inboundMessage.findFirst({
        where: { id: evt.aggregateId, tenantId: delivery.tenantId },
        select: { body: true },
      });
      if (!row) return { skip: "source_row_gone" };
      return mapTextReplyToOps({ body: row.body }, settings);
    }
    if (stream === "rsvp") {
      const evt = await this.prisma.outboxEvent.findUnique({
        where: { id: delivery.eventId },
        select: { aggregateId: true, eventType: true },
      });
      if (!evt) return { skip: "source_event_gone" };
      const rsvp = await this.prisma.eventRsvp.findFirst({
        where: { id: evt.aggregateId, tenantId: delivery.tenantId },
        select: { contactId: true, eventId: true, event: { select: { title: true } } },
      });
      if (!rsvp) return { skip: "source_row_gone" };
      if (!rsvp.contactId) return { skip: "no_person_match" };
      const kind = evt.eventType.endsWith("attended")
        ? ("attended" as const)
        : evt.eventType.endsWith("cancelled")
          ? ("cancelled" as const)
          : ("created" as const);
      const mapped = mapRsvpToOps(
        { eventId: rsvp.eventId, eventTitle: rsvp.event?.title ?? "", kind },
        settings,
      );
      return { ...mapped, contactId: rsvp.contactId };
    }
    return { skip: "stream_not_implemented" };
  }

  /**
   * contactId → NB person, cheapest first:
   *  1. the nation-scoped ContactSourceRecord (written by every pull through this nation);
   *  2. NB people/match on email/phone — persisting the mapping for next time;
   *  3. people/push create (when the connection allows it) — write-back's whole point is
   *     getting uprise-originated supporters into the org's CRM.
   */
  private async resolvePerson(
    delivery: { tenantId: string; contactId: string | null; connection: { externalGroup: string } },
    settings: DataSyncSettings,
    apiKey: string,
    baseUrl: string,
  ): Promise<{ externalId: string } | null> {
    if (!delivery.contactId) return null;
    const scoped = `nation_builder:${delivery.connection.externalGroup}`;
    const contact = await this.prisma.contact.findFirst({
      where: { id: delivery.contactId, tenantId: delivery.tenantId },
      select: { id: true, canonicalContactId: true, email: true, phoneE164: true, firstName: true, lastName: true },
    });
    if (!contact) return null;
    const candidateIds = [contact.id, contact.canonicalContactId].filter(
      (id): id is string => Boolean(id),
    );
    const mapping = await this.prisma.contactSourceRecord.findFirst({
      where: { tenantId: delivery.tenantId, contactId: { in: candidateIds }, sourceSystem: scoped },
      orderBy: { createdAt: "desc" },
      select: { externalId: true },
    });
    if (mapping) return { externalId: mapping.externalId };

    const email = contact.email ?? undefined;
    const phone = contact.phoneE164?.startsWith("+") ? contact.phoneE164 : undefined;
    if (!email && !phone) return null;

    const matched = await this.writeConnector.matchPerson(apiKey, { email, phone }, baseUrl);
    if (matched) {
      await this.contacts.recordSourceRecord({
        tenantId: delivery.tenantId,
        contactId: contact.id,
        sourceSystem: scoped,
        externalId: matched.externalId,
      });
      return matched;
    }

    if (!settings.push.createMissingPeople) return null;
    const created = await this.writeConnector.upsertPerson(
      apiKey,
      {
        email,
        phone,
        firstName: contact.firstName ?? undefined,
        lastName: contact.lastName ?? undefined,
      },
      baseUrl,
    );
    await this.contacts.recordSourceRecord({
      tenantId: delivery.tenantId,
      contactId: contact.id,
      sourceSystem: scoped,
      externalId: created.externalId,
    });
    return created;
  }

  private async executeOp(op: NbWriteOp, personId: string, apiKey: string, baseUrl: string) {
    if (op.kind === "addTags") {
      await this.writeConnector.addTags(apiKey, personId, op.tags, baseUrl);
      return;
    }
    if (op.kind === "logContact") {
      await this.writeConnector.logContact(
        apiKey,
        personId,
        {
          method: op.method,
          statusCode: op.statusCode,
          note: op.note,
          supportLevel: op.supportLevel,
          senderId: op.senderId,
        },
        baseUrl,
      );
      return;
    }
    await this.writeConnector.updatePersonFields(apiKey, personId, op.fields, baseUrl);
  }

  // ── Transparency (the Sync activity surface reads these) ───────────────────

  /** The delivery log, newest first, filterable — what uprise sent (or couldn't send). */
  async listDeliveries(
    tenantId: string,
    opts: { connectionId?: string; stream?: string; status?: string; limit?: number; offset?: number } = {},
  ) {
    const where = {
      tenantId,
      ...(opts.connectionId ? { connectionId: opts.connectionId } : {}),
      ...(opts.stream ? { stream: opts.stream } : {}),
      ...(opts.status ? { status: opts.status as IntegrationPushStatus } : {}),
    };
    const take = Math.min(Math.max(1, opts.limit ?? 25), 100);
    const skip = Math.max(0, opts.offset ?? 0);
    const [rows, total] = await Promise.all([
      this.prisma.integrationPushDelivery.findMany({
        where,
        orderBy: { createdAt: "desc" },
        take,
        skip,
      }),
      this.prisma.integrationPushDelivery.count({ where }),
    ]);
    return { rows, total };
  }

  /** Per-connection sent/failed/held counts over a window — the health badge's feed. */
  async deliverySummary(tenantId: string, sinceHours = 24) {
    const since = new Date(Date.now() - Math.min(Math.max(1, sinceHours), 24 * 7) * 60 * 60 * 1000);
    const grouped = await this.prisma.integrationPushDelivery.groupBy({
      by: ["connectionId", "status"],
      where: { tenantId, createdAt: { gte: since } },
      _count: { _all: true },
    });
    const byConnection: Record<string, Record<string, number>> = {};
    for (const g of grouped) {
      byConnection[g.connectionId] ??= {};
      byConnection[g.connectionId][g.status] = g._count._all;
    }
    return { since: since.toISOString(), byConnection };
  }

  /** Manual retry of a FAILED delivery (throwing FSM guard — an illegal retry 409s). */
  async retryDelivery(tenantId: string, deliveryId: string) {
    const delivery = await this.prisma.integrationPushDelivery.findFirst({
      where: { id: deliveryId, tenantId },
      select: { id: true, status: true, tenantId: true },
    });
    if (!delivery) throw new NotFoundException("Delivery not found");
    assertPushDeliveryTransition(delivery.status, IntegrationPushStatus.PENDING);
    await this.prisma.integrationPushDelivery.update({
      where: { id: delivery.id },
      data: { status: IntegrationPushStatus.PENDING, lastError: null, completedAt: null },
    });
    await this.enqueueDelivery(delivery.id, delivery.tenantId);
    return { queued: true };
  }

  // ── Sweep (I9: every PENDING row eventually gets a job) ─────────────────────

  /**
   * Re-enqueue stranded work and release the circuit breaker's parked rows. Covers the
   * three loss modes BullMQ can't: a reaction whose enqueue was swallowed, a worker that
   * died mid-SENDING, and HELD rows whose connection has been reconnected.
   */
  async sweepPushDeliveries(limit = 500) {
    const staleBefore = new Date(Date.now() - 15 * 60 * 1000);
    const stranded = await this.prisma.integrationPushDelivery.findMany({
      where: {
        OR: [
          { status: IntegrationPushStatus.PENDING, updatedAt: { lt: staleBefore } },
          { status: IntegrationPushStatus.SENDING, updatedAt: { lt: staleBefore } },
          {
            status: IntegrationPushStatus.HELD,
            connection: { status: IntegrationConnectionStatus.ACTIVE },
          },
        ],
      },
      select: { id: true, tenantId: true, status: true },
      take: Math.min(Math.max(1, limit), 1000),
      orderBy: { updatedAt: "asc" },
    });
    let requeued = 0;
    let released = 0;
    for (const row of stranded) {
      if (row.status === IntegrationPushStatus.HELD) {
        await this.transition(row.id, IntegrationPushStatus.HELD, IntegrationPushStatus.PENDING, {
          lastError: null,
        });
        released += 1;
      } else if (row.status === IntegrationPushStatus.SENDING) {
        // A worker died mid-attempt; the FSM allows SENDING → PENDING.
        await this.transition(row.id, IntegrationPushStatus.SENDING, IntegrationPushStatus.PENDING, {});
      }
      await this.enqueueDelivery(row.id, row.tenantId);
      requeued += 1;
    }
    if (requeued > 0) {
      this.logger.log("integrations", "integration-push sweep", { requeued, released });
    }
    return { requeued, released };
  }
}
