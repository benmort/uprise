import { ConfigService } from "@nestjs/config";
import { ActionPageStatus, DialerCampaignStatus } from "@uprise/db";
import { ActionsService } from "./actions.service";
import { createSessionToken } from "./session-token.util";
import type { ApiHttpException } from "../common/http/api-response";
import type { PublicActionEventView } from "./events.facade";

const SECRET = "actions-test-secret";

function basePage(overrides: Record<string, unknown> = {}) {
  return {
    id: "p1",
    tenantId: "t1",
    type: "CLICK_TO_CALL",
    status: ActionPageStatus.PUBLISHED,
    title: "Ring your MP",
    publicSlug: "slug-1",
    headline: "Ring your MP",
    body: "Tell them.",
    ctaLabel: "Make the call",
    successMessage: "Thanks!",
    collectName: true,
    collectEmail: false,
    collectPhone: false,
    allowPrefill: true,
    requireCaptcha: false,
    embedDomains: [] as string[],
    campaignId: "dc1",
    publishedAt: new Date(),
    archivedAt: null,
    createdAt: new Date(),
    updatedAt: new Date(),
    ...overrides,
  };
}

function makeHarness(pageOverrides: Record<string, unknown> = {}) {
  const page = basePage(pageOverrides);
  const tx = {
    actionPage: {
      create: jest.fn(async ({ data }: { data: Record<string, unknown> }) => ({ ...basePage(), ...data, id: "p-new" })),
      update: jest.fn(async ({ data }: { data: Record<string, unknown> }) => ({ ...page, ...data })),
    },
    $queryRaw: jest.fn(async () => [{ id: page.id, status: page.status }]),
  };
  const prisma = {
    actionPage: {
      findFirst: jest.fn(async () => page),
      findUnique: jest.fn(async () => page),
      findMany: jest.fn(async () => [page]),
      count: jest.fn(async () => 1),
      update: jest.fn(async ({ data }: { data: Record<string, unknown> }) => ({ ...page, ...data })),
    },
    tenant: { findUnique: jest.fn(async () => ({ id: "t1", name: "Org", slug: "org" })) },
    orgProfile: { findFirst: jest.fn(async () => null) },
    $transaction: jest.fn(async (fn: (t: typeof tx) => unknown) => fn(tx)),
  };
  const outbox = { append: jest.fn() };
  const flags = { isEnabled: jest.fn(async () => true) };
  const turnstile = { isConfigured: jest.fn(() => false), verify: jest.fn(async () => "pass") };
  const rateLimit = { assertWithinLimits: jest.fn(async () => undefined) };
  const config = { get: (k: string) => (k === "ACTIONS_SESSION_TOKEN_SECRET" ? SECRET : undefined) };
  const facade = {
    getCampaignSummary: jest.fn(async () => ({
      id: "dc1",
      name: "Transfer",
      kind: "TRANSFER" as const,
      status: DialerCampaignStatus.ACTIVE,
      targetLabel: "1 configured target",
      voiceReady: true,
    })),
    listCampaignSummaries: jest.fn(async () => []),
    createPublicCallSession: jest.fn(async () => ({
      sessionId: "s1",
      voiceToken: { token: "voice-jwt", expiresAt: "2100-01-01T00:00:00.000Z" },
      progressToken: { token: "progress-token", expiresAt: "2100-01-01T00:00:00.000Z" },
    })),
    getPublicTargets: jest.fn(async () => ({ chooser: false, targets: [] })),
    searchPublicTargets: jest.fn(async () => []),
    countSessions: jest.fn(async () => 0),
    listSessions: jest.fn(async () => []),
    sessionStats: jest.fn(async () => ({ started: 0, connected: 0, bridged: 0, averageDurationSeconds: null })),
  };
  // Events facade — an open, publicly-RSVP-able event by default, so EVENT_RSVP tests only
  // override the case they are about.
  const events = {
    getPublicEvent: jest.fn(async (): Promise<PublicActionEventView | null> => ({
      id: "ev1",
      title: "Community forum",
      description: null,
      location: "Town hall",
      startsAt: "2100-01-01T09:00:00.000Z",
      endsAt: "2100-01-01T11:00:00.000Z",
      capacity: 50,
      spotsLeft: 12,
      attendeeCount: 38,
      imageUrl: null,
      derivedStatus: "UPCOMING",
    })),
    checkPublishable: jest.fn(async () => ({
      exists: true,
      publiclyRsvpable: true,
      ended: false,
      cancelled: false,
    })),
    rsvp: jest.fn(async () => ({ id: "rsvp1", status: "CONFIRMED", manageToken: "mt1" })),
  };
  const service = new ActionsService(
    prisma as never,
    outbox as never,
    flags as never,
    turnstile as never,
    rateLimit as never,
    config as never as ConfigService,
    facade as never,
    events as never,
  );
  return { service, prisma, tx, outbox, flags, turnstile, rateLimit, facade, events, page };
}

function errCode(err: unknown): string | undefined {
  const e = err as ApiHttpException;
  const res = e.getResponse?.() as { error?: { code?: string } } | undefined;
  return res?.error?.code;
}

describe("ActionsService", () => {
  describe("create", () => {
    it("mints an unguessable base64url slug and appends the outbox event in the same tx", async () => {
      const { service, tx, outbox } = makeHarness();
      await service.create("t1", "New page");
      const data = tx.actionPage.create.mock.calls[0][0].data as { publicSlug: string };
      expect(data.publicSlug).toMatch(/^[A-Za-z0-9_-]{22}$/);
      expect(outbox.append).toHaveBeenCalledWith(tx, expect.objectContaining({ eventType: "actions.page.created" }));
    });
  });

  describe("update", () => {
    it("rejects malformed embed domains with INVALID_EMBED_DOMAIN", async () => {
      const { service } = makeHarness();
      for (const bad of ["https://x.org", "x.org/path", "x.org:8080", "bad domain", "x;y.org"]) {
        try {
          await service.update("t1", "p1", { embedDomains: [bad] });
          throw new Error(`expected reject for ${bad}`);
        } catch (err) {
          expect(errCode(err)).toBe("INVALID_EMBED_DOMAIN");
        }
      }
    });

    it("accepts bare hostnames, wildcards and localhost", async () => {
      const { service, prisma } = makeHarness();
      await service.update("t1", "p1", { embedDomains: ["example.org", "*.example.org", "localhost"] });
      expect(prisma.actionPage.update).toHaveBeenCalled();
    });

    it("refuses to attach a campaign the facade cannot see", async () => {
      const { service, facade } = makeHarness();
      (facade.getCampaignSummary as jest.Mock).mockResolvedValueOnce(null);
      await expect(service.update("t1", "p1", { campaignId: "ghost" })).rejects.toBeDefined();
    });
  });

  describe("publish gate", () => {
    it("collects every failing check into a 422", async () => {
      const { service, flags, facade } = makeHarness({
        status: ActionPageStatus.DRAFT,
        headline: null,
        ctaLabel: null,
        campaignId: null,
      });
      (flags.isEnabled as jest.Mock).mockResolvedValueOnce(false);
      try {
        await service.publish("t1", "p1");
        throw new Error("expected 422");
      } catch (err) {
        expect(errCode(err)).toBe("ACTION_PAGE_NOT_PUBLISHABLE");
        const details = (err as ApiHttpException).getResponse() as { error: { details: { problems: string[] } } };
        expect(details.error.details.problems.length).toBeGreaterThanOrEqual(3);
      }
      expect(facade.createPublicCallSession).not.toHaveBeenCalled();
    });

    it("blocks publish when the campaign is not active or not voice-ready", async () => {
      const { service, facade } = makeHarness({ status: ActionPageStatus.DRAFT });
      (facade.getCampaignSummary as jest.Mock).mockResolvedValueOnce({
        id: "dc1",
        name: "x",
        kind: "TRANSFER",
        status: DialerCampaignStatus.DRAFT,
        targetLabel: null,
        voiceReady: false,
      });
      try {
        await service.publish("t1", "p1");
        throw new Error("expected 422");
      } catch (err) {
        expect(errCode(err)).toBe("ACTION_PAGE_NOT_PUBLISHABLE");
      }
    });

    it("publishes through the FSM with a FOR UPDATE load and the published event", async () => {
      const { service, tx, outbox } = makeHarness({ status: ActionPageStatus.DRAFT });
      await service.publish("t1", "p1");
      expect(tx.$queryRaw).toHaveBeenCalled();
      expect(outbox.append).toHaveBeenCalledWith(tx, expect.objectContaining({ eventType: "actions.page.published" }));
    });

    it("rejects an illegal FSM transition (archived → published)", async () => {
      const { service } = makeHarness({ status: ActionPageStatus.ARCHIVED, headline: "h", ctaLabel: "c" });
      await expect(service.publish("t1", "p1")).rejects.toBeDefined();
    });
  });

  describe("getPublicPage", () => {
    it("404s a DRAFT page exactly like a missing one", async () => {
      const { service } = makeHarness({ status: ActionPageStatus.DRAFT });
      await expect(service.getPublicPage("slug-1")).rejects.toMatchObject({ status: 404 });
    });

    it("renders a DRAFT page with a valid page-scoped preview token, marked preview", async () => {
      const { service } = makeHarness({ status: ActionPageStatus.DRAFT });
      const token = createSessionToken(SECRET, "preview", 60, "t1", "p1").token;
      const out = await service.getPublicPage("slug-1", token);
      expect(out.page.preview).toBe(true);
      expect(out.page.callsEnabled).toBe(false);
    });

    it("rejects a preview token for a DIFFERENT page", async () => {
      const { service } = makeHarness({ status: ActionPageStatus.DRAFT });
      const token = createSessionToken(SECRET, "preview", 60, "t1", "other-page").token;
      await expect(service.getPublicPage("slug-1", token)).rejects.toMatchObject({ status: 404 });
    });

    it("leaks nothing internal on the public payload", async () => {
      const { service } = makeHarness();
      const out = await service.getPublicPage("slug-1");
      const serialised = JSON.stringify(out);
      expect(serialised).not.toContain("dc1"); // campaignId
      expect(serialised).not.toContain("embedDomains");
      expect(serialised).not.toContain("publishedAt");
      expect(out.campaign).toEqual({
        kind: "TRANSFER",
        targetLabel: "1 configured target",
        targets: [],
        chooser: false,
      });
      expect(out.page.callsEnabled).toBe(true);
      expect(out.tenant).toMatchObject({ name: "Org", slug: "org" });
    });
  });

  describe("createPublicCallSession", () => {
    it("checks rate limits BEFORE the facade mints anything", async () => {
      const { service, rateLimit, facade } = makeHarness();
      const order: string[] = [];
      (rateLimit.assertWithinLimits as jest.Mock).mockImplementation(async () => {
        order.push("rate");
      });
      (facade.createPublicCallSession as jest.Mock).mockImplementation(async () => {
        order.push("facade");
        return {
          sessionId: "s1",
          voiceToken: { token: "v", expiresAt: "x" },
          progressToken: { token: "p", expiresAt: "x" },
        };
      });
      await service.createPublicCallSession("slug-1", { supporter: { name: "Sam" } }, { clientIp: "1.1.1.1" });
      expect(order).toEqual(["rate", "facade"]);
    });

    it("propagates a 429 without ever calling the facade", async () => {
      const { service, rateLimit, facade } = makeHarness();
      (rateLimit.assertWithinLimits as jest.Mock).mockRejectedValueOnce(
        Object.assign(new Error("limited"), { status: 429 }),
      );
      await expect(
        service.createPublicCallSession("slug-1", { supporter: { name: "Sam" } }, { clientIp: "1.1.1.1" }),
      ).rejects.toBeDefined();
      expect(facade.createPublicCallSession).not.toHaveBeenCalled();
    });

    it("captcha rides the route decorator (strict), not a second in-service verify", () => {
      // Single-use tokens: the globally-registered TurnstileGuard verifies via
      // @RequireCaptcha("strict") — the service must NOT verify again.
      // eslint-disable-next-line @typescript-eslint/no-var-requires
      const { REQUIRE_CAPTCHA_KEY } = require("../common/captcha/require-captcha.decorator");
      // eslint-disable-next-line @typescript-eslint/no-var-requires
      const { PublicActionsController } = require("./public-actions.controller");
      expect(Reflect.getMetadata(REQUIRE_CAPTCHA_KEY, PublicActionsController.prototype.createCallSession)).toBe(
        "strict",
      );
      expect(Reflect.getMetadata(REQUIRE_CAPTCHA_KEY, PublicActionsController.prototype.searchTargets)).toBe("soft");
    });

    it("enforces the embed-ancestor allowlist (wildcard aware) as defence in depth", async () => {
      const { service, facade } = makeHarness({ embedDomains: ["example.org", "*.partner.org"] });
      await expect(
        service.createPublicCallSession(
          "slug-1",
          { supporter: { name: "Sam" }, embedAncestor: "https://evil.example" },
          { clientIp: "1.1.1.1" },
        ),
      ).rejects.toBeDefined();
      expect(facade.createPublicCallSession).not.toHaveBeenCalled();

      await service.createPublicCallSession(
        "slug-1",
        { supporter: { name: "Sam" }, embedAncestor: "https://deep.partner.org" },
        { clientIp: "1.1.1.1" },
      );
      expect(facade.createPublicCallSession).toHaveBeenCalledTimes(1);
    });

    it("requires the collect-toggled supporter fields", async () => {
      const { service } = makeHarness({ collectName: true, collectEmail: true });
      try {
        await service.createPublicCallSession("slug-1", { supporter: { name: "Sam" } }, { clientIp: "1.1.1.1" });
        throw new Error("expected MISSING_FIELDS");
      } catch (err) {
        expect(errCode(err)).toBe("MISSING_FIELDS");
      }
    });

    it("returns the session + voice + progress contract shape", async () => {
      const { service } = makeHarness();
      const out = await service.createPublicCallSession(
        "slug-1",
        { supporter: { name: "Sam" } },
        { clientIp: "1.1.1.1" },
      );
      expect(out).toEqual({
        sessionId: "s1",
        voice: { token: "voice-jwt", expiresAt: "2100-01-01T00:00:00.000Z" },
        progress: {
          url: "/api/v1/actions/public/call-sessions/s1/events",
          token: "progress-token",
          expiresAt: "2100-01-01T00:00:00.000Z",
        },
      });
    });

    it("refuses calls when the plan flag is off", async () => {
      const { service, flags, facade } = makeHarness();
      (flags.isEnabled as jest.Mock).mockResolvedValueOnce(false);
      try {
        await service.createPublicCallSession("slug-1", { supporter: { name: "Sam" } }, { clientIp: "1.1.1.1" });
        throw new Error("expected CALLS_DISABLED");
      } catch (err) {
        expect(errCode(err)).toBe("CALLS_DISABLED");
      }
      expect(facade.createPublicCallSession).not.toHaveBeenCalled();
    });
  });
});

describe("ActionsService — EVENT_RSVP pages", () => {
  /** A published RSVP page pointed at an open event — overrides fed straight to the harness. */
  const rsvpPage = (over: Record<string, unknown> = {}) => ({
    type: "EVENT_RSVP",
    eventId: "ev1",
    campaignId: null,
    embedDomains: [],
    collectName: true,
    collectEmail: true,
    collectPhone: false,
    ...over,
  });

  const openEvent = { exists: true, publiclyRsvpable: true, ended: false, cancelled: false };

  it("refuses to publish for an event that has finished", async () => {
    const { service, events } = makeHarness(rsvpPage({ status: ActionPageStatus.DRAFT }));
    events.checkPublishable.mockResolvedValue({ ...openEvent, ended: true });
    // Taking names for an event that is already over is the failure this guards.
    await expect(service.publish("t1", "p1")).rejects.toMatchObject({ status: 422 });
  });

  it("refuses to publish when the event is not publicly RSVP-able", async () => {
    const { service, events } = makeHarness(rsvpPage({ status: ActionPageStatus.DRAFT }));
    events.checkPublishable.mockResolvedValue({ ...openEvent, publiclyRsvpable: false });
    // Otherwise the page renders a form the event itself would reject.
    await expect(service.publish("t1", "p1")).rejects.toMatchObject({ status: 422 });
  });

  it("publishes without a calling campaign or the calls flag", async () => {
    // The point of branching the publish gate: an RSVP page has no campaign, and the
    // click-to-call plan flag must not gate it.
    const { service, events, flags, facade } = makeHarness(rsvpPage({ status: ActionPageStatus.DRAFT }));
    events.checkPublishable.mockResolvedValue(openEvent);
    flags.isEnabled.mockResolvedValue(false);

    await expect(service.publish("t1", "p1")).resolves.toBeDefined();
    expect(facade.getCampaignSummary).not.toHaveBeenCalled();
  });

  it("serves the event on the public payload and skips the campaign lookups", async () => {
    const { service, facade, events } = makeHarness(rsvpPage());

    const payload = await service.getPublicPage("slug");

    expect(payload.event).toMatchObject({ id: "ev1", title: "Community forum", spotsLeft: 12 });
    expect(payload.page.rsvpEnabled).toBe(true);
    expect(payload.page.callsEnabled).toBe(false);
    expect(payload.campaign).toBeNull();
    expect(facade.getPublicTargets).not.toHaveBeenCalled();
    expect(events.getPublicEvent).toHaveBeenCalledWith("ev1");
  });

  it("withholds the form on a preview", async () => {
    const { service } = makeHarness(rsvpPage({ status: ActionPageStatus.DRAFT }));
    const token = createSessionToken(SECRET, "preview", 60, "t1", "p1").token;
    const preview = await service.getPublicPage("slug-1", token);
    expect(preview.page.preview).toBe(true);
    expect(preview.page.rsvpEnabled).toBe(false);
  });

  it("still renders a finished event, but without the form", async () => {
    const { service, events } = makeHarness(rsvpPage());
    events.getPublicEvent.mockResolvedValue({
      id: "ev1",
      title: "Community forum",
      description: null,
      location: null,
      startsAt: "2000-01-01T00:00:00.000Z",
      endsAt: "2000-01-01T01:00:00.000Z",
      capacity: null,
      spotsLeft: null,
      attendeeCount: 3,
      imageUrl: null,
      derivedStatus: "ENDED",
    });

    const ended = await service.getPublicPage("slug");
    // People should see WHY there is no form, so the event still renders.
    expect(ended.event).toMatchObject({ derivedStatus: "ENDED" });
    expect(ended.page.rsvpEnabled).toBe(false);
  });

  it("hands the RSVP to Events rather than writing one itself", async () => {
    const { service, events, rateLimit } = makeHarness(rsvpPage());

    const res = await service.createPublicRsvp(
      "slug",
      { supporter: { name: "Ada", email: "ada@example.org" } } as never,
      { clientIp: "1.2.3.4" },
    );

    // Rate limit before the write, and capacity/waitlisting left to the events domain.
    expect(rateLimit.assertWithinLimits).toHaveBeenCalled();
    expect(events.rsvp).toHaveBeenCalledWith(
      "ev1",
      expect.objectContaining({ name: "Ada", email: "ada@example.org" }),
    );
    expect(res).toMatchObject({ rsvpId: "rsvp1", status: "CONFIRMED" });
  });

  it("takes no RSVP for an unpublished page at all", async () => {
    // The submit route carries no preview token, so a DRAFT page is not publicly addressable:
    // it 404s at load, before the service's own preview guard. Same posture as call sessions.
    const { service } = makeHarness(rsvpPage({ status: ActionPageStatus.DRAFT }));
    await expect(
      service.createPublicRsvp("slug", { supporter: { name: "Ada" } } as never, { clientIp: null }),
    ).rejects.toMatchObject({ status: 404 });
  });

  it("refuses an RSVP against a click-to-call page", async () => {
    const { service } = makeHarness({ type: "CLICK_TO_CALL" });
    await expect(
      service.createPublicRsvp("slug", { supporter: { name: "Ada" } } as never, { clientIp: null }),
    ).rejects.toMatchObject({ status: 409 });
  });

  it("enforces the fields the page says it collects", async () => {
    // collectEmail is on, so an RSVP without one is incomplete; a page with it off must not.
    const withEmail = makeHarness(rsvpPage());
    await expect(
      withEmail.service.createPublicRsvp("slug", { supporter: { name: "Ada" } } as never, { clientIp: null }),
    ).rejects.toMatchObject({ status: 400 });

    const withoutEmail = makeHarness(rsvpPage({ collectEmail: false }));
    await expect(
      withoutEmail.service.createPublicRsvp("slug", { supporter: { name: "Ada" } } as never, { clientIp: null }),
    ).resolves.toMatchObject({ rsvpId: "rsvp1" });
  });
});
