import { BadRequestException, Injectable, NotFoundException } from "@nestjs/common";
import { ConfigService } from "@nestjs/config";
import { Call, CallStatus } from "@uprise/db";
import { PrismaService } from "../prisma/prisma.service";
import { OutboxService } from "../common/outbox/outbox.service";
import { WebhookEventService } from "../common/webhooks/webhook-event.service";
import { DomainLogger } from "../common/logging/domain-logger.service";
import { TwilioService } from "../twilio/twilio.service";
import { canTransitionCall, mapTwilioCallStatus } from "./call-state.machine";

const E164_RE = /^\+[1-9]\d{6,14}$/;
const VOICE_PROVIDER = "twilio-voice";

export interface InitiateCallInput {
  toNumber: string;
  fromNumber?: string;
  contactId?: string;
  /** TwiML endpoint URL; falls back to TWILIO_VOICE_TWIML_URL. */
  url?: string;
  /** Inline TwiML, alternative to url. */
  twiml?: string;
}

export interface VoiceStatusCallback {
  callSid: string;
  status: string; // Twilio CallStatus (ringing | in-progress | completed | busy | no-answer | failed | canceled)
  durationSeconds?: number;
  recordingUrl?: string;
  priceCents?: number;
  currency?: string;
  startedAt?: Date;
  endedAt?: Date;
}

@Injectable()
export class CallsService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly config: ConfigService,
    private readonly outbox: OutboxService,
    private readonly webhookEvents: WebhookEventService,
    private readonly twilio: TwilioService,
    private readonly logger: DomainLogger,
  ) {}

  private async ensureOrganization() {
    const slug = this.config.get<string>("DEFAULT_ORGANIZATION_SLUG", "default");
    return this.prisma.tenant.upsert({
      where: { slug },
      create: { slug, name: "Default Organization" },
      update: {},
    });
  }

  /**
   * Place an outbound call: write the INITIATED row + outbox event atomically,
   * then dispatch via Twilio and bind the provider CallSid. A dispatch failure
   * marks the row FAILED (INITIATED→FAILED is legal) and rethrows.
   */
  async initiate(input: InitiateCallInput): Promise<Call> {
    const toNumber = input.toNumber.trim();
    if (!E164_RE.test(toNumber)) throw new BadRequestException("toNumber must be E.164");
    const fromNumber =
      (input.fromNumber?.trim() || "") ||
      this.config.get<string>("TWILIO_VOICE_FROM", "").trim() ||
      this.config.get<string>("TWILIO_PHONE_NUMBER", "").trim();
    if (fromNumber && !E164_RE.test(fromNumber)) {
      throw new BadRequestException("fromNumber must be E.164");
    }
    const org = await this.ensureOrganization();

    const call = await this.prisma.$transaction(async (tx) => {
      const created = await tx.call.create({
        data: {
          tenantId: org.id,
          contactId: input.contactId ?? null,
          toNumber,
          fromNumber: fromNumber || "",
          status: CallStatus.INITIATED,
        },
      });
      await this.outbox.append(tx, {
        tenantId: org.id,
        eventType: "telephony.call.initiated",
        aggregateId: created.id,
        payload: { callId: created.id, tenantId: org.id, toNumber },
      });
      return created;
    });

    try {
      const { sid } = await this.twilio.placeCall({
        to: toNumber,
        from: fromNumber || undefined,
        url: input.url,
        twiml: input.twiml,
      });
      return this.prisma.call.update({ where: { id: call.id }, data: { providerCallId: sid } });
    } catch (err) {
      await this.prisma.call.update({ where: { id: call.id }, data: { status: CallStatus.FAILED } });
      this.logger.error("telephony", "placeCall failed", undefined, {
        callId: call.id,
        error: String(err),
      });
      throw err;
    }
  }

  /**
   * Twilio status callback → Call FSM (meld doc 09). Idempotent on
   * (provider, callSid:status) so retries of the SAME status are dropped while
   * distinct lifecycle statuses still apply (a CallSid-only claim would swallow
   * every status after the first). An illegal/terminal transition is a no-op.
   */
  async processStatusCallback(cb: VoiceStatusCallback): Promise<void> {
    const eventId = `${cb.callSid}:${cb.status}`;
    if (!(await this.webhookEvents.claim(VOICE_PROVIDER, eventId))) return; // duplicate status delivery
    try {
      const target = mapTwilioCallStatus(cb.status);
      if (!target) return; // queued/initiated — nothing to transition.

      const call = await this.prisma.call.findUnique({ where: { providerCallId: cb.callSid } });
      if (!call) return; // unknown call (e.g. placed outside this system)
      if (!canTransitionCall(call.status, target)) return; // replayed/terminal — already processed.

      const data: Record<string, unknown> = { status: target };
      if (target === CallStatus.IN_PROGRESS && cb.startedAt) data.startedAt = cb.startedAt;
      if (target === CallStatus.COMPLETED) {
        if (cb.durationSeconds !== undefined) data.durationSeconds = cb.durationSeconds;
        if (cb.recordingUrl !== undefined) data.recordingUrl = cb.recordingUrl;
        if (cb.priceCents !== undefined) data.priceCents = cb.priceCents;
        if (cb.currency !== undefined) data.currency = cb.currency;
        data.endedAt = cb.endedAt ?? new Date();
      }
      await this.prisma.$transaction(async (tx) => {
        await tx.call.update({ where: { id: call.id }, data });
        // Durable lifecycle event for every legal transition
        // (ringing/in-progress/busy/no-answer/failed/completed) so canvassing +
        // analytics reactions can subscribe to the full call timeline (doc 09).
        await this.outbox.append(tx, {
          tenantId: call.tenantId,
          eventType: "telephony.call.status-changed",
          aggregateId: call.id,
          payload: { callId: call.id, tenantId: call.tenantId, status: target },
        });
        // The completion-specific event carries the billable duration.
        if (target === CallStatus.COMPLETED) {
          await this.outbox.append(tx, {
            tenantId: call.tenantId,
            eventType: "telephony.call.completed",
            aggregateId: call.id,
            payload: {
              callId: call.id,
              tenantId: call.tenantId,
              durationSeconds: cb.durationSeconds ?? null,
            },
          });
        }
      });
    } catch (err) {
      // Release the claim so Twilio's retry reprocesses a transient failure.
      await this.webhookEvents.release(VOICE_PROVIDER, eventId);
      throw err;
    }
  }

  async listCalls(limit = 50): Promise<Call[]> {
    const org = await this.ensureOrganization();
    return this.prisma.call.findMany({
      where: { tenantId: org.id },
      orderBy: { createdAt: "desc" },
      take: Math.min(Math.max(1, limit), 200),
    });
  }

  async getCall(id: string): Promise<Call> {
    const org = await this.ensureOrganization();
    const call = await this.prisma.call.findFirst({ where: { id, tenantId: org.id } });
    if (!call) throw new NotFoundException("Call not found");
    return call;
  }
}
