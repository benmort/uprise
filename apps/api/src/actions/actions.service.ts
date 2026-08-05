import { Inject, Injectable, NotFoundException } from "@nestjs/common";
import { ConfigService } from "@nestjs/config";
import { randomBytes } from "node:crypto";
import { ActionPageStatus, ActionPageType, DialerCampaignStatus, Prisma } from "@uprise/db";
import { EVENT_TYPES } from "@uprise/events";
import { PrismaService } from "../prisma/prisma.service";
import { OutboxService } from "../common/outbox/outbox.service";
import { FeatureFlagsService } from "../common/flags/feature-flags.service";
import { TurnstileService } from "../common/captcha/turnstile.service";
import { ApiHttpException } from "../common/http/api-response";
import { BRAND_SELECT, brandFields } from "../common/brand";
import { assertValidActionPageTransition } from "./action-page-state.machine";
import { AUTODIALER_FACADE, type AutodialerFacade } from "./autodialer.facade";
import { EVENTS_FACADE, type EventsFacade } from "./events.facade";
import { ActionsRateLimitService } from "./actions-rate-limit.service";
import { createSessionToken, resolveActionsTokenSecret, verifySessionToken } from "./session-token.util";
import {
  EMBED_DOMAIN_RE,
  type CreateActionRsvpDto,
  type CreateCallSessionDto,
  type UpdateActionPageDto,
} from "./dto/actions.dto";

const PREVIEW_TOKEN_TTL_SECONDS = 600;

type PageRow = Prisma.ActionPageGetPayload<Record<string, never>>;

/**
 * Action pages — presentation + public-surface policy. All telephony lives on
 * the autodialer campaign the page references id-only, reached through the
 * AUTODIALER_FACADE port so the dependency stays one-way.
 */
@Injectable()
export class ActionsService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly outbox: OutboxService,
    private readonly flags: FeatureFlagsService,
    private readonly turnstile: TurnstileService,
    private readonly rateLimit: ActionsRateLimitService,
    private readonly config: ConfigService,
    @Inject(AUTODIALER_FACADE) private readonly autodialer: AutodialerFacade,
    @Inject(EVENTS_FACADE) private readonly events: EventsFacade,
  ) {}

  // ── Admin CRUD ─────────────────────────────────────────────────────────────

  async list(tenantId: string, q: { status?: string; search?: string; limit?: number; offset?: number }) {
    const where: Prisma.ActionPageWhereInput = {
      tenantId,
      ...(q.status ? { status: q.status as ActionPageStatus } : {}),
      ...(q.search ? { title: { contains: q.search, mode: "insensitive" } } : {}),
    };
    const [pages, total] = await Promise.all([
      this.prisma.actionPage.findMany({
        where,
        orderBy: { createdAt: "desc" },
        take: q.limit ?? 20,
        skip: q.offset ?? 0,
      }),
      this.prisma.actionPage.count({ where }),
    ]);
    return { pages, total };
  }

  async get(tenantId: string, id: string): Promise<PageRow> {
    const page = await this.prisma.actionPage.findFirst({ where: { id, tenantId } });
    if (!page) throw new NotFoundException("Action page not found");
    return page;
  }

  async create(tenantId: string, title: string): Promise<PageRow> {
    return this.prisma.$transaction(async (tx) => {
      const page = await tx.actionPage.create({
        data: {
          tenantId,
          title,
          // Unguessable public identity — 128 bits, never sequential.
          publicSlug: randomBytes(16).toString("base64url"),
        },
      });
      await this.outbox.append(tx, {
        tenantId,
        eventType: EVENT_TYPES.ACTION_PAGE_CREATED,
        aggregateId: page.id,
        payload: { pageId: page.id, tenantId, type: page.type },
      });
      return page;
    });
  }

  async update(tenantId: string, id: string, dto: UpdateActionPageDto): Promise<PageRow> {
    const page = await this.get(tenantId, id);
    if (dto.embedDomains) {
      const bad = dto.embedDomains.filter((d) => !EMBED_DOMAIN_RE.test(d));
      if (bad.length) {
        throw new ApiHttpException(
          "INVALID_EMBED_DOMAIN",
          `Embed domains must be bare hostnames (optionally *.host): ${bad.join(", ")}`,
          400,
        );
      }
    }
    if (dto.campaignId) {
      const summary = await this.autodialer.getCampaignSummary(tenantId, dto.campaignId);
      if (!summary) throw new ApiHttpException("CAMPAIGN_NOT_FOUND", "That calling campaign does not exist.", 400);
    }
    // Attaching an event is checked against THIS tenant, so a page can never be pointed at
    // another organisation's event by id. Whether it is publishable (published, RSVPs on, not
    // over) is a separate question, answered at publish time so a draft can be built early.
    if (dto.eventId) {
      const event = await this.events.checkPublishable(tenantId, dto.eventId);
      if (!event.exists) throw new ApiHttpException("EVENT_NOT_FOUND", "That event does not exist.", 400);
    }
    // Switching type must not leave the other type's link behind: a page flipped to EVENT_RSVP
    // while still carrying a campaignId would publish against stale checks.
    const switchingTo = dto.type && dto.type !== page.type ? dto.type : null;
    return this.prisma.actionPage.update({
      where: { id: page.id },
      data: {
        ...(dto.title !== undefined ? { title: dto.title } : {}),
        ...(dto.headline !== undefined ? { headline: dto.headline } : {}),
        ...(dto.body !== undefined ? { body: dto.body } : {}),
        ...(dto.ctaLabel !== undefined ? { ctaLabel: dto.ctaLabel } : {}),
        ...(dto.successMessage !== undefined ? { successMessage: dto.successMessage } : {}),
        ...(dto.collectName !== undefined ? { collectName: dto.collectName } : {}),
        ...(dto.collectEmail !== undefined ? { collectEmail: dto.collectEmail } : {}),
        ...(dto.collectPhone !== undefined ? { collectPhone: dto.collectPhone } : {}),
        ...(dto.allowPrefill !== undefined ? { allowPrefill: dto.allowPrefill } : {}),
        ...(dto.requireCaptcha !== undefined ? { requireCaptcha: dto.requireCaptcha } : {}),
        ...(dto.embedDomains !== undefined ? { embedDomains: dto.embedDomains } : {}),
        ...(dto.campaignId !== undefined ? { campaignId: dto.campaignId } : {}),
        ...(dto.eventId !== undefined ? { eventId: dto.eventId } : {}),
        ...(dto.type !== undefined ? { type: dto.type as ActionPageType } : {}),
        ...(switchingTo === ActionPageType.EVENT_RSVP ? { campaignId: null } : {}),
        ...(switchingTo === ActionPageType.CLICK_TO_CALL ? { eventId: null } : {}),
      },
    });
  }

  /** The publish gate — FSM legality plus everything a live page must have. */
  private async assertPublishable(tenantId: string, page: PageRow): Promise<void> {
    const problems: string[] = [];
    if (!page.headline?.trim()) problems.push("headline is required");
    if (!page.ctaLabel?.trim()) problems.push("call-to-action label is required");
    const badDomains = page.embedDomains.filter((d) => !EMBED_DOMAIN_RE.test(d));
    if (badDomains.length) problems.push(`invalid embed domains: ${badDomains.join(", ")}`);
    if (page.type === ActionPageType.EVENT_RSVP) {
      // An RSVP page's promises are the event's: if the event is not publicly RSVP-able, or is
      // already over, publishing this page would collect names for nothing.
      if (!page.eventId) {
        problems.push("an event must be attached");
      } else {
        const event = await this.events.checkPublishable(tenantId, page.eventId);
        if (!event.exists) problems.push("the attached event no longer exists");
        else if (event.cancelled) problems.push("the attached event is cancelled");
        else if (!event.publiclyRsvpable) {
          problems.push("the attached event is not published with public RSVPs enabled");
        } else if (event.ended) problems.push("the attached event has already finished");
      }
    } else {
      if (!(await this.flags.isEnabled("FEATURE_ACTIONS_CALLS", { tenantId }))) {
        problems.push("click-to-call is not enabled on this plan");
      }
      if (!page.campaignId) {
        problems.push("a calling campaign must be attached");
      } else {
        const summary = await this.autodialer.getCampaignSummary(tenantId, page.campaignId);
        if (!summary) problems.push("the attached calling campaign no longer exists");
        else {
          if (summary.status !== DialerCampaignStatus.ACTIVE) problems.push("the attached campaign is not active");
          if (!summary.voiceReady) problems.push("the attached campaign has no caller number available");
        }
      }
    }
    if (problems.length) {
      throw new ApiHttpException("ACTION_PAGE_NOT_PUBLISHABLE", problems.join("; "), 422, { problems });
    }
  }

  private async transition(
    tenantId: string,
    id: string,
    to: ActionPageStatus,
    extra?: (page: PageRow) => Prisma.ActionPageUpdateInput,
    eventType?: (typeof EVENT_TYPES)[keyof typeof EVENT_TYPES],
    payload?: (page: PageRow) => Record<string, unknown>,
  ): Promise<PageRow> {
    return this.prisma.$transaction(async (tx) => {
      const rows = await tx.$queryRaw<Array<{ id: string; status: ActionPageStatus }>>`
        SELECT "id", "status" FROM "actions"."ActionPage"
        WHERE "id" = ${id} AND "tenantId" = ${tenantId} FOR UPDATE`;
      const current = rows[0];
      if (!current) throw new NotFoundException("Action page not found");
      assertValidActionPageTransition(current.status, to);
      const page = await tx.actionPage.update({
        where: { id },
        data: { status: to, ...(extra ? extra({ ...current } as PageRow) : {}) },
      });
      if (eventType) {
        await this.outbox.append(tx, {
          tenantId,
          eventType,
          aggregateId: id,
          payload: (payload ? payload(page) : { pageId: id, tenantId }) as never,
        });
      }
      return page;
    });
  }

  async publish(tenantId: string, id: string): Promise<PageRow> {
    const page = await this.get(tenantId, id);
    await this.assertPublishable(tenantId, page);
    return this.transition(
      tenantId,
      id,
      ActionPageStatus.PUBLISHED,
      () => ({ publishedAt: new Date() }),
      EVENT_TYPES.ACTION_PAGE_PUBLISHED,
      (p) => ({ pageId: p.id, tenantId, campaignId: p.campaignId }),
    );
  }

  async unpublish(tenantId: string, id: string): Promise<PageRow> {
    return this.transition(tenantId, id, ActionPageStatus.DRAFT);
  }

  async archive(tenantId: string, id: string): Promise<PageRow> {
    return this.transition(
      tenantId,
      id,
      ActionPageStatus.ARCHIVED,
      () => ({ archivedAt: new Date() }),
      EVENT_TYPES.ACTION_PAGE_ARCHIVED,
      (p) => ({ pageId: p.id, tenantId }),
    );
  }

  async restore(tenantId: string, id: string): Promise<PageRow> {
    return this.transition(tenantId, id, ActionPageStatus.DRAFT, () => ({ archivedAt: null }));
  }

  async results(tenantId: string, id: string, paging: { limit: number; offset: number }) {
    const page = await this.get(tenantId, id);
    const [stats, sessions] = await Promise.all([
      this.autodialer.sessionStats(tenantId, page.id),
      this.autodialer.listSessions(tenantId, page.id, paging),
    ]);
    return { stats, sessions };
  }

  async previewToken(tenantId: string, id: string) {
    const page = await this.get(tenantId, id);
    const secret = resolveActionsTokenSecret(this.config);
    const minted = createSessionToken(secret, "preview", PREVIEW_TOKEN_TTL_SECONDS, tenantId, page.id);
    return { token: minted.token, expiresAt: new Date(minted.expiresAt).toISOString() };
  }

  // ── Public surface ─────────────────────────────────────────────────────────

  private async loadPublicPage(slug: string, previewToken?: string): Promise<PageRow> {
    const page = await this.prisma.actionPage.findUnique({ where: { publicSlug: slug } });
    // A draft page 404s exactly like a missing one — existence is not leaked —
    // unless a valid page-scoped preview token accompanies the request.
    if (!page) throw new NotFoundException("Page not found");
    if (page.status !== ActionPageStatus.PUBLISHED) {
      const secret = resolveActionsTokenSecret(this.config);
      const v = previewToken ? verifySessionToken(previewToken, secret, "preview") : null;
      const previewOk = v?.ok === true && v.tenantId === page.tenantId && v.subjectId === page.id;
      if (!previewOk) throw new NotFoundException("Page not found");
    }
    return page;
  }

  /** The public payload — copy + field config + brand + campaign kind ONLY. */
  async getPublicPage(slug: string, previewToken?: string) {
    const page = await this.loadPublicPage(slug, previewToken);
    const isRsvp = page.type === ActionPageType.EVENT_RSVP;
    // An RSVP page has no campaign and no targets, so don't pay for those lookups; a call page
    // has no event. Each branch resolves only what its own type can render.
    const [tenant, profile, campaign, targeting, flagOn, event] = await Promise.all([
      this.prisma.tenant.findUnique({
        where: { id: page.tenantId },
        select: { id: true, name: true, slug: true },
      }),
      this.prisma.orgProfile.findFirst({ where: { tenantId: page.tenantId }, select: BRAND_SELECT }),
      !isRsvp && page.campaignId
        ? this.autodialer.getCampaignSummary(page.tenantId, page.campaignId)
        : Promise.resolve(null),
      !isRsvp && page.campaignId
        ? this.autodialer.getPublicTargets(page.tenantId, page.campaignId)
        : Promise.resolve({ chooser: false, targets: [] }),
      this.flags.isEnabled("FEATURE_ACTIONS_CALLS", { tenantId: page.tenantId }),
      isRsvp && page.eventId ? this.events.getPublicEvent(page.eventId) : Promise.resolve(null),
    ]);
    return {
      page: {
        publicSlug: page.publicSlug,
        type: page.type,
        preview: page.status !== ActionPageStatus.PUBLISHED,
        headline: page.headline,
        body: page.body,
        ctaLabel: page.ctaLabel,
        successMessage: page.successMessage,
        collectName: page.collectName,
        collectEmail: page.collectEmail,
        collectPhone: page.collectPhone,
        allowPrefill: page.allowPrefill,
        requireCaptcha: page.requireCaptcha,
        callsEnabled:
          !isRsvp &&
          flagOn &&
          page.status === ActionPageStatus.PUBLISHED &&
          campaign?.status === DialerCampaignStatus.ACTIVE,
        // A preview never takes a real RSVP, and neither does a page whose event has ended or
        // been cancelled — the widget still renders the event, it just withholds the form.
        rsvpEnabled:
          isRsvp &&
          page.status === ActionPageStatus.PUBLISHED &&
          !!event &&
          event.derivedStatus !== "ENDED" &&
          event.derivedStatus !== "CANCELLED",
      },
      tenant: tenant ? { id: tenant.id, name: tenant.name, slug: tenant.slug, ...brandFields(profile) } : null,
      campaign: campaign
        ? {
            kind: campaign.kind,
            targetLabel: campaign.targetLabel,
            // Pinned member identities (photo included — never a number), and
            // whether this page's widget lets the caller find their own.
            targets: targeting.targets,
            chooser: targeting.chooser,
          }
        : null,
      event,
    };
  }

  /** Chooser search for the public widget — empty unless the campaign allows it. */
  async searchPublicTargets(slug: string, q: string, clientIp: string | null = null) {
    const page = await this.loadPublicPage(slug);
    if (!page.campaignId) return { targets: [] };
    // Bot-scrape protection: its own (looser) per-IP window — captcha rides
    // the route decorator like the auth flows.
    this.rateLimit.assertSearchWithinLimits(clientIp);
    return { targets: await this.autodialer.searchPublicTargets(page.tenantId, page.campaignId, q) };
  }

  async getFramePolicy(slug: string): Promise<{ embedDomains: string[] }> {
    const page = await this.loadPublicPage(slug);
    return { embedDomains: page.embedDomains };
  }

  /** Does `host` match the allowlist (exact, or one-level under a *.wildcard)? */
  private hostAllowed(host: string, allowlist: string[]): boolean {
    const h = host.toLowerCase().replace(/\.$/, "");
    return allowlist.some((entry) => {
      if (entry.startsWith("*.")) {
        const suffix = entry.slice(2);
        return h === suffix || h.endsWith(`.${suffix}`);
      }
      return h === entry;
    });
  }

  /**
   * Take an RSVP from a published EVENT_RSVP page.
   *
   * Deliberately the same door policy as a call session — previews never write, rate limits
   * come first, the captcha is enforced by the route guard, and the embed ancestor is checked —
   * because an RSVP form on someone else's site is exactly as abusable as a call button.
   *
   * The RSVP itself is handed straight to Events. Capacity, waitlisting, dedupe and the outbox
   * event live there and are not reimplemented here: a page pointed at a full event waitlists
   * precisely as the public events page does.
   */
  async createPublicRsvp(
    slug: string,
    dto: CreateActionRsvpDto,
    ctx: { clientIp: string | null },
  ) {
    const page = await this.loadPublicPage(slug);
    if (page.type !== ActionPageType.EVENT_RSVP) {
      throw new ApiHttpException("RSVP_DISABLED", "This page does not collect RSVPs.", 409);
    }
    if (page.status !== ActionPageStatus.PUBLISHED) {
      throw new ApiHttpException("RSVP_DISABLED", "RSVPs are disabled on previews.", 409);
    }
    if (!page.eventId) throw new ApiHttpException("RSVP_DISABLED", "This page has no event.", 409);

    // Rate limits BEFORE the write, same as calls.
    await this.rateLimit.assertWithinLimits(page.id, ctx.clientIp);

    const ancestor = dto.embedAncestor?.trim() || null;
    if (page.embedDomains.length > 0 && ancestor) {
      let host: string;
      try {
        host = new URL(ancestor.includes("://") ? ancestor : `https://${ancestor}`).hostname;
      } catch {
        throw new ApiHttpException("EMBED_NOT_ALLOWED", "This site may not embed this page.", 403);
      }
      if (!this.hostAllowed(host, page.embedDomains)) {
        throw new ApiHttpException("EMBED_NOT_ALLOWED", "This site may not embed this page.", 403);
      }
    }

    // The page's own field config decides what is mandatory — an organiser who turned email off
    // must not have the form reject for it. A name is always needed: the RSVP list is names.
    const supporter = dto.supporter ?? {};
    const missing: string[] = [];
    if (!supporter.name?.trim()) missing.push("name");
    if (page.collectEmail && !supporter.email?.trim()) missing.push("email");
    if (page.collectPhone && !supporter.phone?.trim()) missing.push("phone");
    if (missing.length) {
      throw new ApiHttpException("MISSING_FIELDS", `Missing required fields: ${missing.join(", ")}`, 400, { missing });
    }

    const rsvp = await this.events.rsvp(page.eventId, {
      name: supporter.name!.trim(),
      email: supporter.email?.trim() || null,
      phone: supporter.phone?.trim() || null,
      guests: dto.guests ?? null,
    });
    return { rsvpId: rsvp.id, status: rsvp.status, manageToken: rsvp.manageToken };
  }

  async createPublicCallSession(
    slug: string,
    dto: CreateCallSessionDto,
    ctx: { clientIp: string | null; captchaToken?: string },
  ) {
    const page = await this.loadPublicPage(slug);
    if (page.status !== ActionPageStatus.PUBLISHED) {
      // Preview pages render, but never place calls.
      throw new ApiHttpException("CALLS_DISABLED", "Calls are disabled on previews.", 409);
    }
    if (!(await this.flags.isEnabled("FEATURE_ACTIONS_CALLS", { tenantId: page.tenantId }))) {
      throw new ApiHttpException("CALLS_DISABLED", "Calling is paused for this page.", 409);
    }
    if (!page.campaignId) throw new ApiHttpException("CALLS_DISABLED", "This page has no calling campaign.", 409);

    // Rate limits BEFORE anything that costs money.
    await this.rateLimit.assertWithinLimits(page.id, ctx.clientIp);

    // Captcha: enforced by the globally-registered TurnstileGuard via
    // @RequireCaptcha("strict") on the route — the same posture as login.
    // Tokens are single-use, so the service must NOT verify a second time.

    // Embed-ancestor allowlist — defence in depth; the frame-ancestors CSP on
    // the embed route is the enforcement point (the browser refuses the frame).
    const ancestor = dto.embedAncestor?.trim() || null;
    if (page.embedDomains.length > 0 && ancestor) {
      let host: string;
      try {
        host = new URL(ancestor.includes("://") ? ancestor : `https://${ancestor}`).hostname;
      } catch {
        throw new ApiHttpException("EMBED_NOT_ALLOWED", "This site may not embed this page.", 403);
      }
      if (!this.hostAllowed(host, page.embedDomains)) {
        throw new ApiHttpException("EMBED_NOT_ALLOWED", "This site may not embed this page.", 403);
      }
    }

    const supporter = dto.supporter ?? {};
    const missing: string[] = [];
    if (page.collectName && !supporter.name?.trim()) missing.push("name");
    if (page.collectEmail && !supporter.email?.trim()) missing.push("email");
    if (page.collectPhone && !supporter.phone?.trim()) missing.push("phone");
    if (missing.length) {
      throw new ApiHttpException("MISSING_FIELDS", `Missing required fields: ${missing.join(", ")}`, 400, { missing });
    }

    const created = await this.autodialer.createPublicCallSession({
      tenantId: page.tenantId,
      campaignId: page.campaignId,
      actionPageId: page.id,
      supporter: {
        name: supporter.name?.trim() || undefined,
        email: supporter.email?.trim() || undefined,
        phone: supporter.phone?.trim() || undefined,
      },
      targetPoliticianId: dto.targetPoliticianId?.trim() || null,
      embedAncestor: ancestor,
      clientIp: ctx.clientIp,
    });

    return {
      sessionId: created.sessionId,
      voice: created.voiceToken,
      progress: {
        url: `/api/v1/actions/public/call-sessions/${created.sessionId}/events`,
        ...created.progressToken,
      },
      target: created.target,
    };
  }
}
