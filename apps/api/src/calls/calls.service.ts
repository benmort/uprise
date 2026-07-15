import {
  BadRequestException,
  Injectable,
  NotFoundException,
  ServiceUnavailableException,
} from "@nestjs/common";
import { ConfigService } from "@nestjs/config";
import { Call, CallStatus, Prisma } from "@uprise/db";
import { PrismaService } from "../prisma/prisma.service";
import { OutboxService } from "../common/outbox/outbox.service";
import { WebhookEventService } from "../common/webhooks/webhook-event.service";
import { DomainLogger } from "../common/logging/domain-logger.service";
import { TwilioService } from "../twilio/twilio.service";
import { TelephonyWebhookAuthService } from "../telephony/telephony-webhook-auth.service";
import { VoiceAccountResolver } from "../telephony/voice-account.resolver";
import { canTransitionCall, mapTwilioCallStatus } from "./call-state.machine";

const VOICE_TOKEN_TTL_SECONDS = 3600;

const E164_RE = /^\+[1-9]\d{6,14}$/;
const VOICE_PROVIDER = "twilio-voice";
/** Twilio recording URLs embed the owning AccountSid: /Accounts/AC…/Recordings/RE… */
const ACCOUNT_SID_RE = /\/Accounts\/(AC[0-9a-zA-Z]+)\//;

export interface ListCallsFilter {
  status?: CallStatus[];
  contactId?: string;
  search?: string;
  from?: string;
  to?: string;
  limit?: number;
  offset?: number;
}

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
    private readonly telephonyAuth: TelephonyWebhookAuthService,
    private readonly voiceAccounts: VoiceAccountResolver,
  ) {}

  /**
   * Mint a browser (WebRTC) voice access token for the caller, under the account
   * that will place their calls — the tenant's provisioned subaccount when it has
   * an ACTIVE transactional number, else the platform account. The identity encodes
   * the session (`u{userId}.t{tenantId}`) so the /voice-outbound webhook derives the
   * tenant from the token, never a client param. `fromNumber` is the caller ID.
   */
  async voiceToken(
    userId: string,
    tenantId: string,
  ): Promise<{ token: string; identity: string; fromNumber: string; expiresAt: string }> {
    const account = await this.voiceAccounts.resolveForTenant(tenantId);
    if (!account.accountSid || !account.apiKeySid || !account.apiKeySecret || !account.twimlAppSid) {
      throw new ServiceUnavailableException(
        "Browser calling isn't configured yet — set up a Twilio Voice API key + TwiML App.",
      );
    }
    const identity = `u${userId}.t${tenantId}`;
    const token = this.twilio.mintVoiceToken({
      accountSid: account.accountSid,
      apiKeySid: account.apiKeySid,
      apiKeySecret: account.apiKeySecret,
      twimlAppSid: account.twimlAppSid,
      identity,
      ttlSeconds: VOICE_TOKEN_TTL_SECONDS,
    });
    return {
      token,
      identity,
      fromNumber: account.callerId,
      expiresAt: new Date(Date.now() + VOICE_TOKEN_TTL_SECONDS * 1000).toISOString(),
    };
  }

  /**
   * Create the Call row for a browser-originated outbound call (the /voice-outbound
   * TwiML webhook). The provider CallSid is bound later, on the first status callback
   * (see processStatusCallback's callId path). Emits the initiated event like initiate().
   */
  async createBrowserCall(input: {
    tenantId: string;
    toNumber: string;
    fromNumber: string;
    contactId?: string | null;
  }): Promise<Call> {
    const toNumber = input.toNumber.trim();
    if (!E164_RE.test(toNumber)) throw new BadRequestException("toNumber must be E.164");
    return this.prisma.$transaction(async (tx) => {
      const created = await tx.call.create({
        data: {
          tenantId: input.tenantId,
          contactId: input.contactId ?? null,
          toNumber,
          fromNumber: input.fromNumber || "",
          status: CallStatus.INITIATED,
        },
      });
      await this.outbox.append(tx, {
        tenantId: input.tenantId,
        eventType: "telephony.call.initiated",
        aggregateId: created.id,
        payload: { callId: created.id, tenantId: input.tenantId, toNumber },
      });
      return created;
    });
  }

  /**
   * The TwiML App handler for a browser-originated call (/voice-outbound): resolve
   * the caller ID for the placing account, create the Call row, and return the
   * `<Dial>` TwiML that bridges the softphone to the callee (threading our callId
   * through the status + recording callbacks).
   */
  async startBrowserCall(input: {
    tenantId: string;
    toNumber: string;
    contactId?: string | null;
    accountSid?: string;
  }): Promise<{ twiml: string }> {
    const callerId = await this.voiceAccounts.callerIdForAccount(input.tenantId, input.accountSid ?? "");
    const call = await this.createBrowserCall({
      tenantId: input.tenantId,
      toNumber: input.toNumber,
      fromNumber: callerId,
      contactId: input.contactId ?? null,
    });
    const base = this.config.get<string>("API_BASE_URL", "").trim().replace(/\/+$/, "");
    const twiml = this.twilio.buildDialTwiml({
      to: call.toNumber,
      callerId,
      callId: call.id,
      statusCallbackBase: `${base}/api/v1/voice-status-callback`,
      recordingCallbackBase: `${base}/api/v1/voice-recording-callback`,
    });
    return { twiml };
  }

  /**
   * Place an outbound call: write the INITIATED row + outbox event atomically,
   * then dispatch via Twilio and bind the provider CallSid. A dispatch failure
   * marks the row FAILED (INITIATED→FAILED is legal) and rethrows.
   */
  async initiate(tenantId: string, input: InitiateCallInput): Promise<Call> {
    const toNumber = input.toNumber.trim();
    if (!E164_RE.test(toNumber)) throw new BadRequestException("toNumber must be E.164");
    const fromNumber =
      (input.fromNumber?.trim() || "") ||
      this.config.get<string>("TWILIO_VOICE_FROM", "").trim() ||
      this.config.get<string>("TWILIO_PHONE_NUMBER", "").trim();
    if (fromNumber && !E164_RE.test(fromNumber)) {
      throw new BadRequestException("fromNumber must be E.164");
    }

    const call = await this.prisma.$transaction(async (tx) => {
      const created = await tx.call.create({
        data: {
          tenantId,
          contactId: input.contactId ?? null,
          toNumber,
          fromNumber: fromNumber || "",
          status: CallStatus.INITIATED,
        },
      });
      await this.outbox.append(tx, {
        tenantId,
        eventType: "telephony.call.initiated",
        aggregateId: created.id,
        payload: { callId: created.id, tenantId, toNumber },
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
   *
   * `callId` (browser-originated calls) identifies the pre-created Call row — the
   * provider CallSid is bound to it on the first callback; server-initiated calls
   * are found by their already-bound providerCallId.
   */
  async processStatusCallback(cb: VoiceStatusCallback, callId?: string): Promise<void> {
    const eventId = `${cb.callSid}:${cb.status}`;
    if (!(await this.webhookEvents.claim(VOICE_PROVIDER, eventId))) return; // duplicate status delivery
    try {
      const call = callId
        ? await this.prisma.call.findUnique({ where: { id: callId } })
        : await this.prisma.call.findUnique({ where: { providerCallId: cb.callSid } });
      if (!call) return; // unknown call (e.g. placed outside this system)
      // Browser calls create the row before the provider SID exists — bind it on the
      // first callback; ignore a callback whose SID contradicts an already-bound call.
      if (!call.providerCallId) {
        await this.prisma.call.update({ where: { id: call.id }, data: { providerCallId: cb.callSid } });
      } else if (call.providerCallId !== cb.callSid) {
        return;
      }

      const target = mapTwilioCallStatus(cb.status);
      if (!target) return; // queued/initiated — nothing to transition.
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

  /** Shared tenant-scoped filter for the list + stats (status/contact/search/date range). */
  private buildWhere(tenantId: string, filter: ListCallsFilter): Prisma.CallWhereInput {
    const where: Prisma.CallWhereInput = { tenantId };
    if (filter.status?.length) where.status = { in: filter.status };
    if (filter.contactId) where.contactId = filter.contactId;
    if (filter.search) {
      const q = filter.search.trim();
      where.OR = [
        { toNumber: { contains: q, mode: "insensitive" } },
        { fromNumber: { contains: q, mode: "insensitive" } },
      ];
    }
    if (filter.from || filter.to) {
      where.createdAt = {
        ...(filter.from ? { gte: new Date(filter.from) } : {}),
        ...(filter.to ? { lte: new Date(filter.to) } : {}),
      };
    }
    return where;
  }

  /**
   * Tenant-scoped, filtered, paginated call log (transactional calls, newest first).
   * Returns the `{ items, total }` envelope the admin listing pages expect.
   */
  async listCalls(tenantId: string, filter: ListCallsFilter = {}): Promise<{ items: Call[]; total: number }> {
    const where = this.buildWhere(tenantId, filter);
    const take = Math.min(Math.max(1, filter.limit ?? 25), 200);
    const skip = Math.max(0, filter.offset ?? 0);
    const [items, total] = await this.prisma.$transaction([
      this.prisma.call.findMany({ where, orderBy: { createdAt: "desc" }, take, skip }),
      this.prisma.call.count({ where }),
    ]);
    return { items, total };
  }

  /**
   * Aggregate KPIs over the SAME filter as the list (whole set, not one page):
   * total, per-status counts, and total talk time. Backs the calls-page KPI tiles.
   */
  async stats(
    tenantId: string,
    filter: ListCallsFilter = {},
  ): Promise<{ total: number; byStatus: Record<string, number>; totalDurationSeconds: number }> {
    const where = this.buildWhere(tenantId, filter);
    const [grouped, durationAgg] = await this.prisma.$transaction([
      this.prisma.call.groupBy({ by: ["status"], where, _count: { _all: true }, orderBy: { status: "asc" } }),
      this.prisma.call.aggregate({ where, _sum: { durationSeconds: true } }),
    ]);
    const byStatus: Record<string, number> = {};
    let total = 0;
    for (const g of grouped as Array<{ status: CallStatus; _count: { _all: number } }>) {
      const n = g._count._all;
      byStatus[g.status] = n;
      total += n;
    }
    return { total, byStatus, totalDurationSeconds: durationAgg._sum.durationSeconds ?? 0 };
  }

  async getCall(tenantId: string, id: string): Promise<Call> {
    const call = await this.prisma.call.findFirst({ where: { id, tenantId } });
    if (!call) throw new NotFoundException("Call not found");
    return call;
  }

  /**
   * Twilio recording status callback → bind the recording URL to its Call. The
   * recording completes separately from the call, so this is its own idempotent
   * claim (`callSid:recording`); release on throw so a retry reprocesses.
   */
  async processRecordingCallback(
    cb: { callSid: string; recordingUrl?: string },
    callId?: string,
  ): Promise<void> {
    if (!cb.recordingUrl) return;
    const eventId = `${cb.callSid}:recording`;
    if (!(await this.webhookEvents.claim(VOICE_PROVIDER, eventId))) return; // duplicate delivery
    try {
      const call = callId
        ? await this.prisma.call.findUnique({ where: { id: callId } })
        : await this.prisma.call.findUnique({ where: { providerCallId: cb.callSid } });
      if (!call) return; // unknown call
      await this.prisma.call.update({ where: { id: call.id }, data: { recordingUrl: cb.recordingUrl } });
    } catch (err) {
      await this.webhookEvents.release(VOICE_PROVIDER, eventId);
      throw err;
    }
  }

  /**
   * Fetch a call's recording audio for playback. The raw Twilio media URL needs
   * account Basic-auth, so the admin can't load it directly — this proxies it,
   * resolving the owning account's token (platform or subaccount) from the
   * AccountSid embedded in the recording URL. Tenant-scoped; 404 if no recording.
   */
  async streamRecording(tenantId: string, id: string): Promise<{ contentType: string; body: Buffer }> {
    const call = await this.getCall(tenantId, id);
    if (!call.recordingUrl) throw new NotFoundException("No recording for this call");
    const accountSid =
      ACCOUNT_SID_RE.exec(call.recordingUrl)?.[1] ??
      this.config.get<string>("TWILIO_ACCOUNT_SID", "").trim();
    const token = await this.telephonyAuth.tokenForAccountSid(accountSid);
    const auth = Buffer.from(`${accountSid}:${token}`).toString("base64");
    const res = await fetch(`${call.recordingUrl}.mp3`, { headers: { Authorization: `Basic ${auth}` } });
    if (!res.ok) {
      throw new NotFoundException(`Recording unavailable (provider responded ${res.status})`);
    }
    return { contentType: "audio/mpeg", body: Buffer.from(await res.arrayBuffer()) };
  }
}
