import { Inject, Injectable, Logger, NotFoundException } from "@nestjs/common";
import {
  BlastRecipientStatus,
  BlastStatus,
  Prisma,
} from "../../src/generated/prisma";
import { ConfigService } from "@nestjs/config";
import { PrismaService } from "../prisma/prisma.service";
import { assertValidBlastTransition } from "./blast-state.machine";
import { TemplateRendererService } from "./template-renderer.service";
import { ComplianceService } from "./compliance.service";
import { CreateBlastDto, ProofBlastDto, ScheduleBlastDto, UpdateBlastDto } from "./dto/blast.dto";
import { TwilioMessage, TwilioService } from "../twilio/twilio.service";
import { normalizePhoneE164 } from "../common/utils/phone.utils";
import { RealtimeEventsService } from "../common/events/realtime-events.service";
import { toUtcMinuteBucket } from "../common/utils/date.utils";
import { BlastStatus as FlowBlastStatus } from "../common/enums/blast-status.enum";
import { classifyFailureScope, scopeFromStoredFailure } from "./twilio-failure-scope";
import { FeatureFlagsService } from "../common/flags/feature-flags.service";
import { DispatchQueue } from "../common/queue/dispatch-queue";
import {
  getBlastRetryJobId,
  getBlastSendJobId,
  QUEUE_JOB_TYPES,
  QUEUE_NAMES,
} from "../common/queue/queue.constants";
import { DISPATCH_QUEUE_TOKEN } from "../common/queue/queue.tokens";
import { BlastRetryFailedJobPayload, BlastSendBatchJobPayload } from "../common/queue/queue.payloads";

type RecipientSeed = {
  contactId?: string;
  phoneE164: string;
  metadata: Record<string, unknown>;
};

type TwilioStatusCallbackPayload = {
  messageSid: string;
  messageStatus: string;
  errorCode?: string | null;
  errorMessage?: string | null;
};

const SENT_RECIPIENT_STATUSES: BlastRecipientStatus[] = [
  BlastRecipientStatus.SENT,
  BlastRecipientStatus.DELIVERED,
  BlastRecipientStatus.RESPONDED,
];

const SEND_PHASE_RECIPIENT_STATUSES: BlastRecipientStatus[] = [
  BlastRecipientStatus.PENDING,
  BlastRecipientStatus.QUEUED,
  BlastRecipientStatus.SENT,
  BlastRecipientStatus.DELIVERED,
];

const FAILED_TRANSITIONABLE_STATUSES: BlastRecipientStatus[] = [
  BlastRecipientStatus.PENDING,
  BlastRecipientStatus.QUEUED,
  BlastRecipientStatus.SENT,
];

const TWILIO_DELIVERY_CONFIRMED_STATUSES = new Set(["delivered", "read"]);
const TWILIO_DELIVERY_FAILED_STATUSES = new Set(["failed", "undelivered"]);

const SKIPPED_DUPLICATE_ERROR =
  "Skipped duplicate recipient: message already sent for this blast.";
const BLAST_DRY_RUN_SID_PREFIX = "DRYRUN";

type RecipientTraceInput = {
  status: BlastRecipientStatus;
  source: string;
  scope?: "INTERNAL" | "EXTERNAL" | null;
  category?: string | null;
  reason?: string | null;
  code?: string | null;
  detail?: string | null;
};

@Injectable()
export class BlastsService {
  private readonly logger = new Logger(BlastsService.name);
  private readonly flags: Pick<FeatureFlagsService, "isBullmqBlastEnabled">;
  private readonly queue: DispatchQueue;

  constructor(
    private readonly prisma: PrismaService,
    private readonly config: ConfigService,
    private readonly renderer: TemplateRendererService,
    private readonly compliance: ComplianceService,
    private readonly twilio: TwilioService,
    private readonly events: RealtimeEventsService,
    flags?: FeatureFlagsService,
    @Inject(DISPATCH_QUEUE_TOKEN) queue?: DispatchQueue,
  ) {
    this.flags = flags ?? {
      isBullmqBlastEnabled: () => false,
    };
    this.queue = queue ?? {
      enqueue: async (job) => ({ jobId: job.id, queued: true }),
    };
  }

  private async ensureOrganization() {
    const slug = this.config.get<string>("DEFAULT_ORGANIZATION_SLUG", "default");
    return this.prisma.organization.upsert({
      where: { slug },
      create: { slug, name: "Default Organization" },
      update: {},
    });
  }

  private async getBlastOrThrow(id: string) {
    const blast = await this.prisma.blast.findUnique({ where: { id } });
    if (!blast) throw new NotFoundException("Blast not found");
    return blast;
  }

  private isContactable(contact: { phoneE164: string; metadata: Prisma.JsonValue | null }): boolean {
    const metadata =
      contact.metadata && typeof contact.metadata === "object" && !Array.isArray(contact.metadata)
        ? (contact.metadata as Record<string, unknown>)
        : {};
    if (metadata.contactable === false) return false;
    return /^\+\d{7,15}$/.test(contact.phoneE164);
  }

  async createDraft(dto: CreateBlastDto) {
    const org = await this.ensureOrganization();
    const blast = await this.prisma.blast.create({
      data: {
        organizationId: org.id,
        title: dto.title,
        audienceId: dto.audienceId || null,
        bodyTemplate: dto.bodyTemplate,
        status: BlastStatus.DRAFTED,
      },
    });
    await this.prisma.blastTemplate.create({
      data: {
        blastId: blast.id,
        version: 1,
        body: dto.bodyTemplate,
      },
    });
    return blast;
  }

  async updateDraft(id: string, dto: UpdateBlastDto) {
    const blast = await this.getBlastOrThrow(id);
    if (dto.bodyTemplate && dto.bodyTemplate !== blast.bodyTemplate) {
      const version = await this.prisma.blastTemplate.count({ where: { blastId: id } });
      await this.prisma.blastTemplate.create({
        data: {
          blastId: id,
          version: version + 1,
          body: dto.bodyTemplate,
        },
      });
    }
    return this.prisma.blast.update({
      where: { id },
      data: {
        title: dto.title ?? blast.title,
        audienceId: dto.audienceId ?? blast.audienceId,
        bodyTemplate: dto.bodyTemplate ?? blast.bodyTemplate,
      },
    });
  }

  async deleteBlast(id: string) {
    await this.getBlastOrThrow(id);
    return this.prisma.blast.delete({ where: { id } });
  }

  async previewProof(id: string, dto: ProofBlastDto) {
    const blast = await this.getBlastOrThrow(id);
    const sampleRecipients =
      dto.sampleRecipients && dto.sampleRecipients.length > 0
        ? dto.sampleRecipients
        : [{ first_name: "Sarah", city: "Chicago", discount_code: "RENEW24" }];
    const previews = sampleRecipients.map((recipient) => ({
      recipient,
      rendered: this.renderer.render(blast.bodyTemplate, recipient),
    }));
    let proofDispatch: { to: string; sid: string } | null = null;
    const proofNumber = typeof dto.proofNumber === "string" ? dto.proofNumber.trim() : "";
    if (proofNumber && previews[0]?.rendered) {
      const to = normalizePhoneE164(proofNumber);
      const dryRunEnabled = this.isBlastDryRunEnabled();
      const proofMessage = dryRunEnabled
        ? this.createDryRunMessage(to, previews[0].rendered, `proof-${blast.id}`)
        : await this.twilio.sendMessage(to, previews[0].rendered);
      if (dryRunEnabled) {
        this.logger.warn(
          `BLAST_DRY_RUN enabled: simulating proof send (blastId=${blast.id}, to=${proofMessage.to})`,
        );
      }
      proofDispatch = {
        to: proofMessage.to,
        sid: proofMessage.sid,
      };
    }

    return { blastId: blast.id, previews, proofDispatch };
  }

  async markProofed(id: string) {
    const blast = await this.getBlastOrThrow(id);
    assertValidBlastTransition(
      blast.status as unknown as FlowBlastStatus,
      FlowBlastStatus.PROOFED,
    );
    return this.prisma.blast.update({
      where: { id },
      data: {
        status: BlastStatus.PROOFED,
        proofedAt: new Date(),
      },
    });
  }

  async schedule(id: string, dto: ScheduleBlastDto) {
    const blast = await this.getBlastOrThrow(id);
    assertValidBlastTransition(
      blast.status as unknown as FlowBlastStatus,
      FlowBlastStatus.SCHEDULED,
    );
    const runAt = new Date(dto.scheduledFor);
    const updated = await this.prisma.blast.update({
      where: { id },
      data: {
        status: BlastStatus.SCHEDULED,
        scheduledFor: runAt,
      },
    });
    if (this.isBullmqBlastEnabled()) {
      await this.enqueueBlastSendBatch({ blastId: id }, runAt);
    }
    return updated;
  }

  async requestSendNow(id: string) {
    if (!this.isBullmqBlastEnabled()) {
      return this.sendNow(id);
    }
    const queued = await this.enqueueBlastSendBatch({ blastId: id });
    const blast = await this.getBlastOrThrow(id);
    return {
      queued: queued.queued,
      jobId: queued.jobId,
      blast,
    };
  }

  async requestRetryFailed(id: string) {
    if (!this.isBullmqBlastEnabled()) {
      return this.retryFailed(id);
    }
    const queued = await this.enqueueBlastRetryFailed({ blastId: id });
    return {
      blastId: id,
      queued: queued.queued,
      jobId: queued.jobId,
    };
  }

  private async getBlastRecipients(blast: { audienceId: string | null; id: string }): Promise<RecipientSeed[]> {
    if (!blast.audienceId) return [];
    const contacts = await this.prisma.audienceContact.findMany({
      where: { audienceId: blast.audienceId },
      orderBy: { createdAt: "asc" },
    });
    const dedup = new Map<string, RecipientSeed>();
    for (const contact of contacts) {
      if (!this.isContactable(contact)) continue;
      dedup.set(contact.phoneE164, {
        contactId: contact.id,
        phoneE164: contact.phoneE164,
        metadata: (contact.metadata as Record<string, unknown>) || {},
      });
    }
    return Array.from(dedup.values());
  }

  private getSendBatchSize(requestedBatchSize?: number): number {
    const envBatchSize = Number(this.config.get<string>("BLAST_SEND_BATCH_SIZE", "50"));
    const fallback = Number.isFinite(envBatchSize) ? envBatchSize : 50;
    const effective = requestedBatchSize ?? fallback;
    return Math.min(Math.max(1, Math.trunc(effective)), 500);
  }

  private getDispatchBatchSize(): number {
    const envBatchSize = Number(this.config.get<string>("BLAST_DISPATCH_BATCH_SIZE", "5"));
    const fallback = Number.isFinite(envBatchSize) ? envBatchSize : 5;
    return Math.min(Math.max(1, Math.trunc(fallback)), 25);
  }

  private getSendTimeBudgetMs(): number {
    const envBudgetMs = Number(this.config.get<string>("BLAST_SEND_MAX_RUN_MS", "22000"));
    const fallback = Number.isFinite(envBudgetMs) ? envBudgetMs : 22000;
    return Math.min(Math.max(1000, Math.trunc(fallback)), 28000);
  }

  private isBullmqBlastEnabled(): boolean {
    return this.flags.isBullmqBlastEnabled();
  }

  private isBlastDryRunEnabled(): boolean {
    return this.config.get<boolean>("BLAST_DRY_RUN", false);
  }

  private createDryRunMessage(to: string, body: string, context: string): TwilioMessage {
    const now = new Date().toISOString();
    const configuredFrom = this.config.get<string>("TWILIO_PHONE_NUMBER", "").trim();
    const from = /^\+\d{7,15}$/.test(configuredFrom) ? configuredFrom : "+15550000000";
    return {
      sid: `${BLAST_DRY_RUN_SID_PREFIX}-${context}-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`,
      body,
      from,
      to: normalizePhoneE164(to),
      dateCreated: now,
      dateSent: now,
      dateUpdated: now,
      direction: "outbound-api",
      status: "sent",
      errorCode: null,
      errorMessage: null,
      numMedia: "0",
      numSegments: "1",
    };
  }

  private async enqueueBlastSendBatch(
    payload: BlastSendBatchJobPayload,
    runAt?: Date,
  ): Promise<{ jobId: string; queued: boolean }> {
    return this.queue.enqueue({
      id: getBlastSendJobId(payload.blastId),
      queue: QUEUE_NAMES.BLAST_SEND,
      type: QUEUE_JOB_TYPES.BLAST_SEND_BATCH,
      payload,
      runAt,
      removeOnComplete: true,
    });
  }

  private async enqueueBlastRetryFailed(
    payload: BlastRetryFailedJobPayload,
  ): Promise<{ jobId: string; queued: boolean }> {
    return this.queue.enqueue({
      id: getBlastRetryJobId(payload.blastId),
      queue: QUEUE_NAMES.BLAST_RETRY,
      type: QUEUE_JOB_TYPES.BLAST_RETRY_FAILED,
      payload,
      removeOnComplete: true,
    });
  }

  async processBlastSendQueueJob(payload: BlastSendBatchJobPayload) {
    return this.sendNow(payload.blastId, payload.requestedBatchSize);
  }

  async processBlastRetryQueueJob(payload: BlastRetryFailedJobPayload) {
    return this.retryFailed(payload.blastId, true);
  }

  private async ensureBlastRecipientRecords(blast: {
    id: string;
    audienceId: string | null;
    bodyTemplate: string;
  }): Promise<number> {
    const existingCount = await this.prisma.blastRecipient.count({
      where: { blastId: blast.id },
    });
    if (existingCount > 0) return existingCount;

    const recipients = await this.getBlastRecipients(blast);
    let skippedDuplicates = 0;
    for (const recipient of recipients) {
      const context = recipient.metadata;
      const normalizedPhone = normalizePhoneE164(recipient.phoneE164);
      const renderedBody = this.renderer.render(blast.bodyTemplate, context);
      const compliance = this.compliance.validateMessageForSend(renderedBody);
      const recipientMetadata = this.appendRecipientTrace(
        {
          complianceWarnings: compliance.warnings,
          context,
        } as Prisma.InputJsonValue,
        {
          status: BlastRecipientStatus.PENDING,
          source: "seed",
          reason: "Recipient seeded from audience",
        },
      );
      try {
        await this.prisma.blastRecipient.create({
          data: {
            blastId: blast.id,
            contactId: recipient.contactId,
            phoneE164: normalizedPhone,
            renderedBody,
            status: BlastRecipientStatus.PENDING,
            metadata: recipientMetadata,
          },
        });
      } catch (error) {
        if (!this.isBlastRecipientUniqueConflict(error)) throw error;
        skippedDuplicates += 1;
        this.logger.warn(
          `Skipping duplicate recipient record during blast seed (blastId=${blast.id}, phoneE164=${normalizedPhone}, contactId=${recipient.contactId ?? "n/a"})`,
        );
      }
    }
    if (skippedDuplicates > 0) {
      this.logger.warn(
        `Skipped duplicate recipient records during blast seed (blastId=${blast.id}, skipped=${skippedDuplicates})`,
      );
    }
    return this.prisma.blastRecipient.count({
      where: { blastId: blast.id },
    });
  }

  private isRecipientFailureInternal(recipient: {
    failureCategory: string | null;
    errorCode: string | null;
    errorMessage: string | null;
  }): boolean {
    return (
      scopeFromStoredFailure({
        failureCategory: recipient.failureCategory,
        errorCode: recipient.errorCode,
        errorMessage: recipient.errorMessage,
      }) === "INTERNAL"
    );
  }

  private appendRecipientTrace(
    metadata: unknown,
    input: RecipientTraceInput,
    at: Date = new Date(),
  ): Prisma.InputJsonValue {
    const base =
      metadata && typeof metadata === "object" && !Array.isArray(metadata)
        ? ({ ...(metadata as Record<string, unknown>) } as Record<string, unknown>)
        : {};
    const existingRaw = base.trace;
    const existingTrace = Array.isArray(existingRaw)
      ? existingRaw.filter((item) => item && typeof item === "object" && !Array.isArray(item))
      : [];
    const entry: Record<string, unknown> = {
      at: at.toISOString(),
      status: input.status,
      source: input.source,
    };
    if (input.scope) entry.scope = input.scope;
    if (input.category) entry.category = input.category;
    if (input.reason) entry.reason = input.reason;
    if (input.code) entry.code = input.code;
    if (input.detail) entry.detail = input.detail;
    base.trace = [...existingTrace.slice(-49), entry];
    return base as Prisma.InputJsonValue;
  }

  private isBlastRecipientUniqueConflict(error: unknown): boolean {
    if (!(error instanceof Prisma.PrismaClientKnownRequestError)) return false;
    if (error.code !== "P2002") return false;
    const rawTarget = error.meta?.target;
    const target = Array.isArray(rawTarget) ? rawTarget.join(",") : String(rawTarget ?? "");
    return (
      (target.includes("blastId") && target.includes("phoneE164")) ||
      target.includes("BlastRecipient_blastId_phoneE164_key")
    );
  }

  private async writeSnapshot(orgId: string, blastId: string, metricName: string, value: number) {
    await this.prisma.analyticsSnapshot.create({
      data: {
        organizationId: orgId,
        blastId,
        metricName,
        metricValue: value,
        bucketAt: new Date(toUtcMinuteBucket(new Date())),
      },
    });
  }

  private async recalculateBlastStatus(blastId: string) {
    const blast = await this.prisma.blast.findUnique({
      where: { id: blastId },
      select: {
        id: true,
        status: true,
        completedAt: true,
      },
    });
    if (!blast) {
      throw new NotFoundException("Blast not found");
    }

    const [remaining, failedRecipients] = await Promise.all([
      this.prisma.blastRecipient.count({
        where: {
          blastId,
          status: { in: [BlastRecipientStatus.PENDING, BlastRecipientStatus.QUEUED] },
        },
      }),
      this.prisma.blastRecipient.findMany({
        where: { blastId, status: BlastRecipientStatus.FAILED },
        select: {
          failureCategory: true,
          errorCode: true,
          errorMessage: true,
        },
      }),
    ]);

    const internalFailures = failedRecipients.reduce((count, recipient) => {
      return count + (this.isRecipientFailureInternal(recipient) ? 1 : 0);
    }, 0);

    const status =
      remaining > 0
        ? BlastStatus.SENDING
        : internalFailures > 0
          ? BlastStatus.FAILED
          : BlastStatus.SENT;

    const shouldUpdateStatus = blast.status !== status;
    const shouldSetCompletedAt = status !== BlastStatus.SENDING && !blast.completedAt;
    if (shouldUpdateStatus || shouldSetCompletedAt) {
      await this.prisma.blast.update({
        where: { id: blastId },
        data:
          status === BlastStatus.SENDING
            ? { status: BlastStatus.SENDING }
            : { status, completedAt: blast.completedAt ?? new Date() },
      });
    }

    return {
      status,
      remaining,
      internalFailures,
    };
  }

  async handleTwilioStatusCallback(payload: TwilioStatusCallbackPayload) {
    const messageSid = String(payload.messageSid || "").trim();
    const status = String(payload.messageStatus || "").trim().toLowerCase();
    const errorCode = payload.errorCode ? String(payload.errorCode).trim() : null;
    const errorMessage = payload.errorMessage ? String(payload.errorMessage).trim() : null;
    if (!messageSid || !status) {
      return {
        messageSid,
        status,
        recipientUpdates: 0,
        outboundUpdates: 0,
        ignored: true,
      };
    }

    const callbackAt = new Date();
    const [recipients, outboundRows] = await Promise.all([
      this.prisma.blastRecipient.findMany({
        where: { twilioMessageSid: messageSid },
        select: {
          id: true,
          blastId: true,
          status: true,
          deliveredAt: true,
          failureCategory: true,
          errorCode: true,
          errorMessage: true,
          metadata: true,
        },
      }),
      this.prisma.outboundMessage.findMany({
        where: { twilioMessageSid: messageSid },
        select: {
          id: true,
          status: true,
          errorCode: true,
          errorMessage: true,
        },
      }),
    ]);

    let recipientUpdates = 0;
    let outboundUpdates = 0;
    const affectedBlastIds = new Set<string>();

    for (const recipient of recipients) {
      const data: Prisma.BlastRecipientUpdateInput = {};
      if (TWILIO_DELIVERY_CONFIRMED_STATUSES.has(status)) {
        const shouldSetDeliveredAt = !recipient.deliveredAt;
        const shouldSetDeliveredStatus =
          SEND_PHASE_RECIPIENT_STATUSES.includes(recipient.status) &&
          recipient.status !== BlastRecipientStatus.DELIVERED;
        const shouldClearError = Boolean(recipient.errorCode || recipient.errorMessage);
        if (shouldSetDeliveredAt) data.deliveredAt = callbackAt;
        if (shouldSetDeliveredStatus) {
          data.status = BlastRecipientStatus.DELIVERED;
        }
        if (shouldClearError) {
          data.errorCode = null;
          data.errorMessage = null;
        }
        if (shouldSetDeliveredAt || shouldSetDeliveredStatus || shouldClearError) {
          data.metadata = this.appendRecipientTrace(
            recipient.metadata,
            {
              status: BlastRecipientStatus.DELIVERED,
              source: "twilio_callback",
              reason: `Delivery confirmed (${status})`,
              detail: messageSid,
            },
            callbackAt,
          );
        }
      } else if (TWILIO_DELIVERY_FAILED_STATUSES.has(status)) {
        const nextFailureCodeRaw = errorCode || recipient.errorCode || null;
        const nextFailureMessage = errorMessage || recipient.errorMessage || null;
        const classification = classifyFailureScope({
          errorCode: nextFailureCodeRaw,
          errorMessage: nextFailureMessage,
          messageStatus: status,
        });
        const shouldSetFailedStatus = FAILED_TRANSITIONABLE_STATUSES.includes(recipient.status);
        if (shouldSetFailedStatus) {
          data.status = BlastRecipientStatus.FAILED;
        }
        const nextFailureCode = classification.code || nextFailureCodeRaw;
        const nextFailureCategory = classification.normalizedCategory;
        const shouldSetCategory = nextFailureCategory !== recipient.failureCategory;
        if (shouldSetCategory) {
          data.failureCategory = nextFailureCategory;
        }
        const shouldSetCode = Boolean(nextFailureCode && nextFailureCode !== recipient.errorCode);
        const shouldSetMessage = Boolean(
          nextFailureMessage && nextFailureMessage !== recipient.errorMessage,
        );
        if (shouldSetCode) data.errorCode = nextFailureCode;
        if (shouldSetMessage) data.errorMessage = nextFailureMessage;
        if (shouldSetFailedStatus || shouldSetCategory || shouldSetCode || shouldSetMessage) {
          data.metadata = this.appendRecipientTrace(
            recipient.metadata,
            {
              status: BlastRecipientStatus.FAILED,
              source: "twilio_callback",
              reason: `Delivery failed (${status})`,
              scope: classification.scope,
              category: classification.normalizedCategory,
              code: nextFailureCode,
              detail: nextFailureMessage || messageSid,
            },
            callbackAt,
          );
        }
      } else {
        continue;
      }
      if (Object.keys(data).length === 0) continue;
      await this.prisma.blastRecipient.update({
        where: { id: recipient.id },
        data,
      });
      affectedBlastIds.add(recipient.blastId);
      recipientUpdates += 1;
    }

    for (const outbound of outboundRows) {
      const data: Prisma.OutboundMessageUpdateInput = {};
      if (TWILIO_DELIVERY_CONFIRMED_STATUSES.has(status)) {
        if (outbound.status !== BlastRecipientStatus.DELIVERED) {
          data.status = BlastRecipientStatus.DELIVERED;
        }
        if (outbound.errorCode || outbound.errorMessage) {
          data.errorCode = null;
          data.errorMessage = null;
        }
      } else if (TWILIO_DELIVERY_FAILED_STATUSES.has(status)) {
        if (outbound.status !== BlastRecipientStatus.FAILED) {
          data.status = BlastRecipientStatus.FAILED;
        }
        if (errorCode && errorCode !== outbound.errorCode) data.errorCode = errorCode;
        if (errorMessage && errorMessage !== outbound.errorMessage) data.errorMessage = errorMessage;
      } else {
        continue;
      }
      if (Object.keys(data).length === 0) continue;
      await this.prisma.outboundMessage.update({
        where: { id: outbound.id },
        data,
      });
      outboundUpdates += 1;
    }

    const blastStatusUpdates: Array<{
      blastId: string;
      status: BlastStatus;
      remaining: number;
      internalFailures: number;
    }> = [];
    for (const blastId of affectedBlastIds) {
      const statusUpdate = await this.recalculateBlastStatus(blastId);
      blastStatusUpdates.push({
        blastId,
        ...statusUpdate,
      });
      this.events.emit("blast.updated", {
        blastId,
        status: statusUpdate.status,
        remaining: statusUpdate.remaining,
        internalFailures: statusUpdate.internalFailures,
        source: "twilio_callback",
      });
    }

    return {
      messageSid,
      status,
      recipientUpdates,
      outboundUpdates,
      blastStatusUpdates,
      ignored: false,
    };
  }

  async sendNow(id: string, requestedBatchSize?: number) {
    const blast = await this.getBlastOrThrow(id);
    if (blast.status !== BlastStatus.SENDING) {
      assertValidBlastTransition(
        blast.status as unknown as FlowBlastStatus,
        FlowBlastStatus.SENDING,
      );
      await this.prisma.blast.update({
        where: { id },
        data: {
          status: BlastStatus.SENDING,
          startedAt: blast.startedAt ?? new Date(),
        },
      });
    }

    await this.ensureBlastRecipientRecords({
      id: blast.id,
      audienceId: blast.audienceId,
      bodyTemplate: blast.bodyTemplate,
    });

    const batchSize = this.getSendBatchSize(requestedBatchSize);
    const pendingRecipients = await this.prisma.blastRecipient.findMany({
      where: {
        blastId: blast.id,
        status: { in: [BlastRecipientStatus.PENDING, BlastRecipientStatus.QUEUED] },
      },
      orderBy: { createdAt: "asc" },
      take: batchSize,
    });

    let sent = 0;
    let failed = 0;
    let skippedDuplicates = 0;
    const startedAtMs = Date.now();
    const runBudgetMs = this.getSendTimeBudgetMs();
    const sentRecipients = await this.prisma.blastRecipient.findMany({
      where: {
        blastId: blast.id,
        status: { in: SENT_RECIPIENT_STATUSES },
      },
      select: { phoneE164: true },
      distinct: ["phoneE164"],
    });
    const sentPhones = new Set(sentRecipients.map((recipient) => recipient.phoneE164));
    const dryRunEnabled = this.isBlastDryRunEnabled();
    if (dryRunEnabled && pendingRecipients.length > 0) {
      this.logger.warn(
        `BLAST_DRY_RUN enabled: simulating blast sends (blastId=${blast.id}, batchSize=${pendingRecipients.length})`,
      );
    }

    for (const recipient of pendingRecipients) {
      const elapsedMs = Date.now() - startedAtMs;
      if (elapsedMs >= runBudgetMs) {
        this.logger.warn(
          `Stopping blast send batch early due to runtime budget (blastId=${blast.id}, elapsedMs=${elapsedMs}, budgetMs=${runBudgetMs})`,
        );
        break;
      }
      if (sentPhones.has(recipient.phoneE164)) {
        skippedDuplicates += 1;
        await this.prisma.blastRecipient.update({
          where: { id: recipient.id },
          data: {
            status: BlastRecipientStatus.SKIPPED,
            failureCategory: "EXTERNAL_DUPLICATE_RECIPIENT",
            errorMessage: SKIPPED_DUPLICATE_ERROR,
            metadata: this.appendRecipientTrace(recipient.metadata, {
              status: BlastRecipientStatus.SKIPPED,
              source: "send_now",
              scope: "EXTERNAL",
              category: "EXTERNAL_DUPLICATE_RECIPIENT",
              reason: "Skipped duplicate phone in blast send batch",
              detail: SKIPPED_DUPLICATE_ERROR,
            }),
          },
        });
        this.logger.warn(
          `Skipping duplicate recipient send (blastId=${blast.id}, recipientId=${recipient.id}, phoneE164=${recipient.phoneE164})`,
        );
        continue;
      }
      await this.prisma.blastRecipient.update({
        where: { id: recipient.id },
        data: {
          status: BlastRecipientStatus.QUEUED,
          metadata: this.appendRecipientTrace(recipient.metadata, {
            status: BlastRecipientStatus.QUEUED,
            source: "send_now",
            reason: "Recipient queued for send",
          }),
        },
      });
      try {
        const message = dryRunEnabled
          ? this.createDryRunMessage(recipient.phoneE164, recipient.renderedBody, `send-${recipient.id}`)
          : await this.twilio.sendMessage(recipient.phoneE164, recipient.renderedBody);
        sent += 1;
        sentPhones.add(recipient.phoneE164);
        await this.prisma.blastRecipient.update({
          where: { id: recipient.id },
          data: {
            status: BlastRecipientStatus.SENT,
            twilioMessageSid: message.sid,
            sentAt: new Date(message.dateSent || message.dateCreated),
            metadata: this.appendRecipientTrace(recipient.metadata, {
              status: BlastRecipientStatus.SENT,
              source: "send_now",
              reason: dryRunEnabled
                ? "Dry run: simulated Twilio acceptance"
                : "Message accepted by Twilio for delivery",
              detail: message.sid,
            }),
          },
        });
        await this.prisma.outboundMessage.create({
          data: {
            organizationId: blast.organizationId,
            blastId: blast.id,
            recipientId: recipient.id,
            toPhone: normalizePhoneE164(message.to),
            fromPhone: normalizePhoneE164(message.from),
            body: message.body || recipient.renderedBody,
            status: BlastRecipientStatus.SENT,
            twilioMessageSid: message.sid,
            sentAt: new Date(message.dateSent || message.dateCreated),
          },
        });
      } catch (error) {
        failed += 1;
        const failureText = String(error);
        const classification = classifyFailureScope({
          error: failureText,
          errorMessage: failureText,
        });
        await this.prisma.blastRecipient.update({
          where: { id: recipient.id },
          data: {
            status: BlastRecipientStatus.FAILED,
            failureCategory: classification.normalizedCategory,
            ...(classification.code ? { errorCode: classification.code } : {}),
            errorMessage: failureText,
            metadata: this.appendRecipientTrace(recipient.metadata, {
              status: BlastRecipientStatus.FAILED,
              source: "send_now",
              scope: classification.scope,
              category: classification.normalizedCategory,
              code: classification.code,
              reason: "Send attempt failed before delivery callback",
              detail: failureText,
            }),
          },
        });
      }
    }
    if (skippedDuplicates > 0) {
      this.logger.warn(
        `Skipped duplicate recipient sends (blastId=${blast.id}, skipped=${skippedDuplicates})`,
      );
    }

    const statusUpdate = await this.recalculateBlastStatus(blast.id);
    const updated = await this.getBlastOrThrow(blast.id);

    await this.writeSnapshot(blast.organizationId, blast.id, "sent", sent);
    await this.writeSnapshot(blast.organizationId, blast.id, "failed", failed);
    this.events.emit("blast.updated", {
      blastId: blast.id,
      status: statusUpdate.status,
      sent,
      failed,
      skipped: skippedDuplicates,
      remaining: statusUpdate.remaining,
      internalFailures: statusUpdate.internalFailures,
    });

    return {
      blast: updated,
      sent,
      failed,
      skipped: skippedDuplicates,
      remaining: statusUpdate.remaining,
      batchSize,
    };
  }

  async dispatchDueScheduled(limit = 1) {
    const boundedLimit = Math.min(Math.max(1, Math.trunc(limit || 1)), 25);
    const dispatchBatchSize = this.getDispatchBatchSize();
    const due = await this.prisma.blast.findMany({
      where: {
        OR: [
          {
            status: BlastStatus.SCHEDULED,
            scheduledFor: { lte: new Date() },
          },
          {
            status: BlastStatus.SENDING,
          },
        ],
      },
      orderBy: [{ scheduledFor: "asc" }, { updatedAt: "asc" }],
      take: boundedLimit,
    });

    const results: Array<Record<string, unknown>> = [];
    for (const blast of due) {
      if (this.isBullmqBlastEnabled()) {
        const queued = await this.enqueueBlastSendBatch(
          { blastId: blast.id, requestedBatchSize: dispatchBatchSize },
          blast.scheduledFor && blast.scheduledFor > new Date() ? blast.scheduledFor : undefined,
        );
        results.push({
          blastId: blast.id,
          ok: true,
          queued: queued.queued,
          jobId: queued.jobId,
        });
        continue;
      }
      try {
        const outcome = await this.sendNow(blast.id, dispatchBatchSize);
        results.push({
          blastId: blast.id,
          ok: true,
          status: outcome.blast.status,
          sent: outcome.sent,
          failed: outcome.failed,
          skipped: outcome.skipped,
          remaining: outcome.remaining,
          batchSize: outcome.batchSize,
        });
      } catch (error) {
        results.push({
          blastId: blast.id,
          ok: false,
          error: String(error),
        });
      }
    }

    return {
      processed: due.length,
      results,
    };
  }

  async retryFailed(id: string, _fromQueue = false) {
    const blast = await this.getBlastOrThrow(id);
    const failedRecipients = await this.prisma.blastRecipient.findMany({
      where: { blastId: id, status: BlastRecipientStatus.FAILED },
    });
    const dryRunEnabled = this.isBlastDryRunEnabled();
    if (dryRunEnabled && failedRecipients.length > 0) {
      this.logger.warn(
        `BLAST_DRY_RUN enabled: simulating retry sends (blastId=${blast.id}, recipients=${failedRecipients.length})`,
      );
    }
    let retried = 0;
    for (const recipient of failedRecipients) {
      try {
        const sent = dryRunEnabled
          ? this.createDryRunMessage(recipient.phoneE164, recipient.renderedBody, `retry-${recipient.id}`)
          : await this.twilio.sendMessage(recipient.phoneE164, recipient.renderedBody);
        retried += 1;
        await this.prisma.blastRecipient.update({
          where: { id: recipient.id },
          data: {
            status: BlastRecipientStatus.SENT,
            twilioMessageSid: sent.sid,
            sentAt: new Date(sent.dateSent || sent.dateCreated),
            failureCategory: null,
            errorCode: null,
            errorMessage: null,
            metadata: this.appendRecipientTrace(recipient.metadata, {
              status: BlastRecipientStatus.SENT,
              source: "retry_failed",
              reason: dryRunEnabled ? "Dry run: simulated retry send success" : "Retry send succeeded",
              detail: sent.sid,
            }),
          },
        });
      } catch (error) {
        const failureText = String(error);
        const classification = classifyFailureScope({
          error: failureText,
          errorMessage: failureText,
        });
        await this.prisma.blastRecipient.update({
          where: { id: recipient.id },
          data: {
            status: BlastRecipientStatus.FAILED,
            failureCategory: classification.normalizedCategory,
            ...(classification.code ? { errorCode: classification.code } : {}),
            errorMessage: failureText,
            metadata: this.appendRecipientTrace(recipient.metadata, {
              status: BlastRecipientStatus.FAILED,
              source: "retry_failed",
              scope: classification.scope,
              category: classification.normalizedCategory,
              code: classification.code,
              reason: "Retry send failed",
              detail: failureText,
            }),
          },
        });
      }
    }
    const statusUpdate = await this.recalculateBlastStatus(blast.id);
    this.events.emit("blast.retry", {
      blastId: blast.id,
      retried,
      status: statusUpdate.status,
      internalFailures: statusUpdate.internalFailures,
    });
    this.events.emit("blast.updated", {
      blastId: blast.id,
      status: statusUpdate.status,
      remaining: statusUpdate.remaining,
      internalFailures: statusUpdate.internalFailures,
      source: "retry_failed",
    });
    return { blastId: blast.id, retried };
  }

  async listBlasts(where?: Prisma.BlastWhereInput) {
    const org = await this.ensureOrganization();
    return this.prisma.blast.findMany({
      where: {
        organizationId: org.id,
        ...(where || {}),
      },
      include: {
        _count: {
          select: { recipients: true },
        },
      },
      orderBy: { createdAt: "desc" },
      take: 100,
    });
  }
}
