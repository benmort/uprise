import { Injectable, NotFoundException } from "@nestjs/common";
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
import { TwilioService } from "../twilio/twilio.service";
import { normalizePhoneE164 } from "../common/utils/phone.utils";
import { RealtimeEventsService } from "../common/events/realtime-events.service";
import { toUtcMinuteBucket } from "../common/utils/date.utils";
import { BlastStatus as FlowBlastStatus } from "../common/enums/blast-status.enum";

type RecipientSeed = {
  contactId?: string;
  phoneE164: string;
  metadata: Record<string, unknown>;
};

@Injectable()
export class BlastsService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly config: ConfigService,
    private readonly renderer: TemplateRendererService,
    private readonly compliance: ComplianceService,
    private readonly twilio: TwilioService,
    private readonly events: RealtimeEventsService,
  ) {}

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
    return { blastId: blast.id, previews };
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
    return updated;
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
    for (const recipient of recipients) {
      const context = recipient.metadata;
      const renderedBody = this.renderer.render(blast.bodyTemplate, context);
      const compliance = this.compliance.validateMessageForSend(renderedBody);
      await this.prisma.blastRecipient.create({
        data: {
          blastId: blast.id,
          contactId: recipient.contactId,
          phoneE164: normalizePhoneE164(recipient.phoneE164),
          renderedBody,
          status: BlastRecipientStatus.PENDING,
          metadata: {
            complianceWarnings: compliance.warnings,
            context,
          } as Prisma.InputJsonValue,
        },
      });
    }
    return recipients.length;
  }

  private classifyFailure(error: unknown): string {
    const text = String(error);
    if (/carrier|30007|30008|30003/i.test(text)) return "CARRIER_REJECTION";
    if (/auth|401|403/i.test(text)) return "AUTH";
    if (/timeout|network|fetch/i.test(text)) return "NETWORK";
    return "UNKNOWN";
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
    for (const recipient of pendingRecipients) {
      await this.prisma.blastRecipient.update({
        where: { id: recipient.id },
        data: { status: BlastRecipientStatus.QUEUED },
      });
      try {
        const message = await this.twilio.sendMessage(recipient.phoneE164, recipient.renderedBody);
        sent += 1;
        await this.prisma.blastRecipient.update({
          where: { id: recipient.id },
          data: {
            status: BlastRecipientStatus.SENT,
            twilioMessageSid: message.sid,
            sentAt: new Date(message.dateSent || message.dateCreated),
          },
        });
        await this.prisma.outboundMessage.create({
          data: {
            organizationId: blast.organizationId,
            blastId: blast.id,
            recipientId: recipient.id,
            toPhone: message.to,
            fromPhone: message.from,
            body: message.body || recipient.renderedBody,
            status: BlastRecipientStatus.SENT,
            twilioMessageSid: message.sid,
            sentAt: new Date(message.dateSent || message.dateCreated),
          },
        });
      } catch (error) {
        failed += 1;
        await this.prisma.blastRecipient.update({
          where: { id: recipient.id },
          data: {
            status: BlastRecipientStatus.FAILED,
            failureCategory: this.classifyFailure(error),
            errorMessage: String(error),
          },
        });
      }
    }

    const [remaining, totalFailed] = await Promise.all([
      this.prisma.blastRecipient.count({
        where: {
          blastId: blast.id,
          status: { in: [BlastRecipientStatus.PENDING, BlastRecipientStatus.QUEUED] },
        },
      }),
      this.prisma.blastRecipient.count({
        where: { blastId: blast.id, status: BlastRecipientStatus.FAILED },
      }),
    ]);

    const finalStatus =
      remaining > 0
        ? BlastStatus.SENDING
        : totalFailed > 0
          ? BlastStatus.FAILED
          : BlastStatus.SENT;

    const updated = await this.prisma.blast.update({
      where: { id: blast.id },
      data:
        finalStatus === BlastStatus.SENDING
          ? { status: BlastStatus.SENDING }
          : { status: finalStatus, completedAt: new Date() },
    });

    await this.writeSnapshot(blast.organizationId, blast.id, "sent", sent);
    await this.writeSnapshot(blast.organizationId, blast.id, "failed", failed);
    this.events.emit("blast.updated", {
      blastId: blast.id,
      status: finalStatus,
      sent,
      failed,
      remaining,
    });

    return {
      blast: updated,
      sent,
      failed,
      remaining,
      batchSize,
    };
  }

  async dispatchDueScheduled(limit = 10) {
    const boundedLimit = Math.min(Math.max(1, Math.trunc(limit || 10)), 100);
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
      try {
        const outcome = await this.sendNow(blast.id);
        results.push({
          blastId: blast.id,
          ok: true,
          status: outcome.blast.status,
          sent: outcome.sent,
          failed: outcome.failed,
          remaining: outcome.remaining,
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

  async retryFailed(id: string) {
    const blast = await this.getBlastOrThrow(id);
    const failedRecipients = await this.prisma.blastRecipient.findMany({
      where: { blastId: id, status: BlastRecipientStatus.FAILED },
    });
    let retried = 0;
    for (const recipient of failedRecipients) {
      try {
        const sent = await this.twilio.sendMessage(recipient.phoneE164, recipient.renderedBody);
        retried += 1;
        await this.prisma.blastRecipient.update({
          where: { id: recipient.id },
          data: {
            status: BlastRecipientStatus.SENT,
            twilioMessageSid: sent.sid,
            sentAt: new Date(sent.dateSent || sent.dateCreated),
            failureCategory: null,
            errorMessage: null,
          },
        });
      } catch (error) {
        await this.prisma.blastRecipient.update({
          where: { id: recipient.id },
          data: {
            status: BlastRecipientStatus.FAILED,
            failureCategory: this.classifyFailure(error),
            errorMessage: String(error),
          },
        });
      }
    }
    this.events.emit("blast.retry", { blastId: blast.id, retried });
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
