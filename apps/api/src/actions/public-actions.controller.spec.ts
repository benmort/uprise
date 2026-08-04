import { EventEmitter } from "node:events";
import { PublicActionsController } from "./public-actions.controller";
import { createSessionToken } from "./session-token.util";

const SECRET = "public-controller-secret";

function makeRes() {
  return {
    status: jest.fn().mockReturnThis(),
    json: jest.fn(),
    setHeader: jest.fn(),
    flushHeaders: jest.fn(),
    write: jest.fn(),
    end: jest.fn(),
  };
}

function makeReq(headers: Record<string, string | string[]> = {}) {
  const req = new EventEmitter() as EventEmitter & {
    headers: Record<string, string | string[]>;
    socket: { remoteAddress?: string };
  };
  req.headers = headers;
  req.socket = { remoteAddress: "9.9.9.9" };
  return req;
}

function makeController() {
  const actions = {
    getPublicPage: jest.fn().mockResolvedValue({ page: { publicSlug: "s" } }),
    getFramePolicy: jest.fn().mockResolvedValue({ embedDomains: [] }),
    createPublicCallSession: jest.fn().mockResolvedValue({ sessionId: "s1" }),
  };
  const prisma = { dialerSessionEvent: { findMany: jest.fn().mockResolvedValue([]) } };
  const config = { get: (k: string) => (k === "ACTIONS_SESSION_TOKEN_SECRET" ? SECRET : undefined) };
  const c = new PublicActionsController(actions as never, prisma as never, config as never);
  return { c, actions, prisma };
}

describe("PublicActionsController", () => {
  it("getPage delegates slug + previewToken to the service (404-for-draft lives there)", async () => {
    const { c, actions } = makeController();
    await c.getPage("slug-1", "tok");
    expect(actions.getPublicPage).toHaveBeenCalledWith("slug-1", "tok");
  });

  it("framePolicy delegates and is declared short-cacheable", async () => {
    const { c, actions } = makeController();
    await c.framePolicy("slug-1");
    expect(actions.getFramePolicy).toHaveBeenCalledWith("slug-1");
    const headers = Reflect.getMetadata("__headers__", PublicActionsController.prototype.framePolicy) as Array<{
      name: string;
      value: string;
    }>;
    expect(headers).toContainEqual({ name: "Cache-Control", value: "public, max-age=60" });
  });

  it("createCallSession extracts the first x-forwarded-for hop and the Turnstile header", async () => {
    const { c, actions } = makeController();
    const req = makeReq({
      "x-forwarded-for": "203.0.113.7, 10.0.0.1",
      "cf-turnstile-response": " ts-token ",
    });
    await c.createCallSession("slug-1", { supporter: { name: "Sam" } } as never, req as never);
    expect(actions.createPublicCallSession).toHaveBeenCalledWith(
      "slug-1",
      { supporter: { name: "Sam" } },
      { clientIp: "203.0.113.7", captchaToken: "ts-token" },
    );
  });

  it("createCallSession falls back to the socket address with no forwarding header", async () => {
    const { c, actions } = makeController();
    await c.createCallSession("slug-1", {} as never, makeReq() as never);
    expect(actions.createPublicCallSession).toHaveBeenCalledWith("slug-1", {}, {
      clientIp: "9.9.9.9",
      captchaToken: undefined,
    });
  });

  describe("events (SSE)", () => {
    it("401s a missing token", async () => {
      const { c } = makeController();
      const res = makeRes();
      await c.events("s1", undefined as never, undefined, makeReq() as never, res as never);
      expect(res.status).toHaveBeenCalledWith(401);
      expect(res.json).toHaveBeenCalledWith(
        expect.objectContaining({ ok: false, error: expect.objectContaining({ code: "INVALID_SESSION_TOKEN" }) }),
      );
    });

    it("401s a preview token — purpose binding holds on the stream", async () => {
      const { c } = makeController();
      const res = makeRes();
      const preview = createSessionToken(SECRET, "preview", 60, "t1", "s1").token;
      await c.events("s1", preview, undefined, makeReq() as never, res as never);
      expect(res.status).toHaveBeenCalledWith(401);
    });

    it("401s a progress token for a DIFFERENT session", async () => {
      const { c } = makeController();
      const res = makeRes();
      const other = createSessionToken(SECRET, "progress", 60, "t1", "other-session").token;
      await c.events("s1", other, undefined, makeReq() as never, res as never);
      expect(res.status).toHaveBeenCalledWith(401);
    });

    it("streams ledger rows after the resume cursor, tenant-scoped by the token", async () => {
      const { c, prisma } = makeController();
      const res = makeRes();
      const req = makeReq({ "last-event-id": "5" });
      prisma.dialerSessionEvent.findMany.mockResolvedValue([
        { seq: BigInt(6), name: "session.started", payload: { at: "now" } },
      ]);
      const token = createSessionToken(SECRET, "progress", 60, "t1", "s1").token;
      const done = c.events("s1", token, undefined, req as never, res as never);
      // Let the first poll land, then close the client so the loop exits fast.
      await new Promise((r) => setTimeout(r, 20));
      req.emit("close");
      await done;

      expect(prisma.dialerSessionEvent.findMany).toHaveBeenCalledWith(
        expect.objectContaining({
          where: { sessionId: "s1", tenantId: "t1", seq: { gt: BigInt(5) } },
          orderBy: { seq: "asc" },
          take: 100,
        }),
      );
      const frames = res.write.mock.calls.map((args) => args[0] as string).join("");
      expect(frames).toContain("id: 6\nevent: session.started\ndata: {\"at\":\"now\"}\n\n");
      expect(res.setHeader).toHaveBeenCalledWith("Content-Type", "text/event-stream");
      expect(res.end).toHaveBeenCalled();
    });
  });
});
