import { Injectable } from "@nestjs/common";
import { ConfigService } from "@nestjs/config";
import { DialerCampaignStatus, DialerSessionStatus } from "@uprise/db";
import { EVENT_TYPES } from "@uprise/events";
import { PrismaService } from "../prisma/prisma.service";
import { OutboxService } from "../common/outbox/outbox.service";
import { TwilioService } from "../twilio/twilio.service";
import { VoiceAccountResolver } from "../telephony/voice-account.resolver";
import { createSessionToken, resolveActionsTokenSecret } from "./session-token.util";

/**
 * The one surface the actions domain uses to reach the autodialer — the
 * port-token pattern (journey-trigger.port.ts), so actions depends on the
 * dialler one-way with no module cycle. Sessions minted here get a voice token
 * scoped to the account's DIALLER TwiML app; the call itself is driven by the
 * autodialer IVR (session-answer → conference bridge → queued target leg).
 */
export const AUTODIALER_FACADE = "AutodialerFacade";

export type DialerCampaignKind = "TRANSFER" | "ELECTORAL";

export type DialerCampaignSummary = {
  id: string;
  name: string;
  kind: DialerCampaignKind;
  status: DialerCampaignStatus;
  /** Display-safe label of where the call goes (never a phone number). */
  targetLabel: string | null;
  /** Whether a caller ID can be resolved for this campaign today. */
  voiceReady: boolean;
};

export type CreatePublicCallSessionInput = {
  tenantId: string;
  campaignId: string;
  actionPageId: string;
  supporter: { name?: string; email?: string; phone?: string };
  embedAncestor: string | null;
  clientIp: string | null;
};

export type MintedToken = { token: string; expiresAt: string };

export type CreatedCallSession = {
  sessionId: string;
  voiceToken: MintedToken;
  progressToken: MintedToken;
};

export type SessionRow = {
  id: string;
  status: DialerSessionStatus;
  supporterName: string | null;
  supporterEmail: string | null;
  embedAncestor: string | null;
  targetName: string | null;
  createdAt: Date;
  endedAt: Date | null;
};

export type SessionStats = {
  started: number;
  connected: number;
  bridged: number;
  averageDurationSeconds: number | null;
};

export interface AutodialerFacade {
  getCampaignSummary(tenantId: string, campaignId: string): Promise<DialerCampaignSummary | null>;
  listCampaignSummaries(tenantId: string): Promise<DialerCampaignSummary[]>;
  createPublicCallSession(input: CreatePublicCallSessionInput): Promise<CreatedCallSession>;
  countSessions(actionPageId: string, opts: { since?: Date; activeOnly?: boolean }): Promise<number>;
  listSessions(tenantId: string, actionPageId: string, paging: { limit: number; offset: number }): Promise<SessionRow[]>;
  sessionStats(tenantId: string, actionPageId: string): Promise<SessionStats>;
}

const VOICE_TOKEN_TTL_SECONDS = 900;
const SESSION_TTL_MS = 15 * 60 * 1000;
/** Progress tokens outlive the voice token: they cover the whole call (≤ 60 min). */
const PROGRESS_TOKEN_TTL_SECONDS = 60 * 60;

@Injectable()
export class DefaultAutodialerFacade implements AutodialerFacade {
  constructor(
    private readonly prisma: PrismaService,
    private readonly outbox: OutboxService,
    private readonly twilio: TwilioService,
    private readonly voiceAccounts: VoiceAccountResolver,
    private readonly config: ConfigService,
  ) {}

  private toSummary(c: {
    id: string;
    name: string;
    status: DialerCampaignStatus;
    electoralTarget: boolean;
    targetNumbers: unknown;
    fromNumberId: string | null;
  }): DialerCampaignSummary {
    const kind: DialerCampaignKind = c.electoralTarget ? "ELECTORAL" : "TRANSFER";
    const targets = Array.isArray(c.targetNumbers) ? (c.targetNumbers as string[]) : [];
    const targetLabel = c.electoralTarget
      ? "Your local representative"
      : targets.length > 0
        ? `${targets.length} configured target${targets.length === 1 ? "" : "s"}`
        : null;
    const platformFrom =
      (this.config.get<string>("TWILIO_VOICE_FROM") || "").trim() ||
      (this.config.get<string>("TWILIO_PHONE_NUMBER") || "").trim();
    return {
      id: c.id,
      name: c.name,
      kind,
      status: c.status,
      targetLabel,
      voiceReady: Boolean(c.fromNumberId || platformFrom),
    };
  }

  async getCampaignSummary(tenantId: string, campaignId: string): Promise<DialerCampaignSummary | null> {
    const c = await this.prisma.dialerCampaign.findFirst({
      where: { id: campaignId, tenantId },
      select: { id: true, name: true, status: true, electoralTarget: true, targetNumbers: true, fromNumberId: true },
    });
    return c ? this.toSummary(c) : null;
  }

  async listCampaignSummaries(tenantId: string): Promise<DialerCampaignSummary[]> {
    const rows = await this.prisma.dialerCampaign.findMany({
      where: { tenantId, status: { not: DialerCampaignStatus.ARCHIVED } },
      orderBy: { createdAt: "desc" },
      select: { id: true, name: true, status: true, electoralTarget: true, targetNumbers: true, fromNumberId: true },
    });
    return rows.map((c) => this.toSummary(c));
  }

  async createPublicCallSession(input: CreatePublicCallSessionInput): Promise<CreatedCallSession> {
    const session = await this.prisma.$transaction(async (tx) => {
      const created = await tx.dialerCallSession.create({
        data: {
          tenantId: input.tenantId,
          campaignId: input.campaignId,
          actionPageId: input.actionPageId,
          status: DialerSessionStatus.CREATED,
          supporterName: input.supporter.name ?? null,
          supporterEmail: input.supporter.email ?? null,
          supporterPhone: input.supporter.phone ?? null,
          embedAncestor: input.embedAncestor,
          expiresAt: new Date(Date.now() + SESSION_TTL_MS),
        },
      });
      // Deterministic room name — a retried TwiML fetch reuses the same conference.
      const withRoom = await tx.dialerCallSession.update({
        where: { id: created.id },
        data: { conferenceName: `dialer-${created.id}` },
      });
      await this.outbox.append(tx, {
        tenantId: input.tenantId,
        eventType: EVENT_TYPES.DIALER_SESSION_STARTED,
        aggregateId: created.id,
        payload: {
          sessionId: created.id,
          tenantId: input.tenantId,
          campaignId: input.campaignId,
          actionPageId: input.actionPageId,
        },
      });
      return withRoom;
    });

    // Provider-facing minting happens OUTSIDE the transaction (no provider work
    // in tx). The token signs against the DIALLER TwiML app, so a widget caller
    // can only ever land on /autodialer/ivr/session-answer.
    const account = await this.voiceAccounts.resolveDialerForTenant(input.tenantId);
    const identity = `s${session.id}.t${input.tenantId}`;
    const voiceJwt = this.twilio.mintVoiceToken({
      accountSid: account.accountSid,
      apiKeySid: account.apiKeySid,
      apiKeySecret: account.apiKeySecret,
      twimlAppSid: account.twimlAppSid,
      identity,
      ttlSeconds: VOICE_TOKEN_TTL_SECONDS,
    });

    const secret = resolveActionsTokenSecret(this.config);
    const progress = createSessionToken(secret, "progress", PROGRESS_TOKEN_TTL_SECONDS, input.tenantId, session.id);

    return {
      sessionId: session.id,
      voiceToken: {
        token: voiceJwt,
        expiresAt: new Date(Date.now() + VOICE_TOKEN_TTL_SECONDS * 1000).toISOString(),
      },
      progressToken: { token: progress.token, expiresAt: new Date(progress.expiresAt).toISOString() },
    };
  }

  async countSessions(actionPageId: string, opts: { since?: Date; activeOnly?: boolean }): Promise<number> {
    return this.prisma.dialerCallSession.count({
      where: {
        actionPageId,
        ...(opts.since ? { createdAt: { gte: opts.since } } : {}),
        ...(opts.activeOnly
          ? { status: { in: [DialerSessionStatus.CREATED, DialerSessionStatus.CONNECTED, DialerSessionStatus.BRIDGED] } }
          : {}),
      },
    });
  }

  async listSessions(
    tenantId: string,
    actionPageId: string,
    paging: { limit: number; offset: number },
  ): Promise<SessionRow[]> {
    return this.prisma.dialerCallSession.findMany({
      where: { tenantId, actionPageId },
      orderBy: { createdAt: "desc" },
      take: paging.limit,
      skip: paging.offset,
      select: {
        id: true,
        status: true,
        supporterName: true,
        supporterEmail: true,
        embedAncestor: true,
        targetName: true,
        createdAt: true,
        endedAt: true,
      },
    });
  }

  async sessionStats(tenantId: string, actionPageId: string): Promise<SessionStats> {
    const where = { tenantId, actionPageId };
    const [started, connected, bridged, durations] = await Promise.all([
      this.prisma.dialerCallSession.count({ where }),
      this.prisma.dialerCallSession.count({
        where: { ...where, status: { in: [DialerSessionStatus.CONNECTED, DialerSessionStatus.BRIDGED, DialerSessionStatus.ENDED] } },
      }),
      this.prisma.dialerCallSession.count({ where: { ...where, status: { in: [DialerSessionStatus.BRIDGED, DialerSessionStatus.ENDED] } } }),
      this.prisma.dialerCallSession.findMany({
        where: { ...where, endedAt: { not: null } },
        select: { createdAt: true, endedAt: true },
        take: 500,
        orderBy: { createdAt: "desc" },
      }),
    ]);
    const secs = durations
      .map((d) => (d.endedAt ? (d.endedAt.getTime() - d.createdAt.getTime()) / 1000 : null))
      .filter((n): n is number => n !== null && n >= 0);
    const averageDurationSeconds = secs.length
      ? Math.round(secs.reduce((a, b) => a + b, 0) / secs.length)
      : null;
    return { started, connected, bridged, averageDurationSeconds };
  }
}
