import { IvrFlowService, type IvrContext } from "./ivr-flow.service";

/**
 * The electoral IVR slice: postcode gather → lookup → (menu) → connect, with
 * the source's graceful degradations. Selection state lives on the leg's row —
 * these specs pin that Gather action URLs never carry the caller's input.
 */

const FALLBACK = "+61290001111";

const TARGET = {
  number: "+61262774022",
  name: "Alex Example",
  party: "Australian Labor Party",
  electorate: "Wills",
};

const WILLS = { code: "318", name: "Wills", addressCount: 40000 };
const COOPER = { code: "312", name: "Cooper", addressCount: 9000 };

function makeCampaign(over: Record<string, unknown> = {}) {
  return {
    id: "dc1",
    tenantId: "t1",
    defaultLanguage: "en",
    survey: false,
    electoralTarget: true,
    transparentTargetTransfer: false,
    intro: null,
    outro: { name: "Thanks for calling. Goodbye." },
    optOut: null,
    targetNumbers: [FALLBACK],
    partyTargets: null,
    jurisdiction: null,
    officeTarget: null,
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
    postcode: null,
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
    postcode: null,
    ...over,
  } as never;
}

function setup() {
  const tx = {
    contactConsent: { upsert: jest.fn().mockResolvedValue({}) },
    dialerAttempt: { update: jest.fn().mockResolvedValue({}) },
    dialerRedirect: { create: jest.fn().mockResolvedValue({ id: "rdr1" }) },
  };
  const prisma = {
    dialerAttempt: { update: jest.fn().mockResolvedValue({}) },
    dialerCallSession: { update: jest.fn().mockResolvedValue({}) },
    dialerRedirect: { findFirst: jest.fn().mockResolvedValue(null) },
    storedFile: { findMany: jest.fn().mockResolvedValue([]) },
    call: { findUnique: jest.fn().mockResolvedValue(null) },
    $transaction: jest.fn(async (fn: (t: typeof tx) => Promise<unknown>) => fn(tx)),
  };
  const progress = { publish: jest.fn().mockResolvedValue(undefined) };
  const config = {
    get: jest.fn((key: string, def?: string) => (key === "API_BASE_URL" ? "https://api.test" : (def ?? ""))),
  };
  const logger = { debug: jest.fn(), log: jest.fn(), warn: jest.fn(), error: jest.fn() };
  const outbox = { append: jest.fn().mockResolvedValue(undefined) };
  const electoral = {
    lookupPostcode: jest.fn().mockResolvedValue([WILLS]),
    resolveTarget: jest.fn().mockResolvedValue(TARGET),
  };
  const service = new IvrFlowService(
    prisma as never,
    progress as never,
    config as never,
    logger as never,
    outbox as never,
    undefined,
    electoral as never,
  );
  return { service, prisma, tx, progress, electoral };
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

beforeEach(() => jest.clearAllMocks());

describe("renderElectoralPostcode", () => {
  it("gathers four digits toward electoral-lookup with ids only in the action URL", async () => {
    const { service, progress } = setup();
    const twiml = await service.renderElectoralPostcode(ctxOf());
    expect(twiml).toContain('numDigits="4"');
    expect(twiml).toContain("electoral-lookup?campaignId=dc1&amp;attemptId=at1");
    expect(twiml).not.toContain("postcode=");
    expect(twiml).toContain("press star");
    expect(progress.publish).toHaveBeenCalledWith(undefined, "t1", "call_electoral_postcode", {});
  });
});

describe("handleElectoralLookup", () => {
  it("a single electorate persists the postcode server-side and connects straight through", async () => {
    const { service, prisma, tx, electoral } = setup();
    const twiml = await service.handleElectoralLookup(ctxOf(), { Digits: "3058", CallSid: "CA1" });

    expect(prisma.dialerAttempt.update).toHaveBeenCalledWith({
      where: { id: "at1" },
      data: { postcode: "3058" },
    });
    expect(electoral.resolveTarget).toHaveBeenCalledWith(expect.anything(), {
      postcode: "3058",
      electorate: WILLS,
    });
    expect(twiml).toContain("Connecting you to Alex Example");
    expect(twiml).toContain(`<Dial>${TARGET.number}</Dial>`);
    // Transfer ledger row carries the resolved member, not just the number.
    expect(tx.dialerRedirect.create).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({
          targetNumber: TARGET.number,
          targetName: "Alex Example",
          electorate: "Wills",
        }),
      }),
    );
  });

  it("multiple electorates render a menu whose action URL carries ids only", async () => {
    const { service, electoral } = setup();
    electoral.lookupPostcode.mockResolvedValue([WILLS, COOPER]);
    const twiml = await service.handleElectoralLookup(ctxOf(), { Digits: "3058" });
    expect(twiml).toContain("more than one electorate");
    expect(twiml).toContain("For Wills, press 1");
    expect(twiml).toContain("For Cooper, press 2");
    expect(twiml).toContain("press 0");
    expect(twiml).toContain("select-electorate?campaignId=dc1&amp;attemptId=at1");
    expect(twiml).not.toContain("3058");
  });

  it("no electorate found apologises then falls back to the campaign's fixed target", async () => {
    const { service, electoral } = setup();
    electoral.lookupPostcode.mockResolvedValue([]);
    const twiml = await service.handleElectoralLookup(ctxOf(), { Digits: "9999" });
    expect(twiml).toContain("couldn't find an electorate");
    expect(twiml).toContain(`<Dial>${FALLBACK}</Dial>`);
  });

  it("no electorate and no fallback plays the outro and hangs up", async () => {
    const { service, electoral } = setup();
    electoral.lookupPostcode.mockResolvedValue([]);
    const ctx = ctxOf({ campaign: makeCampaign({ targetNumbers: null }) });
    const twiml = await service.handleElectoralLookup(ctx, { Digits: "9999" });
    expect(twiml).toContain("Thanks for calling");
    expect(twiml).toContain("<Hangup/>");
  });

  it("a malformed postcode re-asks", async () => {
    const { service, electoral } = setup();
    const twiml = await service.handleElectoralLookup(ctxOf(), { Digits: "305" });
    expect(twiml).toContain("electoral-postcode");
    expect(electoral.lookupPostcode).not.toHaveBeenCalled();
  });

  it("star opts the caller out instead of looking up", async () => {
    const { service, tx } = setup();
    const twiml = await service.handleElectoralLookup(ctxOf(), { Digits: "*" });
    expect(tx.contactConsent.upsert).toHaveBeenCalled();
    expect(twiml).toContain("removed from this campaign");
  });

  it("officeTarget 'upper' skips the district menu and resolves by state", async () => {
    const { service, electoral } = setup();
    const ctx = ctxOf({ campaign: makeCampaign({ officeTarget: "upper" }) });
    await service.handleElectoralLookup(ctx, { Digits: "3058" });
    expect(electoral.lookupPostcode).not.toHaveBeenCalled();
    expect(electoral.resolveTarget).toHaveBeenCalledWith(expect.anything(), {
      postcode: "3058",
      electorate: undefined,
    });
  });
});

describe("handleSelectElectorate", () => {
  it("re-derives options from the persisted postcode and connects the chosen one", async () => {
    const { service, electoral } = setup();
    electoral.lookupPostcode.mockResolvedValue([WILLS, COOPER]);
    const ctx = ctxOf({ attempt: makeAttempt({ postcode: "3058" }) });
    await service.handleSelectElectorate(ctx, { Digits: "2" });
    expect(electoral.lookupPostcode).toHaveBeenCalledWith("3058", null);
    expect(electoral.resolveTarget).toHaveBeenCalledWith(expect.anything(), {
      postcode: "3058",
      electorate: COOPER,
    });
  });

  it("0, and any out-of-range digit, takes the dominant electorate", async () => {
    const { service, electoral } = setup();
    electoral.lookupPostcode.mockResolvedValue([WILLS, COOPER]);
    const ctx = ctxOf({ attempt: makeAttempt({ postcode: "3058" }) });
    await service.handleSelectElectorate(ctx, { Digits: "0" });
    await service.handleSelectElectorate(ctx, { Digits: "7" });
    for (const call of electoral.resolveTarget.mock.calls) {
      expect(call[1].electorate).toEqual(WILLS);
    }
  });

  it("lost selection state re-asks for the postcode", async () => {
    const { service, electoral } = setup();
    const twiml = await service.handleSelectElectorate(ctxOf(), { Digits: "1" });
    expect(twiml).toContain("electoral-postcode");
    expect(electoral.lookupPostcode).not.toHaveBeenCalled();
  });
});

describe("connect degradations", () => {
  it("no dialable member apologises then falls back", async () => {
    const { service, electoral } = setup();
    electoral.resolveTarget.mockResolvedValue(null);
    const twiml = await service.handleElectoralLookup(ctxOf(), { Digits: "3058" });
    expect(twiml).toContain("don't have a number");
    expect(twiml).toContain(`<Dial>${FALLBACK}</Dial>`);
  });

  it("a widget session persists the resolved target for the Phase 4b bridge instead of dialling", async () => {
    const { service, prisma, progress } = setup();
    const ctx = ctxOf({ attempt: null, session: makeSession(), callId: "callS" });
    const twiml = await service.handleElectoralLookup(ctx, { Digits: "3058" });
    expect(prisma.dialerCallSession.update).toHaveBeenCalledWith(
      expect.objectContaining({
        where: { id: "sess1" },
        data: expect.objectContaining({ targetNumber: TARGET.number, targetName: "Alex Example" }),
      }),
    );
    expect(progress.publish).toHaveBeenCalledWith("sess1", "t1", "call_electoral_target", {
      name: "Alex Example",
      party: TARGET.party,
      electorate: "Wills",
    });
    expect(twiml).not.toContain("<Dial>");
  });
});
