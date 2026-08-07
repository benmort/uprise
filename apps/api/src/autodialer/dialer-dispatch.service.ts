import { Inject, Injectable, Logger, Optional } from "@nestjs/common";
import {
  ConsentState,
  DialerAttemptOutcome,
  DialerCampaignStatus,
  MessageChannel,
} from "@uprise/db";
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
import {
  AudienceRecipientsResolver,
  type AudienceMemberOrder,
} from "../audiences/audience-recipients.resolver";
import { AutodialerService } from "./autodialer.service";
import { isWithinCallingWindow, resolveTenantTimezone } from "./dialer-window.util";

/** Plausible AU E.164 — the dial engine only ever rings +61 numbers. */
const AU_E164_RE = /^\+61\d{8,9}$/;

/**
 * Candidate-walk window = batchSize × this. Each window is hydrated and
 * exclusion-checked with phone-scoped queries; the walk refills until
 * batchSize candidates are found or the member list is exhausted.
 */
const DISPATCH_WINDOW_FACTOR = 4;

/** A phone with one of these outcomes is never dialled again in this campaign. */
const TERMINAL_OUTCOMES: DialerAttemptOutcome[] = [
  DialerAttemptOutcome.ANSWERED,
  DialerAttemptOutcome.OPTED_OUT,
];

/** Per-phone exclusion facts derived from ONE grouped DialerAttempt read. */
type PhoneAttemptStats = { total: number; lastAt: number; terminal: boolean };

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

    // ── Candidate selection: the windowed walk ──
    // The resolver returns ordered member identity only (v2 hash order for
    // dynamic-segment audiences, creation order for static lists) and the walk
    // hydrates + exclusion-checks one window at a time, so a tick never
    // materialises the whole audience, the tenant's opt-out/suppression
    // ledgers, or the campaign's full attempt history.
    const order = await this.recipients.resolveOrderedMembers(campaign.tenantId, campaign.audienceId);

    const batchSize = Math.max(1, campaign.batchSize);
    const windowSize = batchSize * DISPATCH_WINDOW_FACTOR;
    const maxAttempts = Math.max(1, campaign.maxCallAttempts);
    const noCallBefore = now.getTime() - Math.max(0, campaign.noCallWindowHours) * 3_600_000;
    const memberCount = order.kind === "contactIds" ? order.contactIds.length : order.members.length;

    const seen = new Set<string>();
    const candidates: Array<{ contactId?: string; phoneE164: string }> = [];
    const priorAttemptsByPhone = new Map<string, number>();

    for (let offset = 0; offset < memberCount && candidates.length < batchSize; offset += windowSize) {
      const window = await this.hydrateWindow(campaign.tenantId, order, offset, windowSize);
      if (window.length === 0) continue;
      const windowPhones = Array.from(new Set(window.map((m) => m.phoneE164)));

      // Dial-time opt-out exclusion (locked decision): VOICE OPTED_OUT consents
      // and the suppression list both remove a number before it costs money.
      // All three reads are scoped to the window's phones – served by the
      // existing (tenantId, phoneE164[, channel]) and (campaignId, phoneE164)
      // indexes – and the single grouped attempt read yields the attempt cap,
      // the no-call window AND the terminal-outcome exclusion in one pass.
      const [voiceOptOuts, suppressions, attemptRows] = await Promise.all([
        this.prisma.contactConsent.findMany({
          where: {
            tenantId: campaign.tenantId,
            channel: MessageChannel.VOICE,
            state: ConsentState.OPTED_OUT,
            phoneE164: { in: windowPhones },
          },
          select: { phoneE164: true },
        }),
        this.prisma.suppression.findMany({
          where: { tenantId: campaign.tenantId, phoneE164: { in: windowPhones, not: null } },
          select: { phoneE164: true },
        }),
        this.prisma.dialerAttempt.groupBy({
          by: ["phoneE164", "outcome"],
          where: { campaignId: campaign.id, phoneE164: { in: windowPhones } },
          _count: { _all: true },
          _max: { createdAt: true },
        }),
      ]);
      const optedOut = new Set(voiceOptOuts.map((c) => c.phoneE164));
      const suppressed = new Set(suppressions.map((sup) => sup.phoneE164));
      const attemptsByPhone = new Map<string, PhoneAttemptStats>();
      for (const row of attemptRows) {
        const stats = attemptsByPhone.get(row.phoneE164) ?? { total: 0, lastAt: 0, terminal: false };
        stats.total += row._count._all;
        stats.lastAt = Math.max(stats.lastAt, row._max.createdAt?.getTime() ?? 0);
        stats.terminal = stats.terminal || TERMINAL_OUTCOMES.includes(row.outcome);
        attemptsByPhone.set(row.phoneE164, stats);
      }

      for (const member of window) {
        if (candidates.length >= batchSize) break;
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
        const prior = attemptsByPhone.get(phone);
        if (prior) {
          if (prior.terminal) {
            result.skipped.capped += 1;
            continue;
          }
          if (prior.total >= maxAttempts) {
            result.skipped.capped += 1;
            continue;
          }
          if (prior.lastAt > noCallBefore) {
            result.skipped.recent += 1;
            continue;
          }
        }
        priorAttemptsByPhone.set(phone, prior?.total ?? 0);
        candidates.push({ contactId: member.contactId, phoneE164: phone });
      }
    }

    // ── Auto-complete: nothing left to dial and nothing in flight ──
    // Zero candidates here means the walk exhausted EVERY window (the loop
    // only stops early once batchSize candidates exist), so every member was
    // considered – exactly the condition the pre-windowed code expressed by
    // scanning the whole audience.
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
      const priorCount = priorAttemptsByPhone.get(candidate.phoneE164) ?? 0;
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

  /**
   * One window of dialable member identity, in member order. Static /
   * WhatsApp audiences already carry phones; dynamic-segment windows resolve
   * their contact-id slice against the Contact spine (narrow select) and
   * re-impose the slice order – contacts without a phone drop out, exactly
   * as the full resolver's `phoneE164: { not: null }` filter did.
   */
  private async hydrateWindow(
    tenantId: string,
    order: AudienceMemberOrder,
    offset: number,
    windowSize: number,
  ): Promise<Array<{ contactId?: string; phoneE164: string }>> {
    if (order.kind === "members") return order.members.slice(offset, offset + windowSize);

    const windowIds = order.contactIds.slice(offset, offset + windowSize);
    if (windowIds.length === 0) return [];
    const contacts = await this.prisma.contact.findMany({
      where: { id: { in: windowIds }, tenantId, phoneE164: { not: null } },
      select: { id: true, phoneE164: true },
    });
    const byId = new Map(contacts.map((c) => [c.id, c]));
    const window: Array<{ contactId?: string; phoneE164: string }> = [];
    for (const id of windowIds) {
      const contact = byId.get(id);
      if (!contact?.phoneE164) continue;
      window.push({ contactId: id, phoneE164: contact.phoneE164 });
    }
    return window;
  }

  private async tenantTimezone(tenantId: string): Promise<string> {
    const tenant = await this.prisma.tenant.findUnique({
      where: { id: tenantId },
      select: { settings: true },
    });
    return resolveTenantTimezone(tenant?.settings);
  }
}
