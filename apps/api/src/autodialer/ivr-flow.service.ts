import { Inject, Injectable, NotFoundException, Optional } from "@nestjs/common";
import { ConfigService } from "@nestjs/config";
import Twilio from "twilio";
import { EVENT_TYPES } from "@uprise/events";
import type {
  DialerAnswer,
  DialerAttempt,
  DialerCallSession,
  DialerCampaign,
  DialerQuestion,
} from "@uprise/db";
import { CallStatus, MessageChannel, ConsentState, Prisma } from "@uprise/db";
import { PrismaService } from "../prisma/prisma.service";
import { OutboxService } from "../common/outbox/outbox.service";
import { DomainLogger } from "../common/logging/domain-logger.service";
import { WebhookEventService } from "../common/webhooks/webhook-event.service";
import { DISPATCH_QUEUE_TOKEN } from "../common/queue/queue.tokens";
import type { DispatchQueue } from "../common/queue/dispatch-queue";
import {
  QUEUE_JOB_TYPES,
  QUEUE_NAMES,
  getDialerPlaceTargetJobId,
} from "../common/queue/queue.constants";
import type { DialerPlaceTargetJobPayload } from "../common/queue/queue.payloads";
import {
  TRANSACTIONAL_DISPATCHER,
  type TransactionalDispatcher,
} from "../messaging/transactional-dispatcher";
import { SessionProgressService } from "./session-progress.service";
import { parsePrompt, resolveAudioUrl, type DialerPrompt } from "./audio-prompt.util";
import { isValidAuTargetNumber } from "./autodialer.service";
import { ElectoralLookupService, type ElectorateOption } from "./electoral-lookup.service";

/**
 * The IVR flow engine — the port of the source's ivr/target.ts + ivr/survey.ts
 * + ivr/redirect.ts phone-leg behaviour onto uprise conventions.
 *
 * Invariants this file holds:
 * - Every handler returns valid TwiML for EVERY retry — writes are idempotent
 *   (upserts / keyed inserts), never claim-and-drop, because Twilio retries a
 *   webhook whose response it did not get, and the caller is still on the line.
 * - State writes that matter emit their domain event via the outbox in the
 *   SAME transaction.
 * - No provider HTTP inside a transaction — the SMS answer type dispatches
 *   after commit.
 * - Gather/Redirect URLs carry OUR ids only (campaignId / attemptId /
 *   sessionId / callId / q) — never tenant identifiers, tokens or target
 *   numbers chosen server-side later.
 */

/** The IVR context a handler operates in, resolved from query ids. */
export type IvrContext = {
  campaign: DialerCampaign;
  attempt: DialerAttempt | null;
  session: DialerCallSession | null;
  /** telephony.Call id when resolvable (attempt.callId / session.callId). */
  callId: string | null;
  language: string;
};

const MACHINE_ANSWERED_BY = /^(machine|fax)/i;

/** Default spoken strings — overridable per campaign via its prompt Json. */
const SPOKEN = {
  optOutInstruction: "To stop receiving calls from this campaign, press star at any time.",
  optOutConfirmation:
    "You have been removed from this campaign's calling list. Sorry to have bothered you. Goodbye.",
  noInput: "Sorry, I didn't hear your response.",
  invalidTarget: "Sorry, we are unable to connect your call right now. Goodbye.",
  postcodePrompt: "Using your keypad, please enter your four digit postcode so we can find your local member.",
  postcodeInvalid: "Sorry, that doesn't look like an Australian postcode.",
  noElectorate: "Sorry, we couldn't find an electorate for that postcode.",
  noTargetNumber: "Sorry, we don't have a number for your local member right now.",
  multiElectorate: "Your postcode covers more than one electorate.",
  unsure: "If you are not sure, press 0.",
} as const;

@Injectable()
export class IvrFlowService {
  private readonly outbox: Pick<OutboxService, "append">;
  private readonly dispatcher: TransactionalDispatcher | null;
  private readonly electoral: ElectoralLookupService | null;
  private readonly queue: DispatchQueue | null;
  private readonly webhookEvents: Pick<WebhookEventService, "claim" | "release"> | null;

  constructor(
    private readonly prisma: PrismaService,
    private readonly progress: SessionProgressService,
    private readonly config: ConfigService,
    private readonly logger: DomainLogger,
    @Optional() outbox?: OutboxService,
    @Optional() @Inject(TRANSACTIONAL_DISPATCHER) dispatcher?: TransactionalDispatcher,
    @Optional() electoral?: ElectoralLookupService,
    @Optional() @Inject(DISPATCH_QUEUE_TOKEN) queue?: DispatchQueue,
    @Optional() webhookEvents?: WebhookEventService,
  ) {
    // Optional-with-fallback tail params (the blasts pattern) so unit specs can
    // construct positionally; DI supplies the real services in production.
    this.outbox = outbox ?? { append: async () => {} };
    this.dispatcher = dispatcher ?? null;
    this.electoral = electoral ?? null;
    this.queue = queue ?? null;
    this.webhookEvents = webhookEvents ?? null;
  }

  /* ------------------------------------------------------------ context */

  async loadContext(query: {
    campaignId?: string;
    attemptId?: string;
    sessionId?: string;
  }): Promise<IvrContext> {
    const attempt = query.attemptId
      ? await this.prisma.dialerAttempt.findUnique({ where: { id: query.attemptId } })
      : null;
    const session = query.sessionId
      ? await this.prisma.dialerCallSession.findUnique({ where: { id: query.sessionId } })
      : null;
    const campaignId = query.campaignId ?? attempt?.campaignId ?? session?.campaignId;
    const campaign = campaignId
      ? await this.prisma.dialerCampaign.findUnique({ where: { id: campaignId } })
      : null;
    if (!campaign) throw new NotFoundException("Campaign not found");
    // Tenant coherence — a leg may only ride the campaign it belongs to.
    if (attempt && (attempt.campaignId !== campaign.id || attempt.tenantId !== campaign.tenantId)) {
      throw new NotFoundException("Attempt does not belong to this campaign");
    }
    if (session && (session.campaignId !== campaign.id || session.tenantId !== campaign.tenantId)) {
      throw new NotFoundException("Session does not belong to this campaign");
    }
    return {
      campaign,
      attempt,
      session,
      callId: attempt?.callId ?? session?.callId ?? null,
      language: attempt?.language ?? session?.language ?? campaign.defaultLanguage,
    };
  }

  /* ------------------------------------------------------------ URL + prompt helpers */

  private baseUrl(): string {
    return this.config.get<string>("API_BASE_URL", "").trim().replace(/\/+$/, "");
  }

  /** Build an /autodialer/ivr/* action URL carrying ids only. */
  ivrUrl(path: string, params: Record<string, string | undefined>): string {
    const qs = new URLSearchParams();
    for (const [key, value] of Object.entries(params)) {
      if (value) qs.set(key, value);
    }
    const query = qs.toString();
    return `${this.baseUrl()}/api/v1/autodialer/ivr/${path}${query ? `?${query}` : ""}`;
  }

  /** One query for every StoredFile url a campaign's prompts may reference. */
  private async promptUrls(campaign: DialerCampaign, questions: DialerQuestion[]): Promise<Map<string, string>> {
    const ids = new Set<string>();
    const collect = (raw: unknown) => {
      const prompt = parsePrompt(raw);
      if (!prompt?.audio) return;
      if (typeof prompt.audio === "string") ids.add(prompt.audio);
      else Object.values(prompt.audio).forEach((id) => typeof id === "string" && id && ids.add(id));
    };
    collect(campaign.intro);
    collect(campaign.outro);
    collect(campaign.optOut);
    questions.forEach((q) => collect(q.audioPrompt));
    if (ids.size === 0) return new Map();
    const files = await this.prisma.storedFile.findMany({
      where: { id: { in: [...ids] }, tenantId: campaign.tenantId },
      select: { id: true, url: true },
    });
    return new Map(files.map((f) => [f.id, f.url]));
  }

  /** <Play> the resolved audio, else <Say> the prompt's text (if any). */
  private sayOrPlay(
    node: { play: (url: string) => unknown; say: (text: string) => unknown },
    raw: unknown,
    language: string,
    urls: ReadonlyMap<string, string>,
  ): void {
    const prompt = parsePrompt(raw);
    if (!prompt) return;
    const url = resolveAudioUrl(prompt, language, urls);
    if (url) node.play(url);
    else if (prompt.name) node.say(prompt.name);
  }

  /* ------------------------------------------------------------ answer */

  /**
   * The Voice URL for every autodialer leg. Routes on the campaign's behaviour
   * matrix exactly as the source's /answer did (autodialer/ivr/target.ts:274+).
   */
  async handleAnswer(
    ctx: IvrContext,
    body: { CallSid?: string; AnsweredBy?: string },
  ): Promise<string> {
    const vr = new Twilio.twiml.VoiceResponse();
    const { campaign, attempt, session } = ctx;

    // AMD verdict — a machine gets a hangup, and the attempt stays retryable
    // under the attempt cap. Never applies to widget sessions (no AMD there).
    const answeredBy = (body.AnsweredBy ?? "").trim();
    if (answeredBy && attempt) {
      const machine = MACHINE_ANSWERED_BY.test(answeredBy);
      await this.recordAnsweredBy(ctx, body.CallSid, answeredBy, machine);
      if (machine) {
        vr.hangup();
        return vr.toString();
      }
    }

    await this.progress.publish(session?.id, campaign.tenantId, "call_connected", {});

    // Transparent transfer: no intro, no IVR — straight to the bridge.
    if (campaign.transparentTargetTransfer) {
      vr.redirect(this.ivrUrl("redirect", this.idParams(ctx)));
      return vr.toString();
    }

    const questions = campaign.survey
      ? await this.prisma.dialerQuestion.findMany({
          where: { campaignId: campaign.id },
          orderBy: { orderIndex: "asc" },
        })
      : [];
    const urls = await this.promptUrls(campaign, questions);

    if (campaign.survey) {
      // Intro (if any), then into the graph at its first question.
      this.sayOrPlay(vr, campaign.intro, ctx.language, urls);
      if (questions.length === 0) {
        // A survey campaign with no graph must still answer politely — the
        // preflight blocks activation, but a live retry may race an edit.
        vr.hangup();
        return vr.toString();
      }
      vr.redirect(this.ivrUrl("survey", { ...this.idParams(ctx), q: questions[0].key }));
      return vr.toString();
    }

    if (campaign.electoralTarget) {
      this.sayOrPlay(vr, campaign.intro, ctx.language, urls);
      vr.redirect(this.ivrUrl("electoral-postcode", this.idParams(ctx)));
      return vr.toString();
    }

    // Broadcast: the whole intro plays inside a <Gather> listening for the
    // opt-out star (source ivr/target.ts:299–319), then the outro, then done.
    const gather = vr.gather({
      numDigits: 1,
      timeout: 1,
      actionOnEmptyResult: false,
      finishOnKey: "",
      input: ["dtmf"],
      action: this.ivrUrl("survey-result", { ...this.idParams(ctx), q: "__broadcast__" }),
    });
    this.sayOrPlay(gather, campaign.intro, ctx.language, urls);
    if (this.includeOptOut(ctx)) gather.say(this.optOutInstruction(campaign));
    this.sayOrPlay(vr, campaign.outro, ctx.language, urls);
    vr.hangup();
    return vr.toString();
  }

  /* ------------------------------------------------------------ survey */

  /** Render question `q` as a <Gather> (source ivr/survey.ts:16–263). */
  async renderSurveyQuestion(ctx: IvrContext, questionKey: string): Promise<string> {
    const vr = new Twilio.twiml.VoiceResponse();
    const { campaign } = ctx;
    const question = await this.prisma.dialerQuestion.findUnique({
      where: { campaignId_key: { campaignId: campaign.id, key: questionKey } },
      include: { answers: true },
    });
    if (!question) {
      vr.hangup();
      return vr.toString();
    }
    const urls = await this.promptUrls(campaign, [question]);
    const digits = question.answers.map((a) => a.digit).sort();
    const optOut = this.includeOptOut(ctx);

    await this.progress.publish(ctx.session?.id, campaign.tenantId, "call_survey", {
      question: question.name,
      options: question.answers
        .slice()
        .sort((a, b) => a.digit.localeCompare(b.digit))
        .map((a) => ({ digit: a.digit, label: a.value })),
    });

    const gather = vr.gather({
      numDigits: 1,
      timeout: 10,
      actionOnEmptyResult: true,
      input: ["dtmf"],
      action: this.ivrUrl("survey-result", { ...this.idParams(ctx), q: question.key }),
    });
    const prompt = parsePrompt(question.audioPrompt);
    const url = prompt ? resolveAudioUrl(prompt, ctx.language, urls) : null;
    if (url) {
      gather.play(url);
    } else {
      gather.say(question.name);
      for (const answer of question.answers.slice().sort((a, b) => a.digit.localeCompare(b.digit))) {
        gather.say(`Press ${answer.digit} for ${answer.value}.`);
      }
    }
    if (optOut) gather.say(this.optOutInstruction(campaign));
    void digits;
    // No input after retries: Twilio posts an empty Digits to the action URL
    // (actionOnEmptyResult), which re-renders with a spoken reminder.
    return vr.toString();
  }

  /**
   * Process a survey answer (source ivr/survey.ts:358–745): record it, run the
   * answer's type, then follow nextKey.
   */
  async handleSurveyResult(
    ctx: IvrContext,
    questionKey: string,
    body: { Digits?: string; CallSid?: string },
  ): Promise<string> {
    const vr = new Twilio.twiml.VoiceResponse();
    const { campaign } = ctx;
    const digits = (body.Digits ?? "").trim();

    // The broadcast pseudo-question exists only to catch the opt-out star.
    if (questionKey === "__broadcast__") {
      if (digits === "*") return this.handleOptOut(ctx, body);
      const urls = await this.promptUrls(campaign, []);
      this.sayOrPlay(vr, campaign.outro, ctx.language, urls);
      vr.hangup();
      return vr.toString();
    }

    if (digits === "*") return this.handleOptOut(ctx, body);

    if (!digits) {
      vr.say(SPOKEN.noInput);
      vr.redirect(this.ivrUrl("survey", { ...this.idParams(ctx), q: questionKey }));
      return vr.toString();
    }

    const question = await this.prisma.dialerQuestion.findUnique({
      where: { campaignId_key: { campaignId: campaign.id, key: questionKey } },
      include: { answers: true },
    });
    if (!question) {
      vr.hangup();
      return vr.toString();
    }
    const answer = question.answers.find((a) => a.digit === digits);
    if (!answer) {
      // Unknown digit: re-ask, exactly like no input — the caller mis-keyed.
      vr.say(SPOKEN.noInput);
      vr.redirect(this.ivrUrl("survey", { ...this.idParams(ctx), q: questionKey }));
      return vr.toString();
    }

    const callId = ctx.callId ?? (await this.resolveCallId(body.CallSid));
    if (callId) {
      await this.recordSurveyResult(ctx, question, answer, callId);
    } else {
      this.logger.warn("autodialer", "survey answer with no resolvable call — recorded nothing", {
        campaignId: campaign.id,
        questionKey,
      });
    }

    await this.progress.publish(ctx.session?.id, campaign.tenantId, "call_survey_result", {
      questionKey,
      digit: answer.digit,
      value: answer.value,
    });

    // Answer-type side effects (source ivr/survey.ts:614–692).
    const followUp = await this.applyAnswerType(ctx, answer);
    if (followUp) return followUp;

    // Then the graph edge.
    if (answer.nextKey === "outro") {
      const urls = await this.promptUrls(campaign, []);
      this.sayOrPlay(vr, campaign.outro, ctx.language, urls);
      vr.hangup();
      return vr.toString();
    }
    if (answer.nextKey) {
      vr.redirect(this.ivrUrl("survey", { ...this.idParams(ctx), q: answer.nextKey }));
      return vr.toString();
    }
    vr.hangup();
    return vr.toString();
  }

  /* ------------------------------------------------------------ redirect (transfer) */

  /**
   * Patch the caller through to a target (source ivr/redirect.ts). PSTN legs
   * bridge with a plain <Dial>; widget sessions take the conference topology:
   * the caller joins the room first (start=true, end-on-exit=true) while the
   * target leg is QUEUED for the worker — the source placed it from a
   * post-response setTimeout in a serverless handler, which frequently never
   * fired; a BullMQ job with a deterministic id cannot be lost or doubled.
   */
  async handleRedirect(
    ctx: IvrContext,
    body: { CallSid?: string },
    query: { target_number?: string; data?: string },
  ): Promise<string> {
    const vr = new Twilio.twiml.VoiceResponse();
    const { campaign, attempt, session } = ctx;

    if (session || attempt?.kind === "WEBRTC") {
      if (!session) {
        // A WEBRTC attempt without a session has no conference to join.
        vr.say(SPOKEN.invalidTarget);
        vr.hangup();
        return vr.toString();
      }
      // Electoral routing persists the member on the session; fixed-target
      // campaigns resolve here (query override validated like the PSTN path).
      const target = session.targetNumber ?? this.resolveTargetNumber(campaign, query.target_number);
      if (!target) {
        this.logger.warn("autodialer", "session redirect with no target number", {
          campaignId: campaign.id,
          sessionId: session.id,
        });
        vr.say(SPOKEN.invalidTarget);
        vr.hangup();
        return vr.toString();
      }
      if (!session.targetNumber) {
        await this.prisma.dialerCallSession.update({
          where: { id: session.id },
          data: { targetNumber: target },
        });
        ctx.session = { ...session, targetNumber: target };
      }

      const callId = ctx.callId ?? (await this.resolveCallId(body.CallSid));
      await this.recordTransfer(ctx, target, callId, query.data, {
        targetName: session.targetName,
        targetParty: session.targetParty,
        electorate: session.targetElectorate,
      });

      // The worker dials the target once the caller is in the room.
      const payload: DialerPlaceTargetJobPayload = {
        sessionId: session.id,
        tenantId: campaign.tenantId,
      };
      await this.queue?.enqueue({
        id: getDialerPlaceTargetJobId(session.id),
        queue: QUEUE_NAMES.DIALER_CALL,
        type: QUEUE_JOB_TYPES.DIALER_PLACE_TARGET,
        payload,
        runAt: new Date(Date.now() + 1000),
        removeOnComplete: true,
      });

      await this.progress.publish(session.id, campaign.tenantId, "call_redirecting", {
        message: session.targetName ? `Connecting you to ${session.targetName}.` : "Connecting you now.",
        name: session.targetName ?? undefined,
      });

      // Caller creates the conference and owns its lifetime; the status
      // callback rides the room so target join/leave and the end all report.
      const dial = vr.dial();
      dial.conference(
        {
          startConferenceOnEnter: true,
          endConferenceOnExit: true,
          statusCallback: this.ivrUrl("conference-status", {
            campaignId: campaign.id,
            sessionId: session.id,
          }),
          statusCallbackMethod: "POST",
          statusCallbackEvent: ["join", "leave", "end"],
          ...this.conferenceWaitOptions(),
        },
        session.conferenceName ?? `dialer-${session.id}`,
      );
      return vr.toString();
    }

    const target = this.resolveTargetNumber(campaign, query.target_number);
    if (!target) {
      this.logger.warn("autodialer", "redirect with no valid target number", {
        campaignId: campaign.id,
        queryTarget: query.target_number ?? null,
      });
      vr.say(SPOKEN.invalidTarget);
      vr.hangup();
      return vr.toString();
    }

    const callId = ctx.callId ?? (await this.resolveCallId(body.CallSid));
    await this.recordTransfer(ctx, target, callId, query.data);
    // No widget session on this branch (the guard above returned for those).
    await this.progress.publish(null, campaign.tenantId, "call_redirecting", {
      message: "Connecting you now.",
    });

    vr.dial(target);
    return vr.toString();
  }

  /** Query override (electoral routing) → campaign.targetNumbers sample. */
  resolveTargetNumber(campaign: DialerCampaign, queryTarget?: string): string | null {
    const fromQuery = (queryTarget ?? "").trim();
    if (fromQuery && isValidAuTargetNumber(fromQuery)) return fromQuery;
    const configured = Array.isArray(campaign.targetNumbers)
      ? (campaign.targetNumbers as unknown[]).filter(
          (n): n is string => typeof n === "string" && isValidAuTargetNumber(n),
        )
      : [];
    if (configured.length === 0) return null;
    return configured[Math.floor(Math.random() * configured.length)];
  }

  /* ------------------------------------------------------------ session (widget) legs */

  /**
   * The dialler TwiML app's voice handler — a widget caller's Voice-SDK
   * connect lands here with the SIGNED client identity (`s{sessionId}.t{tenantId}`)
   * as From. Binds the caller leg as a telephony.Call, marks the session
   * CONNECTED, then routes into the same behaviour matrix as a phone leg
   * (the DTMF-mirror UX: web and PSTN traverse ONE IVR).
   */
  async handleSessionAnswer(ctx: IvrContext, body: { CallSid?: string; From?: string }): Promise<string> {
    const vr = new Twilio.twiml.VoiceResponse();
    const { campaign, session } = ctx;
    const callSid = (body.CallSid ?? "").trim();
    if (!session || !callSid) {
      vr.say(SPOKEN.invalidTarget);
      vr.hangup();
      return vr.toString();
    }
    const now = new Date();
    const dead =
      session.status === "ENDED" ||
      session.status === "FAILED" ||
      session.status === "EXPIRED" ||
      (session.expiresAt && session.expiresAt.getTime() < now.getTime());
    if (dead) {
      vr.say("Sorry, this calling session has expired. Please start again from the page.");
      vr.hangup();
      return vr.toString();
    }

    // Idempotent bind: a retried TwiML fetch reuses the existing Call row.
    let call = await this.prisma.call.findUnique({ where: { providerCallId: callSid } });
    if (!call) {
      call = await this.prisma.$transaction(async (tx) => {
        const created = await tx.call.create({
          data: {
            tenantId: campaign.tenantId,
            contactId: null,
            toNumber: session.conferenceName ?? `dialer-${session.id}`,
            fromNumber: `client:s${session.id}`,
            providerCallId: callSid,
            status: CallStatus.IN_PROGRESS,
            startedAt: now,
          },
        });
        await tx.dialerCallSession.update({
          where: { id: session.id },
          data: { callId: created.id, status: "CONNECTED" },
        });
        await this.outbox.append(tx, {
          tenantId: campaign.tenantId,
          eventType: EVENT_TYPES.CALL_INITIATED,
          aggregateId: created.id,
          payload: { callId: created.id, tenantId: campaign.tenantId, toNumber: created.toNumber },
        });
        return created;
      });
      await this.progress.publish(session.id, campaign.tenantId, "call_started", {});
    } else if (!session.callId) {
      await this.prisma.dialerCallSession.update({
        where: { id: session.id },
        data: { callId: call.id, status: "CONNECTED" },
      });
    }

    ctx.session = { ...session, callId: call.id, status: "CONNECTED" };
    ctx.callId = call.id;
    return this.handleAnswer(ctx, body);
  }

  /** TwiML for the target leg: join the room without owning it (false/false). */
  async renderConferenceJoin(ctx: IvrContext): Promise<string> {
    const vr = new Twilio.twiml.VoiceResponse();
    const { session } = ctx;
    // Only join a live session's room — answering into a dead session would
    // spin up a fresh empty conference and strand the target on hold music.
    if (!session || (session.status !== "CONNECTED" && session.status !== "BRIDGED")) {
      vr.hangup();
      return vr.toString();
    }
    const dial = vr.dial();
    dial.conference(
      { startConferenceOnEnter: false, endConferenceOnExit: false },
      session.conferenceName ?? `dialer-${session.id}`,
    );
    return vr.toString();
  }

  /**
   * Conference status callback (join / leave / end), claim-guarded like the
   * non-TwiML webhooks. Target join → BRIDGED + call_connected_conference;
   * target leave → call_target_hangup; conference end → session ENDED (CAS —
   * the telephony mirror may already have folded the caller leg's terminal).
   */
  async handleConferenceStatus(
    ctx: IvrContext,
    body: { StatusCallbackEvent?: string; CallSid?: string; ConferenceSid?: string },
  ): Promise<void> {
    const { campaign, session } = ctx;
    if (!session) return;
    const event = (body.StatusCallbackEvent ?? "").trim();
    if (!event) return;
    const eventId = `dialer-conf-${body.ConferenceSid ?? session.id}-${event}-${body.CallSid ?? "conference"}`;
    if (this.webhookEvents && !(await this.webhookEvents.claim("twilio", eventId))) return;
    try {
      if (event === "participant-join" || event === "participant-leave") {
        const legCallId = await this.resolveCallId(body.CallSid);
        const isTarget = !!legCallId && session.targetCallId === legCallId;
        if (!isTarget) return;
        if (event === "participant-join") {
          await this.prisma.dialerCallSession.updateMany({
            where: { id: session.id, status: "CONNECTED" },
            data: { status: "BRIDGED" },
          });
          await this.progress.publish(session.id, campaign.tenantId, "call_connected_conference", {
            name: session.targetName ?? undefined,
          });
        } else {
          await this.progress.publish(session.id, campaign.tenantId, "call_target_hangup", {});
        }
        return;
      }
      if (event === "conference-end") {
        const endedAt = new Date();
        let ended = false;
        await this.prisma.$transaction(async (tx) => {
          const updated = await tx.dialerCallSession.updateMany({
            where: { id: session.id, status: { notIn: ["ENDED", "FAILED"] } },
            data: { status: "ENDED", endedAt },
          });
          ended = updated.count > 0;
          if (!ended) return;
          await this.outbox.append(tx, {
            tenantId: campaign.tenantId,
            eventType: EVENT_TYPES.DIALER_SESSION_ENDED,
            aggregateId: session.id,
            payload: {
              sessionId: session.id,
              tenantId: campaign.tenantId,
              campaignId: campaign.id,
              status: "ENDED",
              durationSeconds: Math.max(
                0,
                Math.round((endedAt.getTime() - session.createdAt.getTime()) / 1000),
              ),
            },
          });
        });
        if (ended) {
          await this.progress.publish(session.id, campaign.tenantId, "call_ended", {
            reason: "conference_end",
          });
        }
      }
    } catch (error) {
      if (this.webhookEvents) await this.webhookEvents.release("twilio", eventId);
      throw error;
    }
  }

  /** Optional hold-audio override while the caller waits alone in the room. */
  private conferenceWaitOptions(): { waitUrl?: string } {
    const waitUrl = this.config.get<string>("DIALER_CONFERENCE_WAIT_URL", "").trim();
    return waitUrl ? { waitUrl } : {};
  }

  /* ------------------------------------------------------------ electoral */

  /**
   * Electoral entry: gather the caller's postcode. Selection state persists on
   * the attempt/session row — the Gather action URL carries ids only.
   */
  async renderElectoralPostcode(ctx: IvrContext): Promise<string> {
    const vr = new Twilio.twiml.VoiceResponse();
    await this.progress.publish(ctx.session?.id, ctx.campaign.tenantId, "call_electoral_postcode", {});
    const gather = vr.gather({
      numDigits: 4,
      timeout: 10,
      actionOnEmptyResult: true,
      input: ["dtmf"],
      action: this.ivrUrl("electoral-lookup", this.idParams(ctx)),
    });
    gather.say(SPOKEN.postcodePrompt);
    if (this.includeOptOut(ctx)) gather.say(this.optOutInstruction(ctx.campaign));
    return vr.toString();
  }

  /**
   * Postcode entered: resolve electorate(s) on our own civic data (source
   * called an external lookup API here). One electorate connects straight
   * through; several render a disambiguation menu; none falls back gracefully.
   */
  async handleElectoralLookup(
    ctx: IvrContext,
    body: { Digits?: string; CallSid?: string },
  ): Promise<string> {
    const vr = new Twilio.twiml.VoiceResponse();
    const { campaign } = ctx;
    const digits = (body.Digits ?? "").trim();
    if (digits === "*") return this.handleOptOut(ctx, body);
    if (!digits) {
      vr.say(SPOKEN.noInput);
      vr.redirect(this.ivrUrl("electoral-postcode", this.idParams(ctx)));
      return vr.toString();
    }
    if (!/^\d{4}$/.test(digits) || !this.electoral) {
      vr.say(SPOKEN.postcodeInvalid);
      vr.redirect(this.ivrUrl("electoral-postcode", this.idParams(ctx)));
      return vr.toString();
    }

    await this.persistPostcode(ctx, digits);

    // Upper-house targeting needs no district menu — the postcode's state is
    // enough (federal Senate); state upper houses resolve to the fallback.
    if (campaign.officeTarget === "upper") {
      return this.connectElectoral(ctx, body, digits, undefined);
    }

    const options = await this.electoral.lookupPostcode(digits, campaign.jurisdiction);
    await this.progress.publish(ctx.session?.id, campaign.tenantId, "call_electoral_lookup", {
      postcode: digits,
      electorates: options.map((o) => o.name),
    });

    if (options.length === 0) {
      vr.say(SPOKEN.noElectorate);
      return this.electoralFallback(ctx, body, vr);
    }
    if (options.length === 1) {
      return this.connectElectoral(ctx, body, digits, options[0]);
    }

    // Disambiguation menu, dominant electorate first; 0 (or anything else)
    // falls back to the first. Digits 1–9 bound the menu.
    const menu = options.slice(0, 9);
    const gather = vr.gather({
      numDigits: 1,
      timeout: 10,
      actionOnEmptyResult: true,
      input: ["dtmf"],
      action: this.ivrUrl("select-electorate", this.idParams(ctx)),
    });
    gather.say(SPOKEN.multiElectorate);
    menu.forEach((option, index) => {
      gather.say(`For ${option.name}, press ${index + 1}.`);
    });
    gather.say(SPOKEN.unsure);
    return vr.toString();
  }

  /**
   * Disambiguation choice. The postcode is re-read from the attempt/session
   * row and the menu re-derived — 0, no input and invalid digits all take the
   * dominant electorate (the source's "unsure → first" port).
   */
  async handleSelectElectorate(
    ctx: IvrContext,
    body: { Digits?: string; CallSid?: string },
  ): Promise<string> {
    const vr = new Twilio.twiml.VoiceResponse();
    const { campaign } = ctx;
    const digits = (body.Digits ?? "").trim();
    if (digits === "*") return this.handleOptOut(ctx, body);

    const postcode = ctx.attempt?.postcode ?? ctx.session?.postcode ?? null;
    if (!postcode || !this.electoral) {
      // Selection state lost (e.g. context re-created) — re-ask.
      vr.redirect(this.ivrUrl("electoral-postcode", this.idParams(ctx)));
      return vr.toString();
    }

    const options = await this.electoral.lookupPostcode(postcode, campaign.jurisdiction);
    if (options.length === 0) {
      vr.say(SPOKEN.noElectorate);
      return this.electoralFallback(ctx, body, vr);
    }
    const index = Number.parseInt(digits, 10);
    const choice = Number.isInteger(index) && index >= 1 && index <= options.length ? options[index - 1] : options[0];
    await this.progress.publish(ctx.session?.id, campaign.tenantId, "call_select_electorate", {
      electorate: choice.name,
    });
    return this.connectElectoral(ctx, body, postcode, choice);
  }

  /** Resolve the member and patch the caller through (or degrade gracefully). */
  private async connectElectoral(
    ctx: IvrContext,
    body: { CallSid?: string },
    postcode: string,
    electorate: ElectorateOption | undefined,
  ): Promise<string> {
    const vr = new Twilio.twiml.VoiceResponse();
    const { campaign, session, attempt } = ctx;
    const target = this.electoral
      ? await this.electoral.resolveTarget(campaign, { postcode, electorate })
      : null;
    if (!target) {
      vr.say(SPOKEN.noTargetNumber);
      return this.electoralFallback(ctx, body, vr);
    }

    if (session || attempt?.kind === "WEBRTC") {
      if (!session) {
        vr.say(SPOKEN.invalidTarget);
        vr.hangup();
        return vr.toString();
      }
      // Persist the resolved member on the session, then ride the shared
      // bridge: /redirect reads session.targetNumber and runs the conference.
      const updated = await this.prisma.dialerCallSession.update({
        where: { id: session.id },
        data: {
          targetNumber: target.number,
          targetName: target.name,
          targetParty: target.party,
          targetElectorate: target.electorate,
          postcode,
        },
      });
      ctx.session = updated;
      await this.progress.publish(session.id, campaign.tenantId, "call_electoral_target", {
        name: target.name,
        party: target.party,
        electorate: target.electorate,
      });
      vr.say(`Connecting you to ${target.name}. Please hold.`);
      vr.redirect(this.ivrUrl("redirect", this.idParams(ctx)));
      return vr.toString();
    }

    const callId = ctx.callId ?? (await this.resolveCallId(body.CallSid));
    await this.recordTransfer(ctx, target.number, callId, undefined, {
      targetName: target.name,
      targetParty: target.party,
      electorate: target.electorate,
    });
    await this.progress.publish(null, campaign.tenantId, "call_redirecting", {
      message: `Connecting you to ${target.name}.`,
    });
    vr.say(`Connecting you to ${target.name}. Please hold.`);
    vr.dial(target.number);
    return vr.toString();
  }

  /**
   * No member / no number: fall back to the campaign's fixed targetNumbers
   * when configured (the source's graceful degradation), else end the call
   * politely. The apology is already on `vr`.
   */
  private async electoralFallback(
    ctx: IvrContext,
    body: { CallSid?: string },
    vr: InstanceType<typeof Twilio.twiml.VoiceResponse>,
  ): Promise<string> {
    const fallback = this.resolveTargetNumber(ctx.campaign);
    if (fallback && !ctx.session && ctx.attempt?.kind !== "WEBRTC") {
      const callId = ctx.callId ?? (await this.resolveCallId(body.CallSid));
      await this.recordTransfer(ctx, fallback, callId);
      vr.say("Connecting you now.");
      vr.dial(fallback);
      return vr.toString();
    }
    const urls = await this.promptUrls(ctx.campaign, []);
    this.sayOrPlay(vr, ctx.campaign.outro, ctx.language, urls);
    vr.hangup();
    return vr.toString();
  }

  /** Write the caller-entered postcode onto the leg's row (and the live ctx). */
  private async persistPostcode(ctx: IvrContext, postcode: string): Promise<void> {
    if (ctx.attempt) {
      await this.prisma.dialerAttempt.update({
        where: { id: ctx.attempt.id },
        data: { postcode },
      });
      ctx.attempt = { ...ctx.attempt, postcode };
    }
    if (ctx.session) {
      await this.prisma.dialerCallSession.update({
        where: { id: ctx.session.id },
        data: { postcode },
      });
      ctx.session = { ...ctx.session, postcode };
    }
  }

  /* ------------------------------------------------------------ opt-out */

  /**
   * The star press. One transaction: VOICE + SMS consent OPTED_OUT, attempt
   * outcome, outbox event — then the confirmation prompt and a hangup.
   */
  async handleOptOut(ctx: IvrContext, body: { CallSid?: string }): Promise<string> {
    const vr = new Twilio.twiml.VoiceResponse();
    const { campaign, attempt } = ctx;

    if (attempt) {
      await this.prisma.$transaction(async (tx) => {
        for (const channel of [MessageChannel.VOICE, MessageChannel.SMS]) {
          await tx.contactConsent.upsert({
            where: {
              tenantId_phoneE164_channel: {
                tenantId: campaign.tenantId,
                phoneE164: attempt.phoneE164,
                channel,
              },
            },
            create: {
              tenantId: campaign.tenantId,
              contactId: attempt.contactId,
              phoneE164: attempt.phoneE164,
              channel,
              state: ConsentState.OPTED_OUT,
              source: "ivr_star",
            },
            update: { state: ConsentState.OPTED_OUT, source: "ivr_star" },
          });
        }
        await tx.dialerAttempt.update({
          where: { id: attempt.id },
          data: { outcome: "OPTED_OUT" },
        });
        await this.outbox.append(tx, {
          tenantId: campaign.tenantId,
          eventType: EVENT_TYPES.DIALER_CONTACT_OPTED_OUT,
          aggregateId: attempt.id,
          payload: {
            tenantId: campaign.tenantId,
            campaignId: campaign.id,
            phoneE164: attempt.phoneE164,
            contactId: attempt.contactId,
            source: "ivr_star",
          },
        });
      });
    }
    void body;

    const urls = await this.promptUrls(campaign, []);
    const custom = parsePrompt(campaign.optOut);
    if (custom) this.sayOrPlay(vr, campaign.optOut, ctx.language, urls);
    else vr.say(SPOKEN.optOutConfirmation);
    vr.hangup();
    return vr.toString();
  }

  /* ------------------------------------------------------------ internals */

  private idParams(ctx: IvrContext): Record<string, string | undefined> {
    return {
      campaignId: ctx.campaign.id,
      attemptId: ctx.attempt?.id,
      sessionId: ctx.session?.id ?? undefined,
    };
  }

  /** Opt-out star is offered on outbound phone legs only (source shouldIncludeOptOut). */
  private includeOptOut(ctx: IvrContext): boolean {
    return !!ctx.attempt && ctx.attempt.kind === "PHONE";
  }

  private optOutInstruction(campaign: DialerCampaign): string {
    const prompt = parsePrompt(campaign.optOut);
    return prompt?.name ?? SPOKEN.optOutInstruction;
  }

  private async resolveCallId(callSid?: string): Promise<string | null> {
    if (!callSid) return null;
    const call = await this.prisma.call.findUnique({ where: { providerCallId: callSid } });
    return call?.id ?? null;
  }

  private async recordAnsweredBy(
    ctx: IvrContext,
    callSid: string | undefined,
    answeredBy: string,
    machine: boolean,
  ): Promise<void> {
    const callId = ctx.callId ?? (await this.resolveCallId(callSid));
    if (callId) {
      await this.prisma.call.updateMany({
        where: { id: callId, tenantId: ctx.campaign.tenantId },
        data: { answeredBy, machineDetected: machine },
      });
    }
    if (machine && ctx.attempt) {
      await this.prisma.dialerAttempt.update({
        where: { id: ctx.attempt.id },
        data: { outcome: "MACHINE" },
      });
    }
  }

  /** Upsert the answer row + emit the recorded event, one transaction. */
  private async recordSurveyResult(
    ctx: IvrContext,
    question: DialerQuestion,
    answer: DialerAnswer,
    callId: string,
  ): Promise<void> {
    const { campaign, attempt, session } = ctx;
    const contactId = attempt?.contactId ?? null;
    await this.prisma.$transaction(async (tx) => {
      await tx.dialerSurveyResult.upsert({
        where: { callId_questionKey: { callId, questionKey: question.key } },
        create: {
          tenantId: campaign.tenantId,
          campaignId: campaign.id,
          callId,
          attemptId: attempt?.id ?? null,
          sessionId: session?.id ?? null,
          contactId,
          questionKey: question.key,
          answerDigit: answer.digit,
          answerValue: answer.value,
          dispositionCode: answer.dispositionCode,
          supportLevel: answer.supportLevel,
        },
        update: {
          answerDigit: answer.digit,
          answerValue: answer.value,
          dispositionCode: answer.dispositionCode,
          supportLevel: answer.supportLevel,
        },
      });
      await this.outbox.append(tx, {
        tenantId: campaign.tenantId,
        eventType: EVENT_TYPES.DIALER_SURVEY_ANSWER_RECORDED,
        aggregateId: callId,
        payload: {
          tenantId: campaign.tenantId,
          campaignId: campaign.id,
          callId,
          contactId,
          questionKey: question.key,
          digit: answer.digit,
          value: answer.value,
          dispositionCode: answer.dispositionCode ?? null,
          supportLevel: (answer.supportLevel as string | null) ?? null,
        },
      });
    });
  }

  /** Transfer ledger row + event, one transaction. */
  private async recordTransfer(
    ctx: IvrContext,
    target: string,
    callId: string | null,
    data?: string,
    details?: { targetName?: string | null; targetParty?: string | null; electorate?: string | null },
  ): Promise<void> {
    const { campaign, attempt, session } = ctx;
    // Idempotent under TwiML retries: one ledger row per (call, target).
    if (callId) {
      const existing = await this.prisma.dialerRedirect.findFirst({
        where: { callId, targetNumber: target },
      });
      if (existing) return;
    }
    await this.prisma.$transaction(async (tx) => {
      const row = await tx.dialerRedirect.create({
        data: {
          tenantId: campaign.tenantId,
          campaignId: campaign.id,
          callId,
          sessionId: session?.id ?? null,
          contactId: attempt?.contactId ?? null,
          targetNumber: target,
          phoneNumber: attempt?.phoneE164 ?? null,
          redirectNumber: target,
          targetName: details?.targetName ?? null,
          targetParty: details?.targetParty ?? null,
          electorate: details?.electorate ?? null,
          data: data ? ({ data } as Prisma.InputJsonValue) : undefined,
        },
      });
      await this.outbox.append(tx, {
        tenantId: campaign.tenantId,
        eventType: EVENT_TYPES.DIALER_TRANSFER_RECORDED,
        aggregateId: row.id,
        payload: {
          tenantId: campaign.tenantId,
          campaignId: campaign.id,
          redirectId: row.id,
          callId,
          targetNumber: target,
        },
      });
    });
  }

  /**
   * Answer-type side effects. Returns TwiML when the type takes over the call
   * flow (REDIRECT / SWITCHBOARD), else null to continue along nextKey.
   */
  private async applyAnswerType(ctx: IvrContext, answer: DialerAnswer): Promise<string | null> {
    const { campaign, attempt, session } = ctx;
    switch (answer.type) {
      case "SMS": {
        // Post-commit provider HTTP: the survey row is already written. A
        // failed send must not break the caller's TwiML — log and carry on.
        const toPhone = attempt?.phoneE164 ?? session?.supporterPhone ?? null;
        if (this.dispatcher && toPhone && answer.content) {
          try {
            await this.dispatcher.sendSms({
              tenantId: campaign.tenantId,
              toPhone,
              body: answer.content,
              purpose: "dialer_survey_sms",
            });
          } catch (error) {
            this.logger.warn("autodialer", "survey SMS answer failed to send", {
              campaignId: campaign.id,
              error: error instanceof Error ? error.message : String(error),
            });
          }
        }
        return null;
      }
      case "SET_LANGUAGE": {
        const language = (answer.content ?? "").trim() || "en";
        if (attempt) {
          await this.prisma.dialerAttempt.update({
            where: { id: attempt.id },
            data: { language },
          });
        }
        if (session) {
          await this.prisma.dialerCallSession.update({
            where: { id: session.id },
            data: { language },
          });
        }
        ctx.language = language;
        return null;
      }
      case "REDIRECT": {
        if (!answer.transfer) return null;
        const vr = new Twilio.twiml.VoiceResponse();
        vr.redirect(this.ivrUrl("redirect", this.idParams(ctx)));
        return vr.toString();
      }
      case "SWITCHBOARD": {
        const vr = new Twilio.twiml.VoiceResponse();
        vr.redirect(this.ivrUrl("electoral-postcode", this.idParams(ctx)));
        return vr.toString();
      }
      default:
        return null;
    }
  }
}

export type { DialerPrompt };
