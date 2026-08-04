import { NotFoundException } from "@nestjs/common";
import { EVENT_TYPES } from "@uprise/events";
import { IvrFlowService, type IvrContext } from "./ivr-flow.service";

const TARGET = "+61290001111";
const TARGET_B = "+61290002222";

function makeCampaign(over: Record<string, unknown> = {}) {
  return {
    id: "dc1",
    tenantId: "t1",
    defaultLanguage: "en",
    survey: false,
    electoralTarget: false,
    transparentTargetTransfer: false,
    intro: { name: "Hello from the campaign." },
    outro: { name: "Thanks for listening. Goodbye." },
    optOut: null,
    targetNumbers: [TARGET],
    ...over,
  } as never;
}

function makeAttempt(over: Record<string, unknown> = {}) {
  return {
    id: "at1",
    tenantId: "t1",
    campaignId: "dc1",
    contactId: "c1",
    phoneE164: "+61400000000",
    kind: "PHONE",
    outcome: "PENDING",
    callId: "call1",
    language: "en",
    ...over,
  } as never;
}

function makeSession(over: Record<string, unknown> = {}) {
  return {
    id: "sess1",
    tenantId: "t1",
    campaignId: "dc1",
    callId: "callS",
    status: "CONNECTED",
    language: "en",
    supporterPhone: "+61400000099",
    ...over,
  } as never;
}

function setup() {
  const tx = {
    dialerSurveyResult: { upsert: jest.fn().mockResolvedValue({}) },
    contactConsent: { upsert: jest.fn().mockResolvedValue({}) },
    dialerAttempt: { update: jest.fn().mockResolvedValue({}) },
    dialerRedirect: { create: jest.fn().mockResolvedValue({ id: "rdr1" }) },
  };
  const prisma = {
    dialerAttempt: { findUnique: jest.fn().mockResolvedValue(null), update: jest.fn().mockResolvedValue({}) },
    dialerCallSession: { findUnique: jest.fn().mockResolvedValue(null), update: jest.fn().mockResolvedValue({}) },
    dialerCampaign: { findUnique: jest.fn().mockResolvedValue(null) },
    dialerQuestion: { findMany: jest.fn().mockResolvedValue([]), findUnique: jest.fn().mockResolvedValue(null) },
    dialerRedirect: { findFirst: jest.fn().mockResolvedValue(null) },
    storedFile: { findMany: jest.fn().mockResolvedValue([]) },
    call: {
      findUnique: jest.fn().mockResolvedValue(null),
      updateMany: jest.fn().mockResolvedValue({ count: 1 }),
    },
    $transaction: jest.fn(async (fn: (t: typeof tx) => Promise<unknown>) => fn(tx)),
  };
  const progress = { publish: jest.fn().mockResolvedValue(undefined) };
  const config = {
    get: jest.fn((key: string, def?: string) => (key === "API_BASE_URL" ? "https://api.test" : (def ?? ""))),
  };
  const logger = { debug: jest.fn(), log: jest.fn(), warn: jest.fn(), error: jest.fn() };
  const outbox = { append: jest.fn().mockResolvedValue(undefined) };
  const dispatcher = { sendSms: jest.fn().mockResolvedValue({ id: "sms1" }) };
  const service = new IvrFlowService(
    prisma as never,
    progress as never,
    config as never,
    logger as never,
    outbox as never,
    dispatcher as never,
  );
  return { prisma, tx, progress, config, logger, outbox, dispatcher, service };
}

function ctxOf(over: Partial<IvrContext> = {}): IvrContext {
  return {
    campaign: makeCampaign(),
    attempt: makeAttempt(),
    session: null,
    callId: "call1",
    language: "en",
    ...over,
  };
}

/* -------------------------------------------------------------- context */

describe("IvrFlowService.loadContext", () => {
  it("loads campaign + attempt and derives callId + language from the attempt", async () => {
    const { prisma, service } = setup();
    prisma.dialerAttempt.findUnique.mockResolvedValue(makeAttempt({ language: "vi" }));
    prisma.dialerCampaign.findUnique.mockResolvedValue(makeCampaign());
    const ctx = await service.loadContext({ attemptId: "at1" });
    expect(prisma.dialerCampaign.findUnique).toHaveBeenCalledWith({ where: { id: "dc1" } });
    expect(ctx.callId).toBe("call1");
    expect(ctx.language).toBe("vi");
  });

  it("throws NotFound when no campaign resolves", async () => {
    const { service } = setup();
    await expect(service.loadContext({})).rejects.toThrow(NotFoundException);
  });

  it("refuses an attempt that belongs to a different campaign or tenant", async () => {
    const { prisma, service } = setup();
    prisma.dialerAttempt.findUnique.mockResolvedValue(makeAttempt({ campaignId: "dc-other" }));
    prisma.dialerCampaign.findUnique.mockResolvedValue(makeCampaign());
    await expect(service.loadContext({ campaignId: "dc1", attemptId: "at1" })).rejects.toThrow(
      NotFoundException,
    );
    prisma.dialerAttempt.findUnique.mockResolvedValue(makeAttempt({ tenantId: "t-foreign" }));
    await expect(service.loadContext({ campaignId: "dc1", attemptId: "at1" })).rejects.toThrow(
      NotFoundException,
    );
  });

  it("refuses a session that belongs to a different campaign", async () => {
    const { prisma, service } = setup();
    prisma.dialerCallSession.findUnique.mockResolvedValue(makeSession({ campaignId: "dc-other" }));
    prisma.dialerCampaign.findUnique.mockResolvedValue(makeCampaign());
    await expect(service.loadContext({ campaignId: "dc1", sessionId: "sess1" })).rejects.toThrow(
      NotFoundException,
    );
  });

  it("falls back to the campaign default language without an attempt", async () => {
    const { prisma, service } = setup();
    prisma.dialerCampaign.findUnique.mockResolvedValue(makeCampaign({ defaultLanguage: "zh" }));
    const ctx = await service.loadContext({ campaignId: "dc1" });
    expect(ctx.language).toBe("zh");
    expect(ctx.attempt).toBeNull();
    expect(ctx.callId).toBeNull();
  });
});

/* -------------------------------------------------------------- answer */

describe("IvrFlowService.handleAnswer", () => {
  it("machine AMD verdict: records it, sets MACHINE outcome, hangs up", async () => {
    const { prisma, service } = setup();
    const twiml = await service.handleAnswer(ctxOf(), { CallSid: "CA1", AnsweredBy: "machine_start" });
    expect(prisma.call.updateMany).toHaveBeenCalledWith({
      where: { id: "call1", tenantId: "t1" },
      data: { answeredBy: "machine_start", machineDetected: true },
    });
    expect(prisma.dialerAttempt.update).toHaveBeenCalledWith({
      where: { id: "at1" },
      data: { outcome: "MACHINE" },
    });
    expect(twiml).toContain("<Hangup/>");
    expect(twiml).not.toContain("<Gather");
  });

  it("fax counts as machine; human does not", async () => {
    const { prisma, service } = setup();
    const faxTwiml = await service.handleAnswer(ctxOf(), { AnsweredBy: "fax" });
    expect(faxTwiml).not.toContain("<Gather");
    prisma.dialerAttempt.update.mockClear();
    const humanTwiml = await service.handleAnswer(ctxOf(), { AnsweredBy: "human" });
    expect(prisma.dialerAttempt.update).not.toHaveBeenCalled();
    expect(humanTwiml).toContain("<Gather");
  });

  it("transparent transfer skips the IVR straight to the redirect endpoint", async () => {
    const { service } = setup();
    const ctx = ctxOf({ campaign: makeCampaign({ transparentTargetTransfer: true }) });
    const twiml = await service.handleAnswer(ctx, {});
    expect(twiml).toContain("<Redirect>");
    expect(twiml).toContain("/api/v1/autodialer/ivr/redirect?campaignId=dc1&amp;attemptId=at1");
    expect(twiml).not.toContain("Hello from the campaign");
  });

  it("survey campaign: intro then redirect into the first question by orderIndex", async () => {
    const { prisma, service } = setup();
    prisma.dialerQuestion.findMany.mockResolvedValue([
      { key: "q1", audioPrompt: null },
      { key: "q2", audioPrompt: null },
    ]);
    const ctx = ctxOf({ campaign: makeCampaign({ survey: true }) });
    const twiml = await service.handleAnswer(ctx, {});
    expect(prisma.dialerQuestion.findMany).toHaveBeenCalledWith({
      where: { campaignId: "dc1" },
      orderBy: { orderIndex: "asc" },
    });
    expect(twiml).toContain("<Say>Hello from the campaign.</Say>");
    expect(twiml).toContain("/api/v1/autodialer/ivr/survey?");
    expect(twiml).toContain("q=q1");
  });

  it("survey campaign with an empty graph still answers with valid TwiML", async () => {
    const { service } = setup();
    const ctx = ctxOf({ campaign: makeCampaign({ survey: true }) });
    const twiml = await service.handleAnswer(ctx, {});
    expect(twiml).toContain("<Hangup/>");
  });

  it("electoral campaign redirects to the electoral-postcode step", async () => {
    const { service } = setup();
    const ctx = ctxOf({ campaign: makeCampaign({ electoralTarget: true }) });
    const twiml = await service.handleAnswer(ctx, {});
    expect(twiml).toContain("/api/v1/autodialer/ivr/electoral-postcode?");
  });

  it("broadcast: intro + opt-out star inside a gather, then outro + hangup", async () => {
    const { service } = setup();
    const twiml = await service.handleAnswer(ctxOf(), {});
    expect(twiml).toContain("<Gather");
    expect(twiml).toContain("q=__broadcast__");
    expect(twiml).toContain("Hello from the campaign.");
    expect(twiml).toContain("press star");
    expect(twiml).toContain("Thanks for listening. Goodbye.");
    expect(twiml).toContain("<Hangup/>");
  });

  it("plays the per-language recording over <Say> when one resolves", async () => {
    const { prisma, service } = setup();
    prisma.storedFile.findMany.mockResolvedValue([{ id: "f-vi", url: "https://cdn.test/f-vi.mp3" }]);
    const ctx = ctxOf({
      language: "vi",
      campaign: makeCampaign({ intro: { name: "Hello", audio: { vi: "f-vi" } } }),
    });
    const twiml = await service.handleAnswer(ctx, {});
    expect(twiml).toContain("<Play>https://cdn.test/f-vi.mp3</Play>");
    expect(twiml).not.toContain("<Say>Hello</Say>");
  });

  it("publishes call_connected progress with the session id", async () => {
    const { progress, service } = setup();
    const session = makeSession();
    await service.handleAnswer(ctxOf({ attempt: null, session, callId: "callS" }), {});
    expect(progress.publish).toHaveBeenCalledWith("sess1", "t1", "call_connected", {});
  });

  it("action URLs carry ids only — never tenant or phone identifiers", async () => {
    const { service } = setup();
    const twiml = await service.handleAnswer(ctxOf(), {});
    expect(twiml).not.toContain("tenantId=");
    expect(twiml).not.toContain("61400000000");
  });
});

/* -------------------------------------------------------------- survey render */

describe("IvrFlowService.renderSurveyQuestion", () => {
  const question = {
    id: "qq1",
    key: "q1",
    name: "Do you support the campaign?",
    audioPrompt: null,
    answers: [
      { digit: "2", value: "No", nextKey: null },
      { digit: "1", value: "Yes", nextKey: "q2" },
    ],
  };

  it("renders a 1-digit gather with a 10s timeout and empty-result callback", async () => {
    const { prisma, service } = setup();
    prisma.dialerQuestion.findUnique.mockResolvedValue(question);
    const twiml = await service.renderSurveyQuestion(ctxOf(), "q1");
    expect(prisma.dialerQuestion.findUnique).toHaveBeenCalledWith({
      where: { campaignId_key: { campaignId: "dc1", key: "q1" } },
      include: { answers: true },
    });
    expect(twiml).toContain('numDigits="1"');
    expect(twiml).toContain('timeout="10"');
    expect(twiml).toContain('actionOnEmptyResult="true"');
    expect(twiml).toContain("q=q1");
  });

  it("speaks the question + sorted Press-N options when no audio resolves", async () => {
    const { prisma, service } = setup();
    prisma.dialerQuestion.findUnique.mockResolvedValue(question);
    const twiml = await service.renderSurveyQuestion(ctxOf(), "q1");
    expect(twiml).toContain("Do you support the campaign?");
    const yes = twiml.indexOf("Press 1 for Yes.");
    const no = twiml.indexOf("Press 2 for No.");
    expect(yes).toBeGreaterThan(-1);
    expect(no).toBeGreaterThan(yes);
  });

  it("plays the question recording when it resolves for the leg's language", async () => {
    const { prisma, service } = setup();
    prisma.dialerQuestion.findUnique.mockResolvedValue({
      ...question,
      audioPrompt: { name: "Do you support the campaign?", audio: "f-q1" },
    });
    prisma.storedFile.findMany.mockResolvedValue([{ id: "f-q1", url: "https://cdn.test/q1.mp3" }]);
    const twiml = await service.renderSurveyQuestion(ctxOf(), "q1");
    expect(twiml).toContain("<Play>https://cdn.test/q1.mp3</Play>");
    expect(twiml).not.toContain("Press 1 for Yes.");
  });

  it("offers the opt-out star to outbound phone legs only", async () => {
    const { prisma, service } = setup();
    prisma.dialerQuestion.findUnique.mockResolvedValue(question);
    const phone = await service.renderSurveyQuestion(ctxOf(), "q1");
    expect(phone).toContain("press star");
    const widget = await service.renderSurveyQuestion(
      ctxOf({ attempt: null, session: makeSession(), callId: "callS" }),
      "q1",
    );
    expect(widget).not.toContain("press star");
  });

  it("publishes the call_survey progress event with digit-sorted options", async () => {
    const { prisma, progress, service } = setup();
    prisma.dialerQuestion.findUnique.mockResolvedValue(question);
    await service.renderSurveyQuestion(ctxOf({ session: makeSession() }), "q1");
    expect(progress.publish).toHaveBeenCalledWith("sess1", "t1", "call_survey", {
      question: "Do you support the campaign?",
      options: [
        { digit: "1", label: "Yes" },
        { digit: "2", label: "No" },
      ],
    });
  });

  it("hangs up (valid TwiML) on an unknown question key", async () => {
    const { service } = setup();
    const twiml = await service.renderSurveyQuestion(ctxOf(), "gone");
    expect(twiml).toContain("<Hangup/>");
  });
});

/* -------------------------------------------------------------- survey result */

describe("IvrFlowService.handleSurveyResult", () => {
  const question = {
    id: "qq1",
    key: "q1",
    name: "Do you support the campaign?",
    audioPrompt: null,
    answers: [
      {
        id: "an1",
        digit: "1",
        value: "Yes",
        nextKey: "q2",
        type: null,
        content: null,
        transfer: false,
        dispositionCode: "SUPPORTS",
        supportLevel: "STRONG_SUPPORT",
      },
      {
        id: "an2",
        digit: "2",
        value: "No",
        nextKey: "outro",
        type: null,
        content: null,
        transfer: false,
        dispositionCode: null,
        supportLevel: null,
      },
      {
        id: "an3",
        digit: "3",
        value: "Maybe",
        nextKey: null,
        type: null,
        content: null,
        transfer: false,
        dispositionCode: null,
        supportLevel: null,
      },
    ],
  };

  function surveySetup() {
    const s = setup();
    s.prisma.dialerQuestion.findUnique.mockResolvedValue(question);
    return s;
  }

  it("no input: spoken reminder, then re-render the same question", async () => {
    const { service, tx } = surveySetup();
    const twiml = await service.handleSurveyResult(ctxOf(), "q1", {});
    expect(twiml).toContain("hear your response");
    expect(twiml).toContain("/api/v1/autodialer/ivr/survey?");
    expect(twiml).toContain("q=q1");
    expect(tx.dialerSurveyResult.upsert).not.toHaveBeenCalled();
  });

  it("unknown digit re-asks exactly like no input", async () => {
    const { service, tx } = surveySetup();
    const twiml = await service.handleSurveyResult(ctxOf(), "q1", { Digits: "9" });
    expect(twiml).toContain("q=q1");
    expect(tx.dialerSurveyResult.upsert).not.toHaveBeenCalled();
  });

  it("records the answer as an upsert on (callId, questionKey) + emits in the same tx", async () => {
    const { service, tx, outbox } = surveySetup();
    const twiml = await service.handleSurveyResult(ctxOf(), "q1", { Digits: "1" });
    expect(tx.dialerSurveyResult.upsert).toHaveBeenCalledWith(
      expect.objectContaining({
        where: { callId_questionKey: { callId: "call1", questionKey: "q1" } },
        create: expect.objectContaining({
          tenantId: "t1",
          campaignId: "dc1",
          contactId: "c1",
          answerDigit: "1",
          supportLevel: "STRONG_SUPPORT",
        }),
        update: expect.objectContaining({ answerDigit: "1" }),
      }),
    );
    expect(outbox.append).toHaveBeenCalledWith(
      expect.anything(),
      expect.objectContaining({
        eventType: EVENT_TYPES.DIALER_SURVEY_ANSWER_RECORDED,
        aggregateId: "call1",
        payload: expect.objectContaining({
          questionKey: "q1",
          digit: "1",
          dispositionCode: "SUPPORTS",
          supportLevel: "STRONG_SUPPORT",
        }),
      }),
    );
    // Follows the graph edge to q2.
    expect(twiml).toContain("q=q2");
  });

  it("nextKey outro speaks the outro then hangs up; null nextKey just hangs up", async () => {
    const { service } = surveySetup();
    const outro = await service.handleSurveyResult(ctxOf(), "q1", { Digits: "2" });
    expect(outro).toContain("Thanks for listening. Goodbye.");
    expect(outro).toContain("<Hangup/>");
    const terminal = await service.handleSurveyResult(ctxOf(), "q1", { Digits: "3" });
    expect(terminal).not.toContain("Thanks for listening.");
    expect(terminal).toContain("<Hangup/>");
  });

  it("records nothing (but stays valid TwiML) when no call resolves", async () => {
    const { service, tx, logger } = surveySetup();
    const ctx = ctxOf({ callId: null, attempt: makeAttempt({ callId: null }) });
    const twiml = await service.handleSurveyResult(ctx, "q1", { Digits: "1" });
    expect(tx.dialerSurveyResult.upsert).not.toHaveBeenCalled();
    expect(logger.warn).toHaveBeenCalled();
    expect(twiml).toContain("q=q2");
  });

  it("star opts out: VOICE+SMS consent, attempt outcome, event — one transaction", async () => {
    const { service, tx, outbox, prisma } = surveySetup();
    const twiml = await service.handleSurveyResult(ctxOf(), "q1", { Digits: "*" });
    expect(prisma.$transaction).toHaveBeenCalledTimes(1);
    expect(tx.contactConsent.upsert).toHaveBeenCalledTimes(2);
    const channels = tx.contactConsent.upsert.mock.calls.map(
      (call: never[]) => (call[0] as { create: { channel: string } }).create.channel,
    );
    expect(channels.sort()).toEqual(["SMS", "VOICE"]);
    expect(tx.contactConsent.upsert).toHaveBeenCalledWith(
      expect.objectContaining({
        where: {
          tenantId_phoneE164_channel: {
            tenantId: "t1",
            phoneE164: "+61400000000",
            channel: "VOICE",
          },
        },
        update: { state: "OPTED_OUT", source: "ivr_star" },
      }),
    );
    expect(tx.dialerAttempt.update).toHaveBeenCalledWith({
      where: { id: "at1" },
      data: { outcome: "OPTED_OUT" },
    });
    expect(outbox.append).toHaveBeenCalledWith(
      expect.anything(),
      expect.objectContaining({
        eventType: EVENT_TYPES.DIALER_CONTACT_OPTED_OUT,
        payload: expect.objectContaining({ phoneE164: "+61400000000", source: "ivr_star" }),
      }),
    );
    expect(twiml).toContain("removed from this campaign");
    expect(twiml).toContain("<Hangup/>");
  });

  it("broadcast pseudo-question: star opts out, anything else gets the outro", async () => {
    const { service, tx } = surveySetup();
    const star = await service.handleSurveyResult(ctxOf(), "__broadcast__", { Digits: "*" });
    expect(star).toContain("removed from this campaign");
    tx.contactConsent.upsert.mockClear();
    const silent = await service.handleSurveyResult(ctxOf(), "__broadcast__", {});
    expect(silent).toContain("Thanks for listening. Goodbye.");
    expect(tx.contactConsent.upsert).not.toHaveBeenCalled();
  });

  it("SMS answer type sends after commit and survives a failed send", async () => {
    const { service, dispatcher, logger, prisma } = setup();
    prisma.dialerQuestion.findUnique.mockResolvedValue({
      ...question,
      answers: [
        {
          ...question.answers[0],
          type: "SMS",
          content: "Here is the info you asked for: https://example.org",
          nextKey: null,
        },
      ],
    });
    await service.handleSurveyResult(ctxOf(), "q1", { Digits: "1" });
    expect(dispatcher.sendSms).toHaveBeenCalledWith({
      tenantId: "t1",
      toPhone: "+61400000000",
      body: "Here is the info you asked for: https://example.org",
      purpose: "dialer_survey_sms",
    });
    dispatcher.sendSms.mockRejectedValue(new Error("provider down"));
    const twiml = await service.handleSurveyResult(ctxOf(), "q1", { Digits: "1" });
    expect(logger.warn).toHaveBeenCalledWith(
      "autodialer",
      "survey SMS answer failed to send",
      expect.objectContaining({ error: "provider down" }),
    );
    expect(twiml).toContain("<Hangup/>");
  });

  it("SET_LANGUAGE updates the attempt row and the live context", async () => {
    const { service, prisma } = setup();
    prisma.dialerQuestion.findUnique.mockResolvedValue({
      ...question,
      answers: [{ ...question.answers[0], type: "SET_LANGUAGE", content: "vi", nextKey: "q2" }],
    });
    const ctx = ctxOf();
    await service.handleSurveyResult(ctx, "q1", { Digits: "1" });
    expect(prisma.dialerAttempt.update).toHaveBeenCalledWith({
      where: { id: "at1" },
      data: { language: "vi" },
    });
    expect(ctx.language).toBe("vi");
  });

  it("REDIRECT with transfer hands the call to the redirect endpoint", async () => {
    const { service, prisma } = setup();
    prisma.dialerQuestion.findUnique.mockResolvedValue({
      ...question,
      answers: [{ ...question.answers[0], type: "REDIRECT", transfer: true, nextKey: "q2" }],
    });
    const twiml = await service.handleSurveyResult(ctxOf(), "q1", { Digits: "1" });
    expect(twiml).toContain("/api/v1/autodialer/ivr/redirect?");
    expect(twiml).not.toContain("q=q2");
  });

  it("SWITCHBOARD routes into the electoral lookup", async () => {
    const { service, prisma } = setup();
    prisma.dialerQuestion.findUnique.mockResolvedValue({
      ...question,
      answers: [{ ...question.answers[0], type: "SWITCHBOARD", nextKey: null }],
    });
    const twiml = await service.handleSurveyResult(ctxOf(), "q1", { Digits: "1" });
    expect(twiml).toContain("/api/v1/autodialer/ivr/electoral-postcode?");
  });
});

/* -------------------------------------------------------------- redirect */

describe("IvrFlowService.handleRedirect", () => {
  it("dials the target and records the transfer + event in one transaction", async () => {
    const { service, tx, outbox } = setup();
    const twiml = await service.handleRedirect(ctxOf(), { CallSid: "CA1" }, {});
    expect(twiml).toContain(`<Dial>${TARGET}</Dial>`);
    expect(tx.dialerRedirect.create).toHaveBeenCalledWith({
      data: expect.objectContaining({
        tenantId: "t1",
        campaignId: "dc1",
        callId: "call1",
        targetNumber: TARGET,
        phoneNumber: "+61400000000",
      }),
    });
    expect(outbox.append).toHaveBeenCalledWith(
      expect.anything(),
      expect.objectContaining({
        eventType: EVENT_TYPES.DIALER_TRANSFER_RECORDED,
        aggregateId: "rdr1",
        payload: expect.objectContaining({ targetNumber: TARGET }),
      }),
    );
  });

  it("is idempotent under Twilio retries — one ledger row per (call, target)", async () => {
    const { service, prisma, tx } = setup();
    prisma.dialerRedirect.findFirst.mockResolvedValue({ id: "rdr-existing" });
    const twiml = await service.handleRedirect(ctxOf(), {}, {});
    expect(tx.dialerRedirect.create).not.toHaveBeenCalled();
    expect(twiml).toContain(`<Dial>${TARGET}</Dial>`);
  });

  it("a valid AU query target overrides the campaign pool; junk falls through", async () => {
    const { service } = setup();
    const twiml = await service.handleRedirect(ctxOf(), {}, { target_number: TARGET_B });
    expect(twiml).toContain(`<Dial>${TARGET_B}</Dial>`);
    const fallthrough = await service.handleRedirect(ctxOf(), {}, { target_number: "0400111222" });
    expect(fallthrough).toContain(`<Dial>${TARGET}</Dial>`);
  });

  it("no valid target anywhere: apology + hangup, no ledger row", async () => {
    const { service, tx, logger } = setup();
    const ctx = ctxOf({ campaign: makeCampaign({ targetNumbers: ["junk"] }) });
    const twiml = await service.handleRedirect(ctx, {}, {});
    expect(twiml).toContain("unable to connect");
    expect(twiml).toContain("<Hangup/>");
    expect(tx.dialerRedirect.create).not.toHaveBeenCalled();
    expect(logger.warn).toHaveBeenCalled();
  });

  it("a widget session joins its conference as owner and the target leg is queued, not dialled inline", async () => {
    const { service, tx } = setup();
    const twiml = await service.handleRedirect(
      ctxOf({ attempt: null, session: makeSession({ conferenceName: "dialer-sess1" }), callId: "callS" }),
      {},
      {},
    );
    // Caller creates + owns the room; the status callback rides it.
    expect(twiml).toContain('startConferenceOnEnter="true"');
    expect(twiml).toContain('endConferenceOnExit="true"');
    expect(twiml).toContain("dialer-sess1");
    expect(twiml).toContain("conference-status?campaignId=dc1&amp;sessionId=sess1");
    // No inline <Dial><Number> — the worker places the target leg.
    expect(twiml).not.toContain("<Number>");
    expect(tx.dialerRedirect.create).toHaveBeenCalled();
  });

  it("a WEBRTC attempt with no session has no room to join — apology, not a bridge", async () => {
    const { service, tx } = setup();
    const twiml = await service.handleRedirect(
      ctxOf({ attempt: makeAttempt({ kind: "WEBRTC" }) }),
      {},
      {},
    );
    expect(twiml).toContain("unable to connect");
    expect(twiml).toContain("<Hangup/>");
    expect(tx.dialerRedirect.create).not.toHaveBeenCalled();
  });
});

describe("IvrFlowService.resolveTargetNumber", () => {
  it("filters the configured pool down to valid AU numbers", () => {
    const { service } = setup();
    const campaign = makeCampaign({ targetNumbers: ["junk", TARGET_B, 42] });
    expect(service.resolveTargetNumber(campaign, undefined)).toBe(TARGET_B);
    expect(service.resolveTargetNumber(makeCampaign({ targetNumbers: null }), undefined)).toBeNull();
  });
});
