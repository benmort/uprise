import { Inject, Injectable, NotFoundException } from "@nestjs/common";
import { ConfigService } from "@nestjs/config";
import { randomBytes } from "node:crypto";
import { ActionPageStatus, DialerCampaignStatus, Prisma } from "@uprise/db";
import { EVENT_TYPES } from "@uprise/events";
import { PrismaService } from "../prisma/prisma.service";
import { OutboxService } from "../common/outbox/outbox.service";
import { FeatureFlagsService } from "../common/flags/feature-flags.service";
import { TurnstileService } from "../common/captcha/turnstile.service";
import { ApiHttpException } from "../common/http/api-response";
import { BRAND_SELECT, brandFields } from "../common/brand";
import { assertValidActionPageTransition } from "./action-page-state.machine";
import { AUTODIALER_FACADE, type AutodialerFacade } from "./autodialer.facade";
import { ActionsRateLimitService } from "./actions-rate-limit.service";
import { createSessionToken, resolveActionsTokenSecret, verifySessionToken } from "./session-token.util";
import { EMBED_DOMAIN_RE, type CreateCallSessionDto, type UpdateActionPageDto } from "./dto/actions.dto";

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
    const [tenant, profile, campaign, flagOn] = await Promise.all([
      this.prisma.tenant.findUnique({
        where: { id: page.tenantId },
        select: { id: true, name: true, slug: true },
      }),
      this.prisma.orgProfile.findFirst({ where: { tenantId: page.tenantId }, select: BRAND_SELECT }),
      page.campaignId ? this.autodialer.getCampaignSummary(page.tenantId, page.campaignId) : Promise.resolve(null),
      this.flags.isEnabled("FEATURE_ACTIONS_CALLS", { tenantId: page.tenantId }),
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
          flagOn && page.status === ActionPageStatus.PUBLISHED && campaign?.status === DialerCampaignStatus.ACTIVE,
      },
      tenant: tenant ? { id: tenant.id, name: tenant.name, slug: tenant.slug, ...brandFields(profile) } : null,
      campaign: campaign ? { kind: campaign.kind, targetLabel: campaign.targetLabel } : null,
    };
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

    // Captcha — strict (fail-closed) when the page requires it and verification
    // is configured for this environment: this endpoint spends tenant money.
    if (page.requireCaptcha && this.turnstile.isConfigured()) {
      const outcome = await this.turnstile.verify(ctx.captchaToken, ctx.clientIp ?? undefined);
      if (outcome !== "pass") {
        throw new ApiHttpException("CAPTCHA_FAILED", "Captcha verification failed — reload and try again.", 400);
      }
    }

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
    };
  }
}
