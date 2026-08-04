import "reflect-metadata";
import { NotFoundException, UnauthorizedException } from "@nestjs/common";
import { DialerIvrController } from "./dialer-ivr.controller";
import { validateTwilioWebhookSignature } from "../common/webhooks/twilio-signature.util";

jest.mock("../common/webhooks/twilio-signature.util", () => ({
  validateTwilioWebhookSignature: jest.fn(),
}));

const mockValidate = validateTwilioWebhookSignature as jest.Mock;

const PLATFORM_SID = "ACplatform";
const TENANT_SID = "ACtenant1";

function setup(over: { platformSid?: string } = {}) {
  const ctx = {
    campaign: { id: "dc1", tenantId: "t1" },
    attempt: { id: "at1" },
    session: null,
    callId: "call1",
    language: "en",
  };
  const flow = {
    loadContext: jest.fn().mockResolvedValue(ctx),
    handleAnswer: jest.fn().mockResolvedValue("<Response><Say>hi</Say></Response>"),
    renderSurveyQuestion: jest.fn().mockResolvedValue("<Response><Gather/></Response>"),
    handleSurveyResult: jest.fn().mockResolvedValue("<Response><Hangup/></Response>"),
    handleRedirect: jest.fn().mockResolvedValue("<Response><Dial>+61290001111</Dial></Response>"),
    renderElectoralPostcode: jest.fn().mockResolvedValue("<Response><Gather/></Response>"),
    handleElectoralLookup: jest.fn().mockResolvedValue("<Response><Gather/></Response>"),
    handleSelectElectorate: jest.fn().mockResolvedValue("<Response><Dial>+61262774022</Dial></Response>"),
    handleSessionAnswer: jest.fn().mockResolvedValue("<Response><Redirect/></Response>"),
    renderConferenceJoin: jest.fn().mockResolvedValue("<Response><Dial><Conference/></Dial></Response>"),
    handleConferenceStatus: jest.fn().mockResolvedValue(undefined),
  };
  const prisma = { telephonyAccount: { findFirst: jest.fn().mockResolvedValue(null) } };
  const telephonyAuth = { tokenForAccountSid: jest.fn().mockResolvedValue("token-1") };
  const config = {
    get: jest.fn((key: string, def?: string) =>
      key === "TWILIO_ACCOUNT_SID" ? (over.platformSid ?? PLATFORM_SID) : (def ?? ""),
    ),
  };
  const logger = { debug: jest.fn(), log: jest.fn(), warn: jest.fn(), error: jest.fn() };
  const controller = new DialerIvrController(
    flow as never,
    prisma as never,
    telephonyAuth as never,
    config as never,
    logger as never,
  );
  return { controller, ctx, flow, prisma, telephonyAuth, config, logger };
}

const req = {} as never;
const body = (over: Record<string, unknown> = {}) => ({ AccountSid: PLATFORM_SID, CallSid: "CA1", ...over });

beforeEach(() => {
  jest.clearAllMocks();
});

describe("DialerIvrController auth", () => {
  it("resolves the signing account's token and validates fail-closed", async () => {
    const { controller, telephonyAuth, flow } = setup();
    await controller.answer(req, body(), "dc1", "at1", undefined);
    expect(telephonyAuth.tokenForAccountSid).toHaveBeenCalledWith(PLATFORM_SID);
    expect(mockValidate).toHaveBeenCalledWith(req, body(), "token-1");
    expect(flow.handleAnswer).toHaveBeenCalled();
  });

  it("an invalid signature refuses the request — no TwiML, no flow", async () => {
    const { controller, flow } = setup();
    mockValidate.mockImplementationOnce(() => {
      throw new UnauthorizedException("Invalid Twilio signature");
    });
    await expect(controller.answer(req, body(), "dc1", "at1", undefined)).rejects.toThrow(
      UnauthorizedException,
    );
    expect(flow.handleAnswer).not.toHaveBeenCalled();
  });

  it("refuses a foreign tenant's BYO account driving this campaign", async () => {
    const { controller, prisma, flow, logger } = setup();
    prisma.telephonyAccount.findFirst.mockResolvedValue({ accountSid: TENANT_SID, tenantId: "t-other" });
    await expect(
      controller.answer(req, body({ AccountSid: TENANT_SID }), "dc1", "at1", undefined),
    ).rejects.toThrow(NotFoundException);
    expect(flow.handleAnswer).not.toHaveBeenCalled();
    expect(logger.warn).toHaveBeenCalled();
  });

  it("refuses an AccountSid that maps to no known account", async () => {
    const { controller } = setup();
    await expect(
      controller.answer(req, body({ AccountSid: "ACunknown" }), "dc1", "at1", undefined),
    ).rejects.toThrow(NotFoundException);
  });

  it("accepts the campaign tenant's own subaccount", async () => {
    const { controller, prisma, flow } = setup();
    prisma.telephonyAccount.findFirst.mockResolvedValue({ accountSid: TENANT_SID, tenantId: "t1" });
    await controller.answer(req, body({ AccountSid: TENANT_SID }), "dc1", "at1", undefined);
    expect(flow.handleAnswer).toHaveBeenCalled();
  });
});

describe("DialerIvrController routes", () => {
  it("answer delegates the Twilio body to the flow with the loaded context", async () => {
    const { controller, ctx, flow } = setup();
    const twiml = await controller.answer(
      req,
      body({ AnsweredBy: "human" }),
      "dc1",
      "at1",
      undefined,
    );
    expect(flow.loadContext).toHaveBeenCalledWith({
      campaignId: "dc1",
      attemptId: "at1",
      sessionId: undefined,
    });
    expect(flow.handleAnswer).toHaveBeenCalledWith(ctx, body({ AnsweredBy: "human" }));
    expect(twiml).toContain("<Say>hi</Say>");
  });

  it("survey renders the requested question; missing q fails soft", async () => {
    const { controller, ctx, flow } = setup();
    await controller.survey(req, body(), "q1", "dc1", "at1", undefined);
    expect(flow.renderSurveyQuestion).toHaveBeenCalledWith(ctx, "q1");
    const soft = await controller.survey(req, body(), undefined, "dc1", "at1", undefined);
    expect(soft).toContain("<Hangup/>");
    expect(soft).toContain("<Say>");
  });

  it("survey-result forwards the digits", async () => {
    const { controller, ctx, flow } = setup();
    await controller.surveyResult(req, body({ Digits: "1" }), "q1", "dc1", "at1", undefined);
    expect(flow.handleSurveyResult).toHaveBeenCalledWith(ctx, "q1", body({ Digits: "1" }));
  });

  it("redirect forwards the target override and data blob", async () => {
    const { controller, ctx, flow } = setup();
    await controller.redirect(req, body(), "dc1", "at1", undefined, "+61290002222", "payload");
    expect(flow.handleRedirect).toHaveBeenCalledWith(ctx, body(), {
      target_number: "+61290002222",
      data: "payload",
    });
  });

  it("session-answer takes the session id from the SIGNED client identity, never a param", async () => {
    const { controller, ctx, flow } = setup();
    (ctx.campaign as { tenantId: string }).tenantId = "t9";
    const sessionBody = body({ From: "client:sSESS9.tt9", CallSid: "CAweb" });
    await controller.sessionAnswer(req, sessionBody);
    expect(flow.loadContext).toHaveBeenCalledWith({ sessionId: "SESS9" });
    expect(flow.handleSessionAnswer).toHaveBeenCalledWith(ctx, sessionBody);
  });

  it("session-answer refuses an identity whose tenant differs from the campaign's", async () => {
    const { controller, flow } = setup(); // ctx tenant t1
    await expect(
      controller.sessionAnswer(req, body({ From: "client:sSESS9.tother" })),
    ).rejects.toThrow(NotFoundException);
    expect(flow.handleSessionAnswer).not.toHaveBeenCalled();
  });

  it("session-answer with a malformed identity still validates the signature, then fails soft", async () => {
    const { controller, flow } = setup();
    const twiml = await controller.sessionAnswer(req, body({ From: "+61400000000" }));
    expect(mockValidate).toHaveBeenCalled();
    expect(twiml).toContain("<Hangup/>");
    expect(flow.handleSessionAnswer).not.toHaveBeenCalled();
  });

  it("conference-join returns the flow's TwiML; conference-status swallows handler crashes with empty TwiML", async () => {
    const { controller, ctx, flow } = setup();
    const twiml = await controller.conferenceJoin(req, body(), "sess1", "dc1");
    expect(flow.loadContext).toHaveBeenCalledWith({ campaignId: "dc1", sessionId: "sess1" });
    expect(twiml).toContain("<Conference/>");

    flow.handleConferenceStatus.mockRejectedValue(new Error("boom"));
    const status = await controller.conferenceStatus(
      req,
      body({ StatusCallbackEvent: "conference-end" }),
      "sess1",
      "dc1",
    );
    expect(status).toContain("<Response/>");
    expect(flow.handleConferenceStatus).toHaveBeenCalledWith(ctx, expect.anything());
  });

  it("the electoral routes delegate to their flow handlers with the loaded context", async () => {
    const { controller, ctx, flow } = setup();
    await controller.electoralPostcode(req, body(), "dc1", "at1", undefined);
    expect(flow.renderElectoralPostcode).toHaveBeenCalledWith(ctx);
    await controller.electoralLookup(req, body({ Digits: "3058" }), "dc1", "at1", undefined);
    expect(flow.handleElectoralLookup).toHaveBeenCalledWith(ctx, body({ Digits: "3058" }));
    await controller.selectElectorate(req, body({ Digits: "2" }), "dc1", "at1", undefined);
    expect(flow.handleSelectElectorate).toHaveBeenCalledWith(ctx, body({ Digits: "2" }));
  });

  it("an electoral flow crash still answers Twilio with valid TwiML (fail-soft)", async () => {
    const { controller, flow } = setup();
    flow.handleElectoralLookup.mockRejectedValue(new Error("lookup down"));
    const twiml = await controller.electoralLookup(req, body({ Digits: "3058" }), "dc1", "at1", undefined);
    expect(twiml).toContain("<Hangup/>");
  });

  it("a flow crash still answers Twilio with valid TwiML (fail-soft)", async () => {
    const { controller, flow, logger } = setup();
    flow.handleAnswer.mockRejectedValue(new Error("boom"));
    const twiml = await controller.answer(req, body(), "dc1", "at1", undefined);
    expect(twiml).toContain("<Say>");
    expect(twiml).toContain("<Hangup/>");
    expect(logger.error).toHaveBeenCalledWith(
      "autodialer",
      "IVR answer failed",
      undefined,
      expect.objectContaining({ error: expect.stringContaining("boom") }),
    );
  });

  it("every route declares the application/xml content type", () => {
    for (const method of [
      "answer",
      "survey",
      "surveyResult",
      "redirect",
      "electoralPostcode",
      "electoralLookup",
      "selectElectorate",
      "sessionAnswer",
      "conferenceJoin",
      "conferenceStatus",
    ]) {
      const headers = Reflect.getMetadata(
        "__headers__",
        DialerIvrController.prototype[method as keyof DialerIvrController] as never,
      ) as Array<{ name: string; value: string }> | undefined;
      expect(headers).toEqual(
        expect.arrayContaining([expect.objectContaining({ name: "Content-Type", value: "application/xml" })]),
      );
    }
  });
});
