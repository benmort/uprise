import { Inject, Injectable, Logger, Optional } from "@nestjs/common";
import { ConsentState, DialerCampaignStatus, MessageChannel } from "@uprise/db";
import { PrismaService } from "../prisma/prisma.service";
import { FeatureFlagsService } from "../common/flags/feature-flags.service";
import { DISPATCH_QUEUE_TOKEN } from "../common/queue/queue.tokens";
import type { DispatchQueue } from "../common/queue/dispatch-queue";
import {
  QUEUE_JOB_TYPES,
  QUEUE_NAMES,
  getDialerPlaceCallJobId,
  getDialerTickJobId,
} from "../common/queue/queue.constants";
import type { DialerCampaignTickJobPayload, DialerPlaceCallJobPayload } from "../common/queue/queue.payloads";
import { AudienceRecipientsResolver } from "../audiences/audience-recipients.resolver";
import { AutodialerService } from "./autodialer.service";
import { isWithinCallingWindow, resolveTenantTimezone } from "./dialer-window.util";

/** Plausible AU E.164 — the dial engine only ever rings +61 numbers. */
const AU_E164_RE = /^\+61\d{8,9}$/;

type TickResult = {
  campaignId: string;
  dialled: number;
  skipped: { optedOut: number; suppressed: number; invalid: number; capped: number; recent: number };
  completed: boolean;
  claimed: boolean;
};

/**
 * The dial engine's producer + tick.
 *
 * `dispatchDue()` runs on the platform cron and enqueues one tick job per due
 * ACTIVE campaign; `runTick()` runs on the worker, claims the campaign by CAS
 * on `lastDialedAt`, selects the next batch of callable numbers and enqueues
 * one `dialer.call.place` job per attempt. Concurrency is bounded by the
 * `dialer-call` worker, never by fan-out here — the source dialled its whole
 * audience in one unbounded `Promise.all`, which this deliberately does not.
 */
@Injectable()
export class DialerDispatchService {
  private readonly logger = new Logger(DialerDispatchService.name);
  private readonly flags: Pick<FeatureFlagsService, "isEnabled">;

  constructor(
    private readonly prisma: PrismaService,
    private readonly recipients: AudienceRecipientsResolver,
    private readonly autodialer: AutodialerService,
    // NOT @Optional — a missing QueueModule import must fail the boot smoke,
    // not silently stop the dial engine enqueueing (live-smoke finding).
    @Inject(DISPATCH_QUEUE_TOKEN) private readonly queue?: DispatchQueue,
    @Optional() flags?: FeatureFlagsService,
  ) {
    this.flags = flags ?? { isEnabled: async () => false };
  }

  /**
   * Cron entry: enqueue a tick for every ACTIVE campaign that is due.
   *
   * Due = `lastDialedAt` is null or at least `dialerPeriodMinutes` ago — the
   * source's condition was inverted (it returned exactly when the period HAD
   * elapsed) and dialled on every cron beat instead; see the named regression
   * spec. Window and flag checks happen here too so out-of-window campaigns
   * don't even enqueue.
   */
  async dispatchDue(now: Date = new Date()): Promise<{ enqueued: number }> {
    const campaigns = await this.prisma.dialerCampaign.findMany({
      where: {
        status: DialerCampaignStatus.ACTIVE,
        outboundOnly: true,
        audienceId: { not: null },
      },
      select: {
        id: true,
        tenantId: true,
        dailyStart: true,
        dailyFinish: true,
        dialerPeriodMinutes: true,
        lastDialedAt: true,
      },
    });

    let enqueued = 0;
    for (const campaign of campaigns) {
      const periodMs = Math.max(1, campaign.dialerPeriodMinutes) * 60_000;
      const due = !campaign.lastDialedAt || now.getTime() - campaign.lastDialedAt.getTime() >= periodMs;
      if (!due) continue;

      if (!(await this.flags.isEnabled("FEATURE_AUTODIALER_ENABLED", { tenantId: campaign.tenantId }))) {
        continue;
      }

      const tz = await this.tenantTimezone(campaign.tenantId);
      if (!isWithinCallingWindow(campaign, tz, now)) continue;

      const payload: DialerCampaignTickJobPayload = {
        campaignId: campaign.id,
        tenantId: campaign.tenantId,
      };
      await this.queue?.enqueue({
        id: getDialerTickJobId(campaign.id, Math.floor(now.getTime() / periodMs)),
        queue: QUEUE_NAMES.DIALER_DISPATCH,
        type: QUEUE_JOB_TYPES.DIALER_CAMPAIGN_TICK,
        payload,
        removeOnComplete: true,
      });
      enqueued += 1;
    }
    return { enqueued };
  }

  /** Worker entry: one pacing tick for one campaign. */
  async runTick(payload: DialerCampaignTickJobPayload, now: Date = new Date()): Promise<TickResult> {
    const empty: TickResult = {
      campaignId: payload.campaignId,
      dialled: 0,
      skipped: { optedOut: 0, suppressed: 0, invalid: 0, capped: 0, recent: 0 },
      completed: false,
      claimed: false,
    };

    const campaign = await this.prisma.dialerCampaign.findFirst({
      where: { id: payload.campaignId, tenantId: payload.tenantId },
    });
    if (!campaign || campaign.status !== DialerCampaignStatus.ACTIVE || !campaign.audienceId) return empty;

    // Re-check the window on the worker side — the job may sit queued across the edge.
    const tz = await this.tenantTimezone(campaign.tenantId);
    if (!isWithinCallingWindow(campaign, tz, now)) return empty;

    // CAS claim on lastDialedAt: two overlapping ticks (cron retry, manual kick)
    // race on the stamp and the loser no-ops.
    const claim = await this.prisma.dialerCampaign.updateMany({
      where: { id: campaign.id, status: DialerCampaignStatus.ACTIVE, lastDialedAt: campaign.lastDialedAt },
      data: { lastDialedAt: now },
    });
    if (claim.count === 0) return empty;

    const result: TickResult = { ...empty, claimed: true };

    // ── Candidate selection ──
    const members = await this.recipients.resolvePhoneRecipients(campaign.tenantId, campaign.audienceId);

    // Dial-time opt-out exclusion (locked decision): VOICE OPTED_OUT consents
    // and the suppression list both remove a number before it costs money.
    const [voiceOptOuts, suppressions, attempts] = await Promise.all([
      this.prisma.contactConsent.findMany({
        where: { tenantId: campaign.tenantId, channel: MessageChannel.VOICE, state: ConsentState.OPTED_OUT },
        select: { phoneE164: true },
      }),
      this.prisma.suppression.findMany({
        where: { tenantId: campaign.tenantId },
        select: { phoneE164: true },
      }),
      this.prisma.dialerAttempt.groupBy({
        by: ["phoneE164"],
        where: { campaignId: campaign.id },
        _count: { _all: true },
        _max: { createdAt: true },
      }),
    ]);
    const optedOut = new Set(voiceOptOuts.map((c) => c.phoneE164));
    const suppressed = new Set(suppressions.map((sup) => sup.phoneE164));
    const terminalPhones = new Set(
      (
        await this.prisma.dialerAttempt.findMany({
          where: { campaignId: campaign.id, outcome: { in: ["ANSWERED", "OPTED_OUT"] } },
          select: { phoneE164: true },
        })
      ).map((a) => a.phoneE164),
    );
    const attemptsByPhone = new Map(attempts.map((a) => [a.phoneE164, a]));
    const noCallBefore = now.getTime() - Math.max(0, campaign.noCallWindowHours) * 3_600_000;

    const seen = new Set<string>();
    const candidates: Array<{ contactId?: string; phoneE164: string }> = [];
    for (const member of members) {
      if (candidates.length >= Math.max(1, campaign.batchSize)) break;
      const phone = member.phoneE164;
      if (seen.has(phone)) continue;
      seen.add(phone);

      if (!AU_E164_RE.test(phone)) {
        result.skipped.invalid += 1;
        continue;
      }
      if (optedOut.has(phone)) {
        result.skipped.optedOut += 1;
        continue;
      }
      if (suppressed.has(phone)) {
        result.skipped.suppressed += 1;
        continue;
      }
      if (terminalPhones.has(phone)) {
        result.skipped.capped += 1;
        continue;
      }
      const prior = attemptsByPhone.get(phone);
      if (prior) {
        if (prior._count._all >= Math.max(1, campaign.maxCallAttempts)) {
          result.skipped.capped += 1;
          continue;
        }
        const last = prior._max.createdAt?.getTime() ?? 0;
        if (last > noCallBefore) {
          result.skipped.recent += 1;
          continue;
        }
      }
      candidates.push({ contactId: member.contactId, phoneE164: phone });
    }

    // ── Auto-complete: nothing left to dial and nothing in flight ──
    if (candidates.length === 0) {
      const pending = await this.prisma.dialerAttempt.count({
        where: { campaignId: campaign.id, outcome: "PENDING" },
      });
      if (pending === 0) {
        // Through the same FSM + outbox path as a manual Complete.
        await this.autodialer.complete(campaign.tenantId, campaign.id).catch((err) => {
          this.logger.warn(`Auto-complete failed for ${campaign.id}: ${String(err)}`);
        });
        result.completed = true;
      }
      return result;
    }

    // ── Create attempts + enqueue placements ──
    for (const candidate of candidates) {
      const priorCount = attemptsByPhone.get(candidate.phoneE164)?._count._all ?? 0;
      const attempt = await this.prisma.dialerAttempt.create({
        data: {
          tenantId: campaign.tenantId,
          campaignId: campaign.id,
          contactId: candidate.contactId ?? null,
          phoneE164: candidate.phoneE164,
          attemptNo: priorCount + 1,
          language: campaign.defaultLanguage,
        },
      });
      const placePayload: DialerPlaceCallJobPayload = { attemptId: attempt.id, tenantId: campaign.tenantId };
      await this.queue?.enqueue({
        id: getDialerPlaceCallJobId(attempt.id),
        queue: QUEUE_NAMES.DIALER_CALL,
        type: QUEUE_JOB_TYPES.DIALER_PLACE_CALL,
        payload: placePayload,
        removeOnComplete: true,
      });
      result.dialled += 1;
    }

    this.logger.log(
      `Tick ${campaign.id}: dialled=${result.dialled} skipped=${JSON.stringify(result.skipped)}`,
    );
    return result;
  }

  private async tenantTimezone(tenantId: string): Promise<string> {
    const tenant = await this.prisma.tenant.findUnique({
      where: { id: tenantId },
      select: { settings: true },
    });
    return resolveTenantTimezone(tenant?.settings);
  }
}
