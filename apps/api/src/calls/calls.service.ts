import {
  UnprocessableEntityException,
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
import { isVoiceCapable } from "../telephony/phone-capabilities";
import { TelephonySenderResolver } from "../telephony/telephony-sender.resolver";
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
  /** Failure detail from the provider on a busy/no-answer/failed callback. */
  errorCode?: string;
  errorMessage?: string;
  sipCode?: string;
  /** The Twilio account that signed the webhook — checked against the call's tenant. */
  accountSid?: string;
}

/** Terminal failure states — the call ended without connecting. */
const FAILED_STATUSES: ReadonlySet<CallStatus> = new Set([
  CallStatus.FAILED,
  CallStatus.BUSY,
  CallStatus.NO_ANSWER,
]);

/** Non-terminal states the reconciliation sweep chases. */
const LIVE_STATUSES: ReadonlyArray<CallStatus> = [
  CallStatus.INITIATED,
  CallStatus.RINGING,
  CallStatus.IN_PROGRESS,
];

/** What produced a status transition — carried on the status-changed event + logs. */
type StatusSource = "webhook" | "dial-action" | "reconcile" | "dispatch";

/** `<Dial action>` DialCallStatus → our terminal status. completed → null (child-leg callback owns it). */
function mapDialCallStatus(raw: string): CallStatus | null {
  switch (raw) {
    case "busy":
      return CallStatus.BUSY;
    case "no-answer":
      return CallStatus.NO_ANSWER;
    case "failed":
    case "canceled":
      return CallStatus.FAILED;
    default:
      return null;
  }
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
    /** Optional tail dep (existing specs construct positionally); DI supplies it. */
    private readonly senderResolver?: TelephonySenderResolver,
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
    if (!isVoiceCapable(account.callerId)) {
      // Mobile (+614) numbers are SMS-only: refuse cleanly at token time rather
      // than letting the dial fail at Twilio. The UI turns this into the
      // "provision a local number" affordance.
      throw new UnprocessableEntityException({
        code: "VOICE_NUMBER_REQUIRED",
        message: "Mobile numbers can't place outbound calls — provision a local number for calling.",
      });
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
    /** Explicit tenant number choice from the dialler (validated + tenant-scoped). */
    fromNumberId?: string | null;
  }): Promise<{ twiml: string }> {
    let callerId = "";
    if (input.fromNumberId) {
      const picked = await this.senderResolver?.resolveByNumberId(input.tenantId, input.fromNumberId);
      if (picked?.from && isVoiceCapable(picked.from)) callerId = picked.from;
    }
    if (!callerId) {
      callerId = await this.voiceAccounts.callerIdForAccount(input.tenantId, input.accountSid ?? "");
    }
    if (!isVoiceCapable(callerId)) {
      // Never hand Twilio a mobile CLI: answer with a spoken explanation + hangup
      // (this path is a Twilio webhook — an exception would surface as a 500 tone).
      return {
        twiml:
          '<?xml version="1.0" encoding="UTF-8"?><Response><Say voice="Polly.Olivia">' +
          "Outbound calls need a local number. Mobile numbers can only send text messages. " +
          "Please provision a local calling number in uprise.</Say><Hangup/></Response>",
      };
    }
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
      // The <Dial action> verdict — catches dials that die before the child leg reports.
      dialActionBase: `${base}/api/v1/voice-dial-status`,
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
    if (!isVoiceCapable(fromNumber)) {
      throw new UnprocessableEntityException({
        code: "VOICE_NUMBER_REQUIRED",
        message: "Mobile (+614) numbers can't place outbound calls — use a local number.",
      });
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
      // Twilio SDK errors carry a numeric `code` (e.g. 21215 geo-permissions) — keep
      // it queryable on the row, and emit the FAILED lifecycle event like any other
      // terminal transition (a dispatch failure is part of the call timeline too).
      const providerCode = (err as { code?: number | string })?.code;
      await this.applyCallStatus(call, CallStatus.FAILED, {
        errorCode: providerCode != null ? String(providerCode) : undefined,
        errorMessage: err instanceof Error ? err.message : String(err),
      }, "dispatch");
      this.logger.error("telephony", "placeCall failed", undefined, {
        callId: call.id,
        tenantId: call.tenantId,
        errorCode: providerCode ?? null,
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
      if (!call) {
        // Not necessarily a fault (calls placed outside this system), but it must be
        // visible: a systematic unknown-call stream means a lost callId/SID binding.
        this.logger.warn("telephony", "status callback for unknown call — dropped", {
          providerCallId: cb.callSid,
          status: cb.status,
          callIdParam: callId ?? null,
        });
        return;
      }
      if (!(await this.webhookAccountMayTouchCall(call, cb.accountSid))) {
        await this.refuseForeignWebhook(eventId, call, cb.accountSid, "status callback");
        return;
      }
      // Browser calls create the row before the provider SID exists — bind it on the
      // first callback; ignore a callback whose SID contradicts an already-bound call.
      if (!call.providerCallId) {
        await this.prisma.call.update({ where: { id: call.id }, data: { providerCallId: cb.callSid } });
      } else if (call.providerCallId !== cb.callSid) {
        this.logger.warn("telephony", "status callback SID contradicts the bound call — dropped", {
          callId: call.id,
          boundProviderCallId: call.providerCallId,
          callbackCallSid: cb.callSid,
          status: cb.status,
        });
        return;
      }

      const target = mapTwilioCallStatus(cb.status);
      if (!target) {
        // queued/initiated are expected no-ops; anything else is a status we don't map.
        if (cb.status !== "queued" && cb.status !== "initiated") {
          this.logger.warn("telephony", "unmapped provider call status — dropped", {
            callId: call.id,
            providerCallId: cb.callSid,
            status: cb.status,
          });
        }
        return;
      }
      if (!canTransitionCall(call.status, target)) {
        // Replayed or out-of-order delivery — already terminal, or a stale earlier status.
        this.logger.debug("telephony", "illegal call transition — dropped", {
          callId: call.id,
          from: call.status,
          to: target,
          providerCallId: cb.callSid,
        });
        return;
      }

      await this.applyCallStatus(call, target, cb, "webhook");
    } catch (err) {
      // Release the claim so Twilio's retry reprocesses a transient failure.
      await this.webhookEvents.release(VOICE_PROVIDER, eventId);
      throw err;
    }
  }

  /**
   * A webhook may only touch a call its signing account is entitled to: the
   * platform account (tenant-agnostic) or a tenant account that owns the call's
   * tenant. Guards the `callId` query param — a leaked id plus one tenant's own
   * (BYO) credentials must never move another tenant's call. Defence-in-depth:
   * call ids are unguessable cuids. No AccountSid means the signature already
   * validated against the platform token.
   */
  private async webhookAccountMayTouchCall(call: Call, accountSid?: string): Promise<boolean> {
    if (!accountSid) return true;
    const platform = this.config.get<string>("TWILIO_ACCOUNT_SID", "").trim();
    if (!platform || accountSid === platform) return true;
    const account = await this.prisma.telephonyAccount.findFirst({ where: { accountSid } });
    return !!account && account.tenantId === call.tenantId;
  }

  /** Shared refusal path: release the claim (it wasn't ours to burn), log, drop. */
  private async refuseForeignWebhook(
    eventId: string,
    call: Call,
    accountSid: string | undefined,
    what: string,
  ): Promise<void> {
    await this.webhookEvents.release(VOICE_PROVIDER, eventId);
    this.logger.warn("telephony", `${what} signed by an account outside the call's tenant — dropped`, {
      callId: call.id,
      callTenantId: call.tenantId,
      webhookAccountSid: accountSid ?? null,
    });
  }

  /**
   * The one place a call's status actually changes: row update + the lifecycle
   * outbox event(s) in a single transaction, shared by every producer of status
   * (provider webhooks, the <Dial> action callback, the reconciliation sweep and
   * dispatch failures). Callers have already checked canTransitionCall.
   */
  private async applyCallStatus(
    call: Call,
    target: CallStatus,
    cb: Partial<VoiceStatusCallback>,
    source: StatusSource,
  ): Promise<void> {
    const data: Record<string, unknown> = { status: target };
    if (target === CallStatus.IN_PROGRESS && cb.startedAt) data.startedAt = cb.startedAt;
    if (target === CallStatus.COMPLETED) {
      if (cb.durationSeconds !== undefined) data.durationSeconds = cb.durationSeconds;
      if (cb.recordingUrl !== undefined) data.recordingUrl = cb.recordingUrl;
      if (cb.priceCents !== undefined) data.priceCents = cb.priceCents;
      if (cb.currency !== undefined) data.currency = cb.currency;
      data.endedAt = cb.endedAt ?? new Date();
    }
    // A terminal failure (busy/no-answer/failed) ends the call without connecting: stamp
    // endedAt and capture the provider's reason so the row says WHY, not just "failed".
    const isFailure = FAILED_STATUSES.has(target);
    if (isFailure) {
      data.endedAt = cb.endedAt ?? new Date();
      data.errorCode = cb.errorCode ?? null;
      data.errorMessage = cb.errorMessage ?? null;
      data.sipCode = cb.sipCode ?? null;
      // Accurate, queryable failure log — the reason a call never connected. warn (not
      // error): an unreachable/busy number is an expected outcome, not a system fault.
      this.logger.warn("telephony", "call ended without connecting", {
        callId: call.id,
        tenantId: call.tenantId,
        status: target,
        source,
        toNumber: call.toNumber,
        providerCallId: call.providerCallId ?? cb.callSid ?? null,
        errorCode: cb.errorCode ?? null,
        errorMessage: cb.errorMessage ?? null,
        sipCode: cb.sipCode ?? null,
      });
    } else {
      this.logger.debug("telephony", "call status applied", {
        callId: call.id,
        from: call.status,
        to: target,
        source,
      });
    }
    await this.prisma.$transaction(async (tx) => {
      // Compare-and-swap on the status we loaded: two concurrent producers (child-leg
      // webhook vs the <Dial> verdict vs reconcile) can both pass canTransitionCall on
      // their own read — only the first write lands; the loser is a logged no-op, so
      // the row never double-transitions and the timeline never double-emits.
      const swapped = await tx.call.updateMany({ where: { id: call.id, status: call.status }, data });
      if (swapped.count === 0) {
        this.logger.debug("telephony", "call status write lost the race — dropped", {
          callId: call.id,
          from: call.status,
          to: target,
          source,
        });
        return;
      }
      // Durable lifecycle event for every legal transition
      // (ringing/in-progress/busy/no-answer/failed/completed) so canvassing +
      // analytics reactions can subscribe to the full call timeline (doc 09).
      await this.outbox.append(tx, {
        tenantId: call.tenantId,
        eventType: "telephony.call.status-changed",
        aggregateId: call.id,
        payload: {
          callId: call.id,
          tenantId: call.tenantId,
          status: target,
          source,
          ...(isFailure
            ? {
                errorCode: cb.errorCode ?? null,
                errorMessage: cb.errorMessage ?? null,
                sipCode: cb.sipCode ?? null,
              }
            : {}),
        },
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
  }

  /**
   * `<Dial action>` outcome for a browser call (the PARENT leg's verdict on the
   * bridge). The child `<Number>` leg's own callbacks usually arrive first with
   * richer detail — this is the safety net for dials that fail before the child
   * leg reports (blocked caller ID, invalid number, instant rejection), which
   * otherwise leave the call stuck at INITIATED forever. Idempotent per
   * (parent SID, DialCallStatus); the FSM guard makes the child/parent race safe.
   */
  async processDialOutcome(input: {
    callId: string;
    parentCallSid: string;
    dialCallStatus: string;
    dialCallSid?: string;
    accountSid?: string;
  }): Promise<void> {
    const eventId = `${input.parentCallSid}:dial:${input.dialCallStatus}`;
    if (!(await this.webhookEvents.claim(VOICE_PROVIDER, eventId))) return; // duplicate delivery
    try {
      const call = await this.prisma.call.findUnique({ where: { id: input.callId } });
      if (!call) {
        this.logger.warn("telephony", "dial outcome for unknown call — dropped", {
          callId: input.callId,
          parentCallSid: input.parentCallSid,
          dialCallStatus: input.dialCallStatus,
        });
        return;
      }
      if (!(await this.webhookAccountMayTouchCall(call, input.accountSid))) {
        await this.refuseForeignWebhook(eventId, call, input.accountSid, "dial outcome");
        return;
      }
      // Late SID bind: if no child-leg callback ever fired, the row has no provider
      // SID yet — bind the child SID so reconciliation can find it at Twilio.
      if (!call.providerCallId && input.dialCallSid) {
        await this.prisma.call.update({
          where: { id: call.id },
          data: { providerCallId: input.dialCallSid },
        });
      }
      const target = mapDialCallStatus(input.dialCallStatus);
      if (!target) return; // completed/answered — the child-leg callbacks own the happy path.
      if (!canTransitionCall(call.status, target)) return; // child leg already reported.
      await this.applyCallStatus(call, target, {
        callSid: input.dialCallSid ?? input.parentCallSid,
        errorMessage: `Dial ended without connecting (${input.dialCallStatus})`,
      }, "dial-action");
    } catch (err) {
      await this.webhookEvents.release(VOICE_PROVIDER, eventId);
      throw err;
    }
  }

  /**
   * Sweep calls stuck in a non-terminal status (missed/undeliverable webhooks —
   * dev tunnels dying mid-call is the classic): after a grace period, ask Twilio
   * for the call's real status and apply it through the same FSM path; rows the
   * provider can't account for are failed after a hard cap so the log never shows
   * a call "ringing" for days. Runs from the Vercel cron (see calls.controller).
   */
  async reconcileStaleCalls(): Promise<{ checked: number; updated: number; abandoned: number }> {
    const now = Date.now();
    const graceCutoff = new Date(now - 10 * 60 * 1000); // webhooks get 10 minutes
    const abandonCutoff = new Date(now - 60 * 60 * 1000); // no SID after an hour → dead
    const hardCapCutoff = new Date(now - 24 * 60 * 60 * 1000); // nothing lives a day

    const stale = await this.prisma.call.findMany({
      where: { status: { in: [...LIVE_STATUSES] }, createdAt: { lt: graceCutoff } },
      orderBy: { createdAt: "asc" },
      take: 50,
    });

    let updated = 0;
    let abandoned = 0;
    for (const call of stale) {
      try {
        if (call.providerCallId) {
          const remote = await this.twilio.fetchCall(call.providerCallId);
          if (remote) {
            const target = mapTwilioCallStatus(remote.status);
            // No target (still queued/live at Twilio) or an illegal hop → leave it;
            // the next sweep re-checks.
            if (target && canTransitionCall(call.status, target)) {
              await this.applyCallStatus(call, target, {
                callSid: call.providerCallId,
                durationSeconds: remote.durationSeconds,
                priceCents: remote.priceCents,
                currency: remote.currency,
                startedAt: remote.startedAt,
                endedAt: remote.endedAt,
                errorMessage:
                  target !== CallStatus.COMPLETED
                    ? `Recovered by reconciliation (provider status: ${remote.status})`
                    : undefined,
              }, "reconcile");
              updated += 1;
            }
          } else if (call.createdAt < hardCapCutoff) {
            // Unfetchable (404 — e.g. a subaccount-owned SID the platform creds can't
            // read): don't guess early; fail it only past the hard cap.
            await this.failStaleCall(call, "No provider updates for 24h — failed by reconciliation");
            abandoned += 1;
          }
        } else if (call.createdAt < abandonCutoff) {
          // Never got a provider SID: the webhook that binds it never arrived.
          await this.failStaleCall(call, "No status callback received — failed by reconciliation");
          abandoned += 1;
        }
      } catch (err) {
        // One bad row must not stall the sweep.
        this.logger.error("telephony", "reconcile failed for call", undefined, {
          callId: call.id,
          providerCallId: call.providerCallId,
          error: String(err),
        });
      }
    }
    if (stale.length > 0) {
      this.logger.log("telephony", "reconciled stale calls", {
        checked: stale.length,
        updated,
        abandoned,
      });
    }
    return { checked: stale.length, updated, abandoned };
  }

  /** Terminal FAILED for a call reconciliation gave up on (guarded by the FSM). */
  private async failStaleCall(call: Call, reason: string): Promise<void> {
    if (!canTransitionCall(call.status, CallStatus.FAILED)) return;
    await this.applyCallStatus(call, CallStatus.FAILED, { errorMessage: reason }, "reconcile");
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
   * claim, keyed per status (`callSid:recording:<status>`) so a failed/absent
   * report can never burn the claim a later `completed` needs; release on throw
   * so a retry reprocesses.
   */
  async processRecordingCallback(
    cb: { callSid: string; recordingUrl?: string; recordingStatus?: string; accountSid?: string },
    callId?: string,
  ): Promise<void> {
    // Only a completed recording has audio to bind. failed/absent are worth a log —
    // a recorded call whose audio never materialised is an answer to "where's the
    // recording?", not a silent nothing. (No status = older config; treat as completed.)
    const status = cb.recordingStatus || "completed";
    if (status !== "completed") {
      this.logger.warn("telephony", "recording did not complete", {
        providerCallId: cb.callSid,
        recordingStatus: status,
        callIdParam: callId ?? null,
      });
      return;
    }
    if (!cb.recordingUrl) return;
    const eventId = `${cb.callSid}:recording:${status}`;
    if (!(await this.webhookEvents.claim(VOICE_PROVIDER, eventId))) return; // duplicate delivery
    try {
      const call = callId
        ? await this.prisma.call.findUnique({ where: { id: callId } })
        : await this.prisma.call.findUnique({ where: { providerCallId: cb.callSid } });
      if (!call) {
        this.logger.warn("telephony", "recording callback for unknown call — dropped", {
          providerCallId: cb.callSid,
          callIdParam: callId ?? null,
        });
        return;
      }
      if (!(await this.webhookAccountMayTouchCall(call, cb.accountSid))) {
        await this.refuseForeignWebhook(eventId, call, cb.accountSid, "recording callback");
        return;
      }
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
