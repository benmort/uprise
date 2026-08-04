import { Body, Controller, Header, NotFoundException, Post, Query, Req } from "@nestjs/common";
import type { Request } from "express";
import { ConfigService } from "@nestjs/config";
import Twilio from "twilio";
import { PrismaService } from "../prisma/prisma.service";
import { TelephonyWebhookAuthService } from "../telephony/telephony-webhook-auth.service";
import { validateTwilioWebhookSignature } from "../common/webhooks/twilio-signature.util";
import { DomainLogger } from "../common/logging/domain-logger.service";
import { IvrFlowService, type IvrContext } from "./ivr-flow.service";

/**
 * The autodialer's Twilio-facing IVR surface — TwiML in, TwiML out.
 *
 * Auth posture: allowlisted in BasicAuthGuard (`/autodialer/ivr/` regex) and in
 * the route-authorization guardrail (`DialerIvrController`), because EVERY
 * handler validates the per-subaccount X-Twilio-Signature (fail-closed) and
 * then refuses cross-tenant context: the signing account must belong to the
 * campaign's tenant (or be the platform account). This mirrors the
 * WebhooksController + webhookAccountMayTouchCall discipline exactly — the
 * source's `DISABLE_TWILIO_SECURITY` toggle is deliberately not ported.
 *
 * TwiML handlers answer every retry with valid TwiML; their writes are
 * idempotent-by-write (upserts / keyed inserts), never claim-and-drop.
 */
@Controller("autodialer/ivr")
export class DialerIvrController {
  constructor(
    private readonly flow: IvrFlowService,
    private readonly prisma: PrismaService,
    private readonly telephonyAuth: TelephonyWebhookAuthService,
    private readonly config: ConfigService,
    private readonly logger: DomainLogger,
  ) {}

  /* ------------------------------------------------------------ guards */

  private async authenticate(
    req: Request,
    body: Record<string, unknown>,
    query: { campaignId?: string; attemptId?: string; sessionId?: string },
  ): Promise<IvrContext> {
    const token = await this.telephonyAuth.tokenForAccountSid(body?.AccountSid as string | undefined);
    validateTwilioWebhookSignature(req, body, token);
    const ctx = await this.flow.loadContext(query);
    await this.assertAccountMayTouchTenant(body?.AccountSid as string | undefined, ctx.campaign.tenantId);
    return ctx;
  }

  /**
   * A leaked id plus ANOTHER tenant's BYO credentials must never drive a
   * foreign campaign's IVR (the webhookAccountMayTouchCall rule, applied to
   * campaign context).
   */
  private async assertAccountMayTouchTenant(accountSid: string | undefined, tenantId: string): Promise<void> {
    if (!accountSid) return;
    const platform = this.config.get<string>("TWILIO_ACCOUNT_SID", "").trim();
    if (!platform || accountSid === platform) return;
    const account = await this.prisma.telephonyAccount.findFirst({ where: { accountSid } });
    if (!account || account.tenantId !== tenantId) {
      this.logger.warn("autodialer", "IVR webhook from a foreign account — refused", {
        accountSid,
        tenantId,
      });
      throw new NotFoundException("Not found");
    }
  }

  /** Twilio must always receive TwiML — errors resolve to a spoken goodbye. */
  private failSoft(): string {
    const vr = new Twilio.twiml.VoiceResponse();
    vr.say("Sorry, something went wrong with this call. Goodbye.");
    vr.hangup();
    return vr.toString();
  }

  /* ------------------------------------------------------------ routes */

  @Post("answer")
  @Header("Content-Type", "application/xml")
  async answer(
    @Req() req: Request,
    @Body() body: Record<string, unknown>,
    @Query("campaignId") campaignId?: string,
    @Query("attemptId") attemptId?: string,
    @Query("sessionId") sessionId?: string,
  ): Promise<string> {
    const ctx = await this.authenticate(req, body, { campaignId, attemptId, sessionId });
    try {
      return await this.flow.handleAnswer(ctx, body as { CallSid?: string; AnsweredBy?: string });
    } catch (error) {
      this.logger.error("autodialer", "IVR answer failed", undefined, { error: String(error) });
      return this.failSoft();
    }
  }

  @Post("survey")
  @Header("Content-Type", "application/xml")
  async survey(
    @Req() req: Request,
    @Body() body: Record<string, unknown>,
    @Query("q") q?: string,
    @Query("campaignId") campaignId?: string,
    @Query("attemptId") attemptId?: string,
    @Query("sessionId") sessionId?: string,
  ): Promise<string> {
    const ctx = await this.authenticate(req, body, { campaignId, attemptId, sessionId });
    try {
      if (!q) return this.failSoft();
      return await this.flow.renderSurveyQuestion(ctx, q);
    } catch (error) {
      this.logger.error("autodialer", "IVR survey failed", undefined, { error: String(error) });
      return this.failSoft();
    }
  }

  @Post("survey-result")
  @Header("Content-Type", "application/xml")
  async surveyResult(
    @Req() req: Request,
    @Body() body: Record<string, unknown>,
    @Query("q") q?: string,
    @Query("campaignId") campaignId?: string,
    @Query("attemptId") attemptId?: string,
    @Query("sessionId") sessionId?: string,
  ): Promise<string> {
    const ctx = await this.authenticate(req, body, { campaignId, attemptId, sessionId });
    try {
      if (!q) return this.failSoft();
      return await this.flow.handleSurveyResult(ctx, q, body as { Digits?: string; CallSid?: string });
    } catch (error) {
      this.logger.error("autodialer", "IVR survey-result failed", undefined, { error: String(error) });
      return this.failSoft();
    }
  }

  /**
   * The dialler TwiML app's voice URL — a widget caller's Voice-SDK connect.
   * The session id comes from the SIGNED client identity (`From`), never a
   * client-controlled param, mirroring the softphone's voice-outbound rule.
   */
  @Post("session-answer")
  @Header("Content-Type", "application/xml")
  async sessionAnswer(
    @Req() req: Request,
    @Body() body: Record<string, unknown>,
  ): Promise<string> {
    const identity = sessionFromClientIdentity(body?.From as string | undefined);
    if (!identity) {
      // Validate the signature even on a malformed identity — an unsigned
      // request must never learn which identities parse.
      const token = await this.telephonyAuth.tokenForAccountSid(body?.AccountSid as string | undefined);
      validateTwilioWebhookSignature(req, body, token);
      return this.failSoft();
    }
    const ctx = await this.authenticate(req, body, { sessionId: identity.sessionId });
    if (ctx.campaign.tenantId !== identity.tenantId) {
      this.logger.warn("autodialer", "session-answer identity/tenant mismatch — refused", {
        sessionId: identity.sessionId,
      });
      throw new NotFoundException("Not found");
    }
    try {
      return await this.flow.handleSessionAnswer(ctx, body as { CallSid?: string; From?: string });
    } catch (error) {
      this.logger.error("autodialer", "IVR session-answer failed", undefined, { error: String(error) });
      return this.failSoft();
    }
  }

  @Post("conference-join")
  @Header("Content-Type", "application/xml")
  async conferenceJoin(
    @Req() req: Request,
    @Body() body: Record<string, unknown>,
    @Query("sessionId") sessionId?: string,
    @Query("campaignId") campaignId?: string,
  ): Promise<string> {
    const ctx = await this.authenticate(req, body, { campaignId, sessionId });
    try {
      return await this.flow.renderConferenceJoin(ctx);
    } catch (error) {
      this.logger.error("autodialer", "IVR conference-join failed", undefined, { error: String(error) });
      return this.failSoft();
    }
  }

  /** Conference lifecycle callback — a status hook, not a TwiML surface. */
  @Post("conference-status")
  @Header("Content-Type", "application/xml")
  async conferenceStatus(
    @Req() req: Request,
    @Body() body: Record<string, unknown>,
    @Query("sessionId") sessionId?: string,
    @Query("campaignId") campaignId?: string,
  ): Promise<string> {
    const ctx = await this.authenticate(req, body, { campaignId, sessionId });
    try {
      await this.flow.handleConferenceStatus(
        ctx,
        body as { StatusCallbackEvent?: string; CallSid?: string; ConferenceSid?: string },
      );
    } catch (error) {
      this.logger.error("autodialer", "IVR conference-status failed", undefined, { error: String(error) });
    }
    return '<?xml version="1.0" encoding="UTF-8"?><Response/>';
  }

  @Post("electoral-postcode")
  @Header("Content-Type", "application/xml")
  async electoralPostcode(
    @Req() req: Request,
    @Body() body: Record<string, unknown>,
    @Query("campaignId") campaignId?: string,
    @Query("attemptId") attemptId?: string,
    @Query("sessionId") sessionId?: string,
  ): Promise<string> {
    const ctx = await this.authenticate(req, body, { campaignId, attemptId, sessionId });
    try {
      return await this.flow.renderElectoralPostcode(ctx);
    } catch (error) {
      this.logger.error("autodialer", "IVR electoral-postcode failed", undefined, { error: String(error) });
      return this.failSoft();
    }
  }

  @Post("electoral-lookup")
  @Header("Content-Type", "application/xml")
  async electoralLookup(
    @Req() req: Request,
    @Body() body: Record<string, unknown>,
    @Query("campaignId") campaignId?: string,
    @Query("attemptId") attemptId?: string,
    @Query("sessionId") sessionId?: string,
  ): Promise<string> {
    const ctx = await this.authenticate(req, body, { campaignId, attemptId, sessionId });
    try {
      return await this.flow.handleElectoralLookup(ctx, body as { Digits?: string; CallSid?: string });
    } catch (error) {
      this.logger.error("autodialer", "IVR electoral-lookup failed", undefined, { error: String(error) });
      return this.failSoft();
    }
  }

  @Post("select-electorate")
  @Header("Content-Type", "application/xml")
  async selectElectorate(
    @Req() req: Request,
    @Body() body: Record<string, unknown>,
    @Query("campaignId") campaignId?: string,
    @Query("attemptId") attemptId?: string,
    @Query("sessionId") sessionId?: string,
  ): Promise<string> {
    const ctx = await this.authenticate(req, body, { campaignId, attemptId, sessionId });
    try {
      return await this.flow.handleSelectElectorate(ctx, body as { Digits?: string; CallSid?: string });
    } catch (error) {
      this.logger.error("autodialer", "IVR select-electorate failed", undefined, { error: String(error) });
      return this.failSoft();
    }
  }

  @Post("redirect")
  @Header("Content-Type", "application/xml")
  async redirect(
    @Req() req: Request,
    @Body() body: Record<string, unknown>,
    @Query("campaignId") campaignId?: string,
    @Query("attemptId") attemptId?: string,
    @Query("sessionId") sessionId?: string,
    @Query("target_number") targetNumber?: string,
    @Query("data") data?: string,
  ): Promise<string> {
    const ctx = await this.authenticate(req, body, { campaignId, attemptId, sessionId });
    try {
      return await this.flow.handleRedirect(ctx, body as { CallSid?: string }, {
        target_number: targetNumber,
        data,
      });
    } catch (error) {
      this.logger.error("autodialer", "IVR redirect failed", undefined, { error: String(error) });
      return this.failSoft();
    }
  }
}

/**
 * The session id from a widget Voice client identity. The access token identity
 * is `s{sessionId}.t{tenantId}`; Twilio delivers it as `From: client:s….t…`
 * (mirrors the softphone's tenantFromClientIdentity).
 */
function sessionFromClientIdentity(from?: string): { sessionId: string; tenantId: string } | null {
  const match = /^client:s([A-Za-z0-9]+)\.t([A-Za-z0-9]+)$/.exec(String(from || "").trim());
  return match ? { sessionId: match[1], tenantId: match[2] } : null;
}
