import {
  TelephonyProvisioningStatus as S,
  TelephonyNumberStatus,
  TelephonyStepStatus,
} from "@uprise/db";
import { put } from "@vercel/blob";
import { TelephonyProvisioningService } from "./telephony-provisioning.service";
import { ImageUploadService } from "../common/storage/image-upload.service";

// addDocument writes to Vercel Blob — mock the SDK so the unit spec never
// touches the network.
jest.mock("@vercel/blob", () => ({ put: jest.fn(async () => ({ url: "https://blob.test/doc.pdf" })) }));

const RUN_ID = "run-1";
const TENANT_ID = "tenant-1";
const ACCOUNT_ID = "acct-1";
const ACCOUNT_SID = "AC" + "1".repeat(32);
const NUMBER_ID = "num-1";

const ENV: Record<string, string> = { API_BASE_URL: "https://api.test" };

function makeRun(overrides: Record<string, unknown> = {}) {
  return {
    id: RUN_ID,
    tenantId: TENANT_ID,
    campaignId: null as string | null,
    accountId: null as string | null,
    status: S.REQUESTED as (typeof S)[keyof typeof S],
    bundleSid: null as string | null,
    addressSid: null as string | null,
    endUserSid: null as string | null,
    phoneNumberId: null as string | null,
    resumeStatus: null as (typeof S)[keyof typeof S] | null,
    numberType: "mobile" as string,
    chainComplementary: true as boolean,
    requestedById: null as string | null,
    lastError: null as string | null,
    complianceInput: {
      email: "compliance@example.org",
      legalName: "Legal Co",
      contactFirstName: "Ada",
      contactLastName: "Lovelace",
      address: { street: "1 Test St", city: "Sydney", region: "NSW", postalCode: "2000" },
    },
    documents: null as unknown,
    createdAt: new Date("2026-01-01T00:00:00.000Z"),
    ...overrides,
  };
}

function makeAccount(overrides: Record<string, unknown> = {}) {
  return {
    id: ACCOUNT_ID,
    tenantId: TENANT_ID,
    accountSid: ACCOUNT_SID,
    encryptedAuthToken: "encrypted",
    status: "ACTIVE",
    mode: "SUBACCOUNT",
    friendlyName: "uprise",
    settings: {},
    ...overrides,
  };
}

function makeNumber(overrides: Record<string, unknown> = {}) {
  return {
    id: NUMBER_ID,
    tenantId: TENANT_ID,
    accountId: ACCOUNT_ID,
    campaignId: null,
    phoneNumberSid: "PN" + "9".repeat(32),
    phoneNumberE164: "+61400000000",
    bundleSid: "BUprior",
    addressSid: "ADprior",
    numberType: "mobile" as string | null,
    status: TelephonyNumberStatus.PENDING,
    ...overrides,
  };
}

/**
 * Evaluate the class-match OR the service builds against a candidate row. The where
 * clause IS the reuse behaviour (prisma is mocked), so asserting it against real rows
 * beats echoing its shape back.
 */
type ClassClause = {
  numberType?: string;
  phoneNumberE164?: { startsWith?: string; not?: { startsWith: string } };
};
function matchesClass(or: ClassClause[], row: { numberType?: string | null; phoneNumberE164: string }) {
  return or.some((clause) => {
    if (clause.numberType !== undefined) return row.numberType === clause.numberType;
    const prefix = clause.phoneNumberE164;
    if (prefix?.startsWith !== undefined) return row.phoneNumberE164.startsWith(prefix.startsWith);
    if (prefix?.not?.startsWith !== undefined) return !row.phoneNumberE164.startsWith(prefix.not.startsWith);
    return false;
  });
}

function setup() {
  const prisma: any = {
    telephonyProvisioningRun: {
      findUnique: jest.fn(),
      findFirst: jest.fn().mockResolvedValue(null),
      findMany: jest.fn().mockResolvedValue([]),
      create: jest.fn(async (args: any) => ({ id: RUN_ID, ...args.data })),
      update: jest.fn(async (args: any) => ({ id: RUN_ID, ...args.data })),
    },
    telephonyProvisioningStep: { create: jest.fn(async (args: any) => ({ id: "step", ...args.data })) },
    telephonyAccount: {
      findUnique: jest.fn(),
      findFirst: jest.fn().mockResolvedValue(null),
      create: jest.fn(async () => makeAccount()),
      upsert: jest.fn(async () => makeAccount({ mode: "BYO" })),
      update: jest.fn(async () => makeAccount()),
    },
    telephonyPhoneNumber: {
      findUnique: jest.fn(),
      findFirst: jest.fn().mockResolvedValue(null),
      findMany: jest.fn().mockResolvedValue([]),
      create: jest.fn(async (args: any) => ({ ...args.data })),
      update: jest.fn(async (args: any) => ({ ...makeNumber(), ...args.data })),
    },
    tenant: { findUnique: jest.fn(async () => ({ id: TENANT_ID, name: "Test Tenant" })) },
    // Complete org identification by default so startRun's provisioning gate passes;
    // gate/prefill tests override this per-case (null / incomplete).
    orgProfile: { findFirst: jest.fn().mockResolvedValue(makeCompleteOrgProfile()) },
    $queryRaw: jest.fn().mockResolvedValue([]),
  };
  prisma.$transaction = jest.fn((cb: any) => cb(prisma));

  const config = { get: jest.fn((key: string, fallback?: string) => ENV[key] ?? fallback) };
  const crypto = { encrypt: jest.fn(() => "encrypted"), decrypt: jest.fn(() => "auth-token") };
  const twilio = {
    createSubaccount: jest.fn(async () => ({ accountSid: ACCOUNT_SID, authToken: "sub-token" })),
    createAddress: jest.fn(async () => "ADnew"),
    createEndUser: jest.fn(async () => "EUnew"),
    createSupportingDocument: jest.fn(async () => "REnew"),
    createBundle: jest.fn(async () => "BUnew"),
    assignBundleItem: jest.fn(async () => undefined),
    submitBundle: jest.fn(async () => undefined),
    fetchBundleStatus: jest.fn(async () => ({ status: "twilio-approved", failureReason: null })),
    findAvailableAuNumber: jest.fn(async () => "+61400000000"),
    purchaseNumber: jest.fn(async () => ({ phoneNumberSid: "PN" + "9".repeat(32), phoneNumberE164: "+61400000000" })),
    configureNumberWebhook: jest.fn(async () => undefined),
    releaseNumber: jest.fn(async () => undefined),
  };
  const outbox = { append: jest.fn(async () => undefined) };
  const logger = { error: jest.fn(), warn: jest.fn(), log: jest.fn(), debug: jest.fn() };
  const senderResolver = { invalidate: jest.fn() };
  const flags = { isEnabled: jest.fn(async () => true) };

  const service = new TelephonyProvisioningService(
    prisma,
    config as any,
    crypto as any,
    twilio as any,
    outbox as any,
    logger as any,
    senderResolver as any,
    new ImageUploadService(),
    flags as any,
  );
  return { prisma, config, crypto, twilio, outbox, logger, senderResolver, service, flags };
}

/** OrgProfile row (include-shape) whose identification satisfies evaluateOrgSetup. */
function makeCompleteOrgProfile() {
  return {
    id: "op1",
    tenantId: TENANT_ID,
    name: "Test Tenant",
    logoBlockUrl: "https://cdn/logo.png",
    logoLandscapeUrl: null,
    primaryColour: "#465fff",
    secondaryColour: null,
    heroImageUrl: null,
    credential: {
      legalTradingName: "Test Tenant Incorporated",
      australianBusinessNumber: "12345678901",
      australianCompanyNumber: null,
      entityType: "incorporated_association",
    },
    contacts: [
      {
        firstName: "Pat",
        lastName: "Chairperson",
        email: "pat@test.org",
        isPrimaryContact: true,
        isAuthorisedSignatory: true,
      },
    ],
    addresses: [
      { line1: "1 Main St", line2: null, suburb: "Newtown", city: null, state: "NSW", postcode: "2042" },
    ],
  };
}

// ApiHttpException carries its code/message in a wrapped response object, not
// on Error.message — match on the code.
const expectApiError = (promise: Promise<unknown>, code: string) =>
  expect(promise).rejects.toMatchObject({ response: { error: { code } } });

const emitOf = (eventType: string) => expect.objectContaining({ eventType });
const statusData = (status: unknown, extra: Record<string, unknown> = {}) =>
  expect.objectContaining({ data: expect.objectContaining({ status, ...extra }) });

describe("TelephonyProvisioningService steps", () => {
  describe("stepCreateSubaccount", () => {
    it("REQUESTED → SUBACCOUNT_CREATED: creates a fresh subaccount and emits subaccount-created", async () => {
      const { service, prisma, twilio, crypto, outbox } = setup();
      prisma.telephonyProvisioningRun.findUnique.mockResolvedValue(makeRun({ status: S.REQUESTED }));

      await service.stepCreateSubaccount(RUN_ID);

      expect(twilio.createSubaccount).toHaveBeenCalledWith("uprise · Test Tenant");
      expect(crypto.encrypt).toHaveBeenCalledWith("sub-token");
      expect(prisma.telephonyAccount.create).toHaveBeenCalled();
      expect(prisma.telephonyProvisioningRun.update).toHaveBeenCalledWith(statusData(S.SUBACCOUNT_CREATED));
      expect(outbox.append).toHaveBeenCalledWith(prisma, emitOf("telephony.provisioning.subaccount-created"));
    });

    it("reuses an existing ACTIVE tenant account (SKIPPED step) instead of creating one", async () => {
      const { service, prisma, twilio, outbox } = setup();
      prisma.telephonyProvisioningRun.findUnique.mockResolvedValue(makeRun({ status: S.REQUESTED }));
      prisma.telephonyAccount.findFirst.mockResolvedValue(makeAccount());

      await service.stepCreateSubaccount(RUN_ID);

      expect(twilio.createSubaccount).not.toHaveBeenCalled();
      expect(prisma.telephonyAccount.create).not.toHaveBeenCalled();
      expect(prisma.telephonyProvisioningRun.update).toHaveBeenCalledWith(
        statusData(S.SUBACCOUNT_CREATED, { accountId: ACCOUNT_ID }),
      );
      expect(outbox.append).toHaveBeenCalledWith(prisma, emitOf("telephony.provisioning.subaccount-created"));
    });

    it("parks the run FAILED (resume REQUESTED) + failed event when Twilio throws", async () => {
      const { service, prisma, twilio, outbox, logger } = setup();
      prisma.telephonyProvisioningRun.findUnique.mockResolvedValue(makeRun({ status: S.REQUESTED }));
      twilio.createSubaccount.mockRejectedValue(new Error("twilio down"));

      await service.stepCreateSubaccount(RUN_ID);

      expect(prisma.telephonyProvisioningRun.update).toHaveBeenCalledWith(
        statusData(S.FAILED, { resumeStatus: S.REQUESTED, lastError: "twilio down" }),
      );
      expect(outbox.append).toHaveBeenCalledWith(prisma, emitOf("telephony.provisioning.failed"));
      expect(logger.error).toHaveBeenCalled();
    });

    it("short-circuits a stale event when the run has already advanced", async () => {
      const { service, prisma, twilio, outbox, logger } = setup();
      prisma.telephonyProvisioningRun.findUnique.mockResolvedValue(makeRun({ status: S.SUBACCOUNT_CREATED }));

      await service.stepCreateSubaccount(RUN_ID);

      expect(twilio.createSubaccount).not.toHaveBeenCalled();
      expect(outbox.append).not.toHaveBeenCalled();
      expect(logger.warn).toHaveBeenCalled();
    });

    it("is a no-op when the run does not exist", async () => {
      const { service, prisma, twilio, outbox } = setup();
      prisma.telephonyProvisioningRun.findUnique.mockResolvedValue(null);

      await service.stepCreateSubaccount(RUN_ID);

      expect(twilio.createSubaccount).not.toHaveBeenCalled();
      expect(outbox.append).not.toHaveBeenCalled();
    });
  });

  describe("stepDraftCompliance", () => {
    const draftRun = () => makeRun({ status: S.SUBACCOUNT_CREATED, accountId: ACCOUNT_ID });

    it("SUBACCOUNT_CREATED → COMPLIANCE_DRAFT: builds the bundle and emits compliance-drafted", async () => {
      const { service, prisma, twilio, outbox } = setup();
      prisma.telephonyProvisioningRun.findUnique.mockResolvedValue(draftRun());
      prisma.telephonyAccount.findUnique.mockResolvedValue(makeAccount());

      await service.stepDraftCompliance(RUN_ID);

      expect(twilio.createAddress).toHaveBeenCalled();
      expect(twilio.createEndUser).toHaveBeenCalled();
      expect(twilio.createBundle).toHaveBeenCalled();
      expect(twilio.assignBundleItem).toHaveBeenCalledTimes(2); // endUser + address, no documents
      expect(prisma.telephonyProvisioningRun.update).toHaveBeenCalledWith(
        statusData(S.COMPLIANCE_DRAFT, { bundleSid: "BUnew", addressSid: "ADnew", endUserSid: "EUnew" }),
      );
      expect(outbox.append).toHaveBeenCalledWith(prisma, emitOf("telephony.provisioning.compliance-drafted"));
    });

    it("reuse fast-path: a prior approved bundle skips DRAFT→SUBMITTED→APPROVED and emits compliance-approved", async () => {
      const { service, prisma, twilio, outbox } = setup();
      prisma.telephonyProvisioningRun.findUnique.mockResolvedValue(draftRun());
      prisma.telephonyAccount.findUnique.mockResolvedValue(makeAccount());
      prisma.telephonyPhoneNumber.findFirst.mockResolvedValue(makeNumber());

      await service.stepDraftCompliance(RUN_ID);

      expect(twilio.createBundle).not.toHaveBeenCalled();
      expect(prisma.telephonyProvisioningRun.update).toHaveBeenCalledWith(statusData(S.COMPLIANCE_APPROVED));
      // three SKIPPED timeline hops recorded
      expect(prisma.telephonyProvisioningStep.create).toHaveBeenCalledTimes(3);
      expect(outbox.append).toHaveBeenCalledWith(prisma, emitOf("telephony.provisioning.compliance-approved"));
    });

    /** The OR the reuse query was called with, for `matchesClass`. */
    const classClauseOf = (prisma: any): ClassClause[] =>
      prisma.telephonyPhoneNumber.findFirst.mock.calls[0][0].where.OR;

    it("bundle reuse for a local run matches ONLY the stored local class", async () => {
      const { service, prisma } = setup();
      prisma.telephonyProvisioningRun.findUnique.mockResolvedValue(makeRun({ status: S.SUBACCOUNT_CREATED, accountId: ACCOUNT_ID, numberType: "local" }));
      prisma.telephonyAccount.findUnique.mockResolvedValue(makeAccount());

      await service.stepDraftCompliance(RUN_ID);

      const or = classClauseOf(prisma);
      // The stored class decides, full stop.
      expect(matchesClass(or, { numberType: "local", phoneNumberE164: "+61255501234" })).toBe(true);
      // A mobile bundle can never buy a local number.
      expect(matchesClass(or, { numberType: "mobile", phoneNumberE164: "+61400000000" })).toBe(false);
      // A mobile-LOOKING number explicitly recorded as local is still local. An earlier form
      // ORed the "+614" prefix in and matched both arms here, handing a mobile run a local
      // bundle - the precise opposite of treating the stored class as authoritative.
      expect(matchesClass(or, { numberType: "mobile", phoneNumberE164: "+61255501234" })).toBe(false);
    });

    it("bundle reuse for a mobile run matches ONLY the stored mobile class", async () => {
      const { service, prisma } = setup();
      prisma.telephonyProvisioningRun.findUnique.mockResolvedValue(draftRun());
      prisma.telephonyAccount.findUnique.mockResolvedValue(makeAccount());

      await service.stepDraftCompliance(RUN_ID);

      const or = classClauseOf(prisma);
      expect(matchesClass(or, { numberType: "mobile", phoneNumberE164: "+61400000000" })).toBe(true);
      expect(matchesClass(or, { numberType: "local", phoneNumberE164: "+61255501234" })).toBe(false);
      // A local number that happens to carry a mobile prefix must NOT satisfy a mobile run.
      expect(matchesClass(or, { numberType: "local", phoneNumberE164: "+61400000000" })).toBe(false);
    });

    it('passes the run\'s numberType through to the Twilio bundle ("local" regulation)', async () => {
      const { service, prisma, twilio } = setup();
      prisma.telephonyProvisioningRun.findUnique.mockResolvedValue(makeRun({ status: S.SUBACCOUNT_CREATED, accountId: ACCOUNT_ID, numberType: "local" }));
      prisma.telephonyAccount.findUnique.mockResolvedValue(makeAccount());

      await service.stepDraftCompliance(RUN_ID);

      expect(twilio.createBundle).toHaveBeenCalledWith(
        expect.anything(),
        expect.any(String),
        "compliance@example.org",
        expect.any(String),
        "local",
      );
    });

    it("parks FAILED (resume SUBACCOUNT_CREATED) when a Twilio compliance call throws", async () => {
      const { service, prisma, twilio, outbox } = setup();
      prisma.telephonyProvisioningRun.findUnique.mockResolvedValue(draftRun());
      prisma.telephonyAccount.findUnique.mockResolvedValue(makeAccount());
      twilio.createAddress.mockRejectedValue(new Error("address failed"));

      await service.stepDraftCompliance(RUN_ID);

      expect(prisma.telephonyProvisioningRun.update).toHaveBeenCalledWith(
        statusData(S.FAILED, { resumeStatus: S.SUBACCOUNT_CREATED }),
      );
      expect(outbox.append).toHaveBeenCalledWith(prisma, emitOf("telephony.provisioning.failed"));
    });

    it("fails when the run has no account (subaccount step incomplete)", async () => {
      const { service, prisma, outbox } = setup();
      prisma.telephonyProvisioningRun.findUnique.mockResolvedValue(makeRun({ status: S.SUBACCOUNT_CREATED, accountId: null }));

      await service.stepDraftCompliance(RUN_ID);

      expect(prisma.telephonyProvisioningRun.update).toHaveBeenCalledWith(statusData(S.FAILED));
      expect(outbox.append).toHaveBeenCalledWith(prisma, emitOf("telephony.provisioning.failed"));
    });
  });

  describe("stepSubmitBundle", () => {
    const submitRun = () => makeRun({ status: S.COMPLIANCE_DRAFT, accountId: ACCOUNT_ID, bundleSid: "BUnew" });

    it("COMPLIANCE_DRAFT → COMPLIANCE_SUBMITTED: submits the bundle and emits compliance-submitted", async () => {
      const { service, prisma, twilio, outbox } = setup();
      prisma.telephonyProvisioningRun.findUnique.mockResolvedValue(submitRun());
      prisma.telephonyAccount.findUnique.mockResolvedValue(makeAccount());

      await service.stepSubmitBundle(RUN_ID);

      expect(twilio.submitBundle).toHaveBeenCalledWith(expect.objectContaining({ accountSid: ACCOUNT_SID }), "BUnew");
      expect(prisma.telephonyProvisioningRun.update).toHaveBeenCalledWith(statusData(S.COMPLIANCE_SUBMITTED));
      expect(outbox.append).toHaveBeenCalledWith(prisma, emitOf("telephony.provisioning.compliance-submitted"));
    });

    it("parks FAILED (resume COMPLIANCE_DRAFT) when submit throws", async () => {
      const { service, prisma, twilio, outbox } = setup();
      prisma.telephonyProvisioningRun.findUnique.mockResolvedValue(submitRun());
      prisma.telephonyAccount.findUnique.mockResolvedValue(makeAccount());
      twilio.submitBundle.mockRejectedValue(new Error("submit failed"));

      await service.stepSubmitBundle(RUN_ID);

      expect(prisma.telephonyProvisioningRun.update).toHaveBeenCalledWith(
        statusData(S.FAILED, { resumeStatus: S.COMPLIANCE_DRAFT }),
      );
      expect(outbox.append).toHaveBeenCalledWith(prisma, emitOf("telephony.provisioning.failed"));
    });

    it("short-circuits when the run is not in COMPLIANCE_DRAFT", async () => {
      const { service, prisma, twilio, outbox, logger } = setup();
      prisma.telephonyProvisioningRun.findUnique.mockResolvedValue(makeRun({ status: S.COMPLIANCE_SUBMITTED }));

      await service.stepSubmitBundle(RUN_ID);

      expect(twilio.submitBundle).not.toHaveBeenCalled();
      expect(outbox.append).not.toHaveBeenCalled();
      expect(logger.warn).toHaveBeenCalled();
    });
  });

  describe("applyBundleStatus", () => {
    it("twilio-approved: COMPLIANCE_SUBMITTED → APPROVED, emits compliance-approved", async () => {
      const { service, prisma, outbox } = setup();
      prisma.telephonyProvisioningRun.findUnique.mockResolvedValue(makeRun({ status: S.COMPLIANCE_SUBMITTED, bundleSid: "BUnew" }));

      await service.applyBundleStatus("BUnew", "twilio-approved");

      expect(prisma.telephonyProvisioningRun.update).toHaveBeenCalledWith(statusData(S.COMPLIANCE_APPROVED));
      expect(outbox.append).toHaveBeenCalledWith(prisma, emitOf("telephony.provisioning.compliance-approved"));
    });

    it("twilio-rejected: COMPLIANCE_SUBMITTED → REJECTED, emits compliance-rejected with reason", async () => {
      const { service, prisma, outbox } = setup();
      prisma.telephonyProvisioningRun.findUnique.mockResolvedValue(makeRun({ status: S.COMPLIANCE_SUBMITTED, bundleSid: "BUnew" }));

      await service.applyBundleStatus("BUnew", "twilio-rejected", "bad docs");

      expect(prisma.telephonyProvisioningRun.update).toHaveBeenCalledWith(statusData(S.COMPLIANCE_REJECTED));
      expect(outbox.append).toHaveBeenCalledWith(
        prisma,
        expect.objectContaining({
          eventType: "telephony.provisioning.compliance-rejected",
          payload: expect.objectContaining({ reason: "bad docs" }),
        }),
      );
    });

    it("warns and no-ops for an unknown bundleSid", async () => {
      const { service, prisma, outbox, logger } = setup();
      prisma.telephonyProvisioningRun.findUnique.mockResolvedValue(null);

      await service.applyBundleStatus("BUmissing", "twilio-approved");

      expect(logger.warn).toHaveBeenCalled();
      expect(outbox.append).not.toHaveBeenCalled();
    });

    it("ignores a stale verdict when the run is no longer COMPLIANCE_SUBMITTED", async () => {
      const { service, prisma, outbox } = setup();
      prisma.telephonyProvisioningRun.findUnique.mockResolvedValue(makeRun({ status: S.COMPLIANCE_APPROVED, bundleSid: "BUnew" }));

      await service.applyBundleStatus("BUnew", "twilio-approved");

      expect(prisma.telephonyProvisioningRun.update).not.toHaveBeenCalled();
      expect(outbox.append).not.toHaveBeenCalled();
    });
  });

  describe("stepPurchaseNumber", () => {
    const approvedRun = (overrides: Record<string, unknown> = {}) =>
      makeRun({ status: S.COMPLIANCE_APPROVED, accountId: ACCOUNT_ID, bundleSid: "BUnew", addressSid: "ADnew", ...overrides });

    it("COMPLIANCE_APPROVED → NUMBER_PURCHASED: buys a number, writes the row, emits number-purchased", async () => {
      const { service, prisma, twilio, outbox } = setup();
      prisma.telephonyProvisioningRun.findUnique.mockResolvedValue(approvedRun());
      prisma.telephonyAccount.findUnique.mockResolvedValue(makeAccount());

      await service.stepPurchaseNumber(RUN_ID);

      expect(twilio.findAvailableAuNumber).toHaveBeenCalledWith(expect.anything(), "mobile");
      expect(twilio.purchaseNumber).toHaveBeenCalledWith(
        expect.anything(),
        expect.objectContaining({ bundleSid: "BUnew", addressSid: "ADnew", smsUrl: "https://api.test/api/v1/inbound-text-message-hook" }),
      );
      expect(prisma.telephonyPhoneNumber.create).toHaveBeenCalledWith(
        expect.objectContaining({
          data: expect.objectContaining({
            status: TelephonyNumberStatus.PENDING,
            phoneNumberE164: "+61400000000",
            // The regulation class is recorded, not left to be re-guessed from the prefix.
            numberType: "mobile",
            // A mobile number is SMS-only – never the voice caller id.
            purpose: "marketing",
          }),
        }),
      );
      expect(prisma.telephonyProvisioningRun.update).toHaveBeenCalledWith(statusData(S.NUMBER_PURCHASED));
      expect(outbox.append).toHaveBeenCalledWith(prisma, emitOf("telephony.provisioning.number-purchased"));
    });

    it('a "local" run searches local inventory and lands a voice-purpose number, never an SMS one', async () => {
      const { service, prisma, twilio } = setup();
      prisma.telephonyProvisioningRun.findUnique.mockResolvedValue(approvedRun({ numberType: "local" }));
      prisma.telephonyAccount.findUnique.mockResolvedValue(makeAccount());
      twilio.findAvailableAuNumber.mockResolvedValue("+61255501234");
      twilio.purchaseNumber.mockResolvedValue({ phoneNumberSid: "PN" + "8".repeat(32), phoneNumberE164: "+61255501234" });

      await service.stepPurchaseNumber(RUN_ID);

      expect(twilio.findAvailableAuNumber).toHaveBeenCalledWith(expect.anything(), "local");
      expect(prisma.telephonyPhoneNumber.create).toHaveBeenCalledWith(
        expect.objectContaining({
          data: expect.objectContaining({ phoneNumberE164: "+61255501234", purpose: "voice" }),
        }),
      );
    });

    it("records the run's regulation class on the purchased number row (stored class, not a prefix guess)", async () => {
      const { service, prisma, twilio } = setup();
      prisma.telephonyProvisioningRun.findUnique.mockResolvedValue(approvedRun({ numberType: "local" }));
      prisma.telephonyAccount.findUnique.mockResolvedValue(makeAccount());
      twilio.findAvailableAuNumber.mockResolvedValue("+61255501234");
      twilio.purchaseNumber.mockResolvedValue({ phoneNumberSid: "PN" + "8".repeat(32), phoneNumberE164: "+61255501234" });

      await service.stepPurchaseNumber(RUN_ID);

      expect(prisma.telephonyPhoneNumber.create).toHaveBeenCalledWith(
        expect.objectContaining({ data: expect.objectContaining({ numberType: "local" }) }),
      );
    });

    it("parks FAILED (resume COMPLIANCE_APPROVED) when number search throws", async () => {
      const { service, prisma, twilio, outbox } = setup();
      prisma.telephonyProvisioningRun.findUnique.mockResolvedValue(approvedRun());
      prisma.telephonyAccount.findUnique.mockResolvedValue(makeAccount());
      twilio.findAvailableAuNumber.mockRejectedValue(new Error("no inventory"));

      await service.stepPurchaseNumber(RUN_ID);

      expect(prisma.telephonyProvisioningRun.update).toHaveBeenCalledWith(
        statusData(S.FAILED, { resumeStatus: S.COMPLIANCE_APPROVED }),
      );
      expect(outbox.append).toHaveBeenCalledWith(prisma, emitOf("telephony.provisioning.failed"));
    });

    it("fails when the run has no approved bundle/address", async () => {
      const { service, prisma, twilio, outbox } = setup();
      prisma.telephonyProvisioningRun.findUnique.mockResolvedValue(
        makeRun({ status: S.COMPLIANCE_APPROVED, accountId: ACCOUNT_ID, bundleSid: null, addressSid: null }),
      );
      prisma.telephonyAccount.findUnique.mockResolvedValue(makeAccount());

      await service.stepPurchaseNumber(RUN_ID);

      expect(twilio.purchaseNumber).not.toHaveBeenCalled();
      expect(prisma.telephonyProvisioningRun.update).toHaveBeenCalledWith(statusData(S.FAILED));
      expect(outbox.append).toHaveBeenCalledWith(prisma, emitOf("telephony.provisioning.failed"));
    });
  });

  describe("stepConfigureWebhooks", () => {
    const purchasedRun = () =>
      makeRun({ status: S.NUMBER_PURCHASED, accountId: ACCOUNT_ID, phoneNumberId: NUMBER_ID });

    it("NUMBER_PURCHASED → WEBHOOKS_CONFIGURED: asserts the SmsUrl and emits webhooks-configured", async () => {
      const { service, prisma, twilio, outbox } = setup();
      prisma.telephonyProvisioningRun.findUnique.mockResolvedValue(purchasedRun());
      prisma.telephonyAccount.findUnique.mockResolvedValue(makeAccount());
      prisma.telephonyPhoneNumber.findUnique.mockResolvedValue(makeNumber());

      await service.stepConfigureWebhooks(RUN_ID);

      expect(twilio.configureNumberWebhook).toHaveBeenCalledWith(
        expect.anything(),
        makeNumber().phoneNumberSid,
        "https://api.test/api/v1/inbound-text-message-hook",
      );
      expect(prisma.telephonyProvisioningRun.update).toHaveBeenCalledWith(statusData(S.WEBHOOKS_CONFIGURED));
      expect(outbox.append).toHaveBeenCalledWith(prisma, emitOf("telephony.provisioning.webhooks-configured"));
    });

    it("parks FAILED (resume NUMBER_PURCHASED) when webhook config throws", async () => {
      const { service, prisma, twilio, outbox } = setup();
      prisma.telephonyProvisioningRun.findUnique.mockResolvedValue(purchasedRun());
      prisma.telephonyAccount.findUnique.mockResolvedValue(makeAccount());
      prisma.telephonyPhoneNumber.findUnique.mockResolvedValue(makeNumber());
      twilio.configureNumberWebhook.mockRejectedValue(new Error("webhook failed"));

      await service.stepConfigureWebhooks(RUN_ID);

      expect(prisma.telephonyProvisioningRun.update).toHaveBeenCalledWith(
        statusData(S.FAILED, { resumeStatus: S.NUMBER_PURCHASED }),
      );
      expect(outbox.append).toHaveBeenCalledWith(prisma, emitOf("telephony.provisioning.failed"));
    });
  });

  describe("stepActivate", () => {
    const configuredRun = () =>
      makeRun({ status: S.WEBHOOKS_CONFIGURED, accountId: ACCOUNT_ID, phoneNumberId: NUMBER_ID });

    it("WEBHOOKS_CONFIGURED → ACTIVE: flips number+account ACTIVE, invalidates sender cache, emits activated", async () => {
      const { service, prisma, outbox, senderResolver } = setup();
      prisma.telephonyProvisioningRun.findUnique.mockResolvedValue(configuredRun());
      prisma.telephonyPhoneNumber.findUnique.mockResolvedValue(makeNumber());

      await service.stepActivate(RUN_ID);

      expect(prisma.telephonyPhoneNumber.update).toHaveBeenCalledWith(
        expect.objectContaining({ data: { status: TelephonyNumberStatus.ACTIVE } }),
      );
      expect(prisma.telephonyAccount.update).toHaveBeenCalledWith(
        expect.objectContaining({ where: { id: ACCOUNT_ID }, data: { status: "ACTIVE" } }),
      );
      expect(prisma.telephonyProvisioningRun.update).toHaveBeenCalledWith(statusData(S.ACTIVE));
      expect(outbox.append).toHaveBeenCalledWith(prisma, emitOf("telephony.provisioning.activated"));
      expect(senderResolver.invalidate).toHaveBeenCalledWith(TENANT_ID);
    });

    it("parks FAILED (resume WEBHOOKS_CONFIGURED) when the purchased number row is missing", async () => {
      const { service, prisma, outbox, senderResolver } = setup();
      prisma.telephonyProvisioningRun.findUnique.mockResolvedValue(configuredRun());
      prisma.telephonyPhoneNumber.findUnique.mockResolvedValue(null);

      await service.stepActivate(RUN_ID);

      expect(prisma.telephonyProvisioningRun.update).toHaveBeenCalledWith(
        statusData(S.FAILED, { resumeStatus: S.WEBHOOKS_CONFIGURED }),
      );
      expect(outbox.append).toHaveBeenCalledWith(prisma, emitOf("telephony.provisioning.failed"));
      expect(senderResolver.invalidate).not.toHaveBeenCalled();
    });
  });

  // One provisioning process must yield BOTH of an organisation's numbers: a mobile to
  // text from and a local to call from.
  describe("maybeChainComplementaryRun", () => {
    const CHAINED_RUN_ID = "run-2";
    const activeRun = (overrides: Record<string, unknown> = {}) =>
      makeRun({
        status: S.ACTIVE,
        accountId: ACCOUNT_ID,
        phoneNumberId: NUMBER_ID,
        requestedById: "user-1",
        ...overrides,
      });

    /** Make the chained run come back with its own id, so the events are distinguishable. */
    const chainCreates = (prisma: any) =>
      prisma.telephonyProvisioningRun.create.mockImplementation(async (args: any) => ({
        id: CHAINED_RUN_ID,
        ...args.data,
      }));

    it("a completed mobile run starts a local run when the tenant has no local number", async () => {
      const { service, prisma, outbox } = setup();
      prisma.telephonyProvisioningRun.findUnique.mockResolvedValue(
        activeRun({
          complianceInput: {
            ...makeRun().complianceInput,
            // Source-run bookkeeping – the local run must not inherit a mobile bundle.
            reuse: { bundleSid: "BUprior", addressSid: "ADprior", sourceNumberId: NUMBER_ID },
          },
        }),
      );
      chainCreates(prisma);

      const result = await service.maybeChainComplementaryRun(RUN_ID);

      expect(result).toEqual({ chained: true, reason: "chained", runId: CHAINED_RUN_ID });
      expect(prisma.telephonyProvisioningRun.create).toHaveBeenCalledWith(
        expect.objectContaining({
          data: expect.objectContaining({
            tenantId: TENANT_ID,
            status: S.REQUESTED,
            numberType: "local",
            // The chained run never chains again.
            chainComplementary: false,
            // Subaccount already created by the first run.
            accountId: ACCOUNT_ID,
            requestedById: "user-1",
          }),
        }),
      );
      // Compliance details are carried over so the operator supplies them once…
      const created = prisma.telephonyProvisioningRun.create.mock.calls[0][0].data;
      expect(created.complianceInput).toEqual(
        expect.objectContaining({ legalName: "Legal Co", email: "compliance@example.org" }),
      );
      // …but the mobile bundle's reuse bookkeeping is dropped.
      expect(created.complianceInput.reuse).toBeUndefined();
      // The second run reads as a continuation, not a duplicate.
      expect(outbox.append).toHaveBeenCalledWith(prisma, emitOf("telephony.provisioning.chained"));
      expect(outbox.append).toHaveBeenCalledWith(prisma, emitOf("telephony.provisioning.requested"));
      expect(prisma.telephonyProvisioningStep.create).toHaveBeenCalledWith(
        expect.objectContaining({ data: expect.objectContaining({ runId: RUN_ID, step: "chain.complementary" }) }),
      );
    });

    it("does NOT chain when the tenant already holds a local number", async () => {
      const { service, prisma, outbox } = setup();
      prisma.telephonyProvisioningRun.findUnique.mockResolvedValue(activeRun());
      prisma.telephonyPhoneNumber.findFirst.mockResolvedValue(
        makeNumber({ id: "num-2", numberType: "local", phoneNumberE164: "+61255501234" }),
      );

      const result = await service.maybeChainComplementaryRun(RUN_ID);

      expect(result).toEqual({ chained: false, reason: "number-exists" });
      expect(prisma.telephonyProvisioningRun.create).not.toHaveBeenCalled();
      expect(outbox.append).not.toHaveBeenCalled();
    });

    it("does NOT chain when a local run is already in flight", async () => {
      const { service, prisma, outbox } = setup();
      prisma.telephonyProvisioningRun.findUnique.mockResolvedValue(activeRun());
      prisma.telephonyProvisioningRun.findFirst.mockResolvedValue(
        makeRun({ id: CHAINED_RUN_ID, numberType: "local", status: S.COMPLIANCE_SUBMITTED }),
      );

      const result = await service.maybeChainComplementaryRun(RUN_ID);

      expect(result).toEqual({ chained: false, reason: "run-exists" });
      expect(prisma.telephonyProvisioningRun.create).not.toHaveBeenCalled();
      expect(outbox.append).not.toHaveBeenCalled();
    });

    it("a completed LOCAL run starts nothing – the chain terminates", async () => {
      const { service, prisma, outbox } = setup();
      prisma.telephonyProvisioningRun.findUnique.mockResolvedValue(activeRun({ numberType: "local" }));

      const result = await service.maybeChainComplementaryRun(RUN_ID);

      expect(result).toEqual({ chained: false, reason: "chain-terminates" });
      expect(prisma.telephonyProvisioningRun.create).not.toHaveBeenCalled();
      expect(outbox.append).not.toHaveBeenCalled();
    });

    it("the opt-out (chainComplementary false) suppresses the chain", async () => {
      const { service, prisma, outbox } = setup();
      prisma.telephonyProvisioningRun.findUnique.mockResolvedValue(activeRun({ chainComplementary: false }));

      const result = await service.maybeChainComplementaryRun(RUN_ID);

      expect(result).toEqual({ chained: false, reason: "opted-out" });
      expect(prisma.telephonyProvisioningRun.create).not.toHaveBeenCalled();
      expect(outbox.append).not.toHaveBeenCalled();
    });

    it("ignores a replayed event for a run that is not (yet) ACTIVE", async () => {
      const { service, prisma } = setup();
      prisma.telephonyProvisioningRun.findUnique.mockResolvedValue(activeRun({ status: S.NUMBER_PURCHASED }));

      const result = await service.maybeChainComplementaryRun(RUN_ID);

      expect(result).toEqual({ chained: false, reason: "not-terminal" });
      expect(prisma.telephonyProvisioningRun.create).not.toHaveBeenCalled();
    });

    it("swallows and logs a chain failure rather than throwing – SMS is already live", async () => {
      const { service, prisma, logger } = setup();
      prisma.telephonyProvisioningRun.findUnique.mockResolvedValue(activeRun());
      prisma.$transaction.mockRejectedValue(new Error("db gone"));

      const result = await service.maybeChainComplementaryRun(RUN_ID);

      expect(result).toEqual({ chained: false, reason: "error" });
      expect(logger.error).toHaveBeenCalled();
    });

    it("a FAILED local run leaves the mobile number untouched (SMS is not held hostage)", async () => {
      const { service, prisma, twilio, outbox } = setup();
      prisma.telephonyProvisioningRun.findUnique.mockResolvedValue(
        makeRun({
          id: CHAINED_RUN_ID,
          status: S.COMPLIANCE_APPROVED,
          numberType: "local",
          chainComplementary: false,
          accountId: ACCOUNT_ID,
          bundleSid: "BUlocal",
          addressSid: "ADlocal",
        }),
      );
      prisma.telephonyAccount.findUnique.mockResolvedValue(makeAccount());
      twilio.findAvailableAuNumber.mockRejectedValue(new Error("no local inventory"));

      await service.stepPurchaseNumber(CHAINED_RUN_ID);

      expect(prisma.telephonyProvisioningRun.update).toHaveBeenCalledWith(
        expect.objectContaining({
          where: { id: CHAINED_RUN_ID },
          data: expect.objectContaining({ status: S.FAILED, resumeStatus: S.COMPLIANCE_APPROVED }),
        }),
      );
      expect(outbox.append).toHaveBeenCalledWith(prisma, emitOf("telephony.provisioning.failed"));
      // The mobile number and the account are never written by the local run's failure.
      expect(prisma.telephonyPhoneNumber.update).not.toHaveBeenCalled();
      expect(prisma.telephonyAccount.update).not.toHaveBeenCalled();
    });
  });
});

describe("TelephonyProvisioningService lifecycle + reads", () => {
  describe("startRun", () => {
    it("SUBACCOUNT mode: creates the run without an account and emits requested", async () => {
      const { service, prisma, outbox } = setup();

      await service.startRun({
        tenantId: TENANT_ID,
        mode: "SUBACCOUNT",
        complianceInput: makeRun().complianceInput as any,
      });

      expect(prisma.telephonyAccount.upsert).not.toHaveBeenCalled();
      expect(prisma.telephonyProvisioningRun.create).toHaveBeenCalledWith(
        expect.objectContaining({ data: expect.objectContaining({ status: S.REQUESTED, accountId: null }) }),
      );
      expect(outbox.append).toHaveBeenCalledWith(prisma, emitOf("telephony.provisioning.requested"));
    });

    it("BYO mode: upserts the account with encrypted creds", async () => {
      const { service, prisma, crypto, outbox } = setup();

      await service.startRun({
        tenantId: TENANT_ID,
        mode: "BYO",
        byoAccountSid: ACCOUNT_SID,
        byoAuthToken: "byo-token",
        complianceInput: makeRun().complianceInput as any,
      });

      expect(crypto.encrypt).toHaveBeenCalledWith("byo-token");
      expect(prisma.telephonyAccount.upsert).toHaveBeenCalled();
      expect(outbox.append).toHaveBeenCalledWith(prisma, emitOf("telephony.provisioning.requested"));
    });

    it("BYO mode without credentials throws BYO_CREDENTIALS_REQUIRED", async () => {
      const { service } = setup();

      await expectApiError(
        service.startRun({ tenantId: TENANT_ID, mode: "BYO", complianceInput: makeRun().complianceInput as any }),
        "BYO_CREDENTIALS_REQUIRED",
      );
    });

    it('stores numberType "local" on the run (default is "mobile")', async () => {
      const { service, prisma } = setup();

      await service.startRun({
        tenantId: TENANT_ID,
        mode: "SUBACCOUNT",
        numberType: "local",
        complianceInput: makeRun().complianceInput as any,
      });
      expect(prisma.telephonyProvisioningRun.create).toHaveBeenCalledWith(
        expect.objectContaining({ data: expect.objectContaining({ numberType: "local" }) }),
      );

      await service.startRun({
        tenantId: TENANT_ID,
        mode: "SUBACCOUNT",
        complianceInput: makeRun().complianceInput as any,
      });
      expect(prisma.telephonyProvisioningRun.create).toHaveBeenLastCalledWith(
        expect.objectContaining({ data: expect.objectContaining({ numberType: "mobile" }) }),
      );
    });

    it("chains the complementary class by default, and records an explicit opt-out", async () => {
      const { service, prisma } = setup();

      await service.startRun({
        tenantId: TENANT_ID,
        mode: "SUBACCOUNT",
        complianceInput: makeRun().complianceInput as any,
      });
      expect(prisma.telephonyProvisioningRun.create).toHaveBeenCalledWith(
        expect.objectContaining({ data: expect.objectContaining({ chainComplementary: true }) }),
      );

      await service.startRun({
        tenantId: TENANT_ID,
        mode: "SUBACCOUNT",
        chainComplementary: false,
        complianceInput: makeRun().complianceInput as any,
      });
      expect(prisma.telephonyProvisioningRun.create).toHaveBeenLastCalledWith(
        expect.objectContaining({ data: expect.objectContaining({ chainComplementary: false }) }),
      );
    });

    it("403s PLAN_UPGRADE_REQUIRED when the tenant telephony flag is off", async () => {
      const { service, flags, prisma } = setup();
      flags.isEnabled.mockResolvedValueOnce(false);

      await expectApiError(
        service.startRun({ tenantId: TENANT_ID, mode: "SUBACCOUNT", complianceInput: makeRun().complianceInput as any }),
        "PLAN_UPGRADE_REQUIRED",
      );
      expect(prisma.telephonyProvisioningRun.create).not.toHaveBeenCalled();
    });

    it("422s SETUP_INCOMPLETE with machine-readable missing[] when org identification is incomplete", async () => {
      const { service, prisma } = setup();
      prisma.orgProfile.findFirst.mockResolvedValue(null); // fresh tenant — nothing filled

      const promise = service.startRun({
        tenantId: TENANT_ID,
        mode: "SUBACCOUNT",
        complianceInput: makeRun().complianceInput as any,
      });
      await expect(promise).rejects.toMatchObject({
        response: {
          error: {
            code: "SETUP_INCOMPLETE",
            details: {
              missing: expect.arrayContaining([
                expect.objectContaining({ step: "businessLegal", field: "legalTradingName" }),
                expect.objectContaining({ step: "contacts" }),
                expect.objectContaining({ step: "address" }),
              ]),
            },
          },
        },
      });
      expect(prisma.telephonyProvisioningRun.create).not.toHaveBeenCalled();
    });

    it("retry is NOT gated — a mid-flight run survives later org-profile edits/plan changes", async () => {
      const { service, prisma, flags } = setup();
      prisma.orgProfile.findFirst.mockResolvedValue(null);
      flags.isEnabled.mockResolvedValue(false);
      prisma.telephonyProvisioningRun.findUnique.mockResolvedValue(
        makeRun({ status: S.FAILED, resumeStatus: S.COMPLIANCE_DRAFT }),
      );

      await expect(service.retry(RUN_ID)).resolves.toBeDefined();
    });
  });

  describe("retry", () => {
    it("re-enters resumeStatus and emits retry-requested + the entry event", async () => {
      const { service, prisma, outbox } = setup();
      prisma.telephonyProvisioningRun.findUnique.mockResolvedValue(
        makeRun({ status: S.FAILED, resumeStatus: S.REQUESTED }),
      );

      await service.retry(RUN_ID);

      expect(prisma.telephonyProvisioningRun.update).toHaveBeenCalledWith(statusData(S.REQUESTED));
      expect(outbox.append).toHaveBeenCalledWith(prisma, emitOf("telephony.provisioning.retry-requested"));
      expect(outbox.append).toHaveBeenCalledWith(prisma, emitOf("telephony.provisioning.requested"));
    });

    it("rejects a run that is not FAILED with a resume point", async () => {
      const { service, prisma } = setup();
      prisma.telephonyProvisioningRun.findUnique.mockResolvedValue(makeRun({ status: S.ACTIVE, resumeStatus: null }));

      await expectApiError(service.retry(RUN_ID), "NOT_RETRYABLE");
    });
  });

  describe("resubmit", () => {
    it("rejects a run that is not COMPLIANCE_REJECTED", async () => {
      const { service, prisma } = setup();
      prisma.telephonyProvisioningRun.findUnique.mockResolvedValue(makeRun({ status: S.COMPLIANCE_APPROVED }));

      await expectApiError(service.resubmit(RUN_ID), "NOT_REJECTED");
    });

    it("clears the bundle and re-runs the draft step for a rejected run", async () => {
      const { service, prisma, twilio } = setup();
      prisma.telephonyProvisioningRun.findUnique.mockResolvedValue(
        makeRun({ status: S.COMPLIANCE_REJECTED, accountId: ACCOUNT_ID }),
      );
      prisma.telephonyAccount.findUnique.mockResolvedValue(makeAccount());

      await service.resubmit(RUN_ID);

      // bundleSid nulled before redraft
      expect(prisma.telephonyProvisioningRun.update).toHaveBeenCalledWith(
        expect.objectContaining({ data: expect.objectContaining({ bundleSid: null }) }),
      );
      // draft step ran (new bundle built)
      expect(twilio.createBundle).toHaveBeenCalled();
      expect(prisma.telephonyProvisioningRun.update).toHaveBeenCalledWith(statusData(S.COMPLIANCE_DRAFT));
    });
  });

  describe("pollSubmittedBundles", () => {
    it("polls SUBMITTED runs and advances those Twilio has decided", async () => {
      const { service, prisma, twilio } = setup();
      const run = makeRun({ status: S.COMPLIANCE_SUBMITTED, accountId: ACCOUNT_ID, bundleSid: "BUnew" });
      prisma.telephonyProvisioningRun.findMany.mockResolvedValue([run]);
      prisma.telephonyProvisioningRun.findUnique.mockResolvedValue(run); // applyBundleStatus reload
      prisma.telephonyAccount.findUnique.mockResolvedValue(makeAccount());
      twilio.fetchBundleStatus.mockResolvedValue({ status: "twilio-approved", failureReason: null });

      const result = await service.pollSubmittedBundles();

      expect(twilio.fetchBundleStatus).toHaveBeenCalled();
      expect(result).toEqual({ polled: 1, advanced: 1 });
    });

    it("counts a still-pending bundle as polled but not advanced", async () => {
      const { service, prisma, twilio } = setup();
      const run = makeRun({ status: S.COMPLIANCE_SUBMITTED, accountId: ACCOUNT_ID, bundleSid: "BUnew" });
      prisma.telephonyProvisioningRun.findMany.mockResolvedValue([run]);
      prisma.telephonyAccount.findUnique.mockResolvedValue(makeAccount());
      twilio.fetchBundleStatus.mockResolvedValue({ status: "pending-review", failureReason: null });

      const result = await service.pollSubmittedBundles();

      expect(result).toEqual({ polled: 1, advanced: 0 });
    });
  });

  describe("releaseNumber", () => {
    it("releases an active number via Twilio, marks it RELEASED, invalidates the cache", async () => {
      const { service, prisma, twilio, senderResolver } = setup();
      prisma.telephonyPhoneNumber.findUnique.mockResolvedValue(makeNumber({ status: TelephonyNumberStatus.ACTIVE }));
      prisma.telephonyAccount.findUnique.mockResolvedValue(makeAccount());

      await service.releaseNumber(NUMBER_ID);

      expect(twilio.releaseNumber).toHaveBeenCalledWith(expect.anything(), makeNumber().phoneNumberSid);
      expect(prisma.telephonyPhoneNumber.update).toHaveBeenCalledWith(
        expect.objectContaining({ data: { status: TelephonyNumberStatus.RELEASED } }),
      );
      expect(senderResolver.invalidate).toHaveBeenCalledWith(TENANT_ID);
    });

    it("is a no-op for an already-released number", async () => {
      const { service, prisma, twilio } = setup();
      prisma.telephonyPhoneNumber.findUnique.mockResolvedValue(makeNumber({ status: TelephonyNumberStatus.RELEASED }));

      const result = await service.releaseNumber(NUMBER_ID);

      expect(twilio.releaseNumber).not.toHaveBeenCalled();
      expect(result.status).toBe(TelephonyNumberStatus.RELEASED);
    });

    it("throws when the number does not exist", async () => {
      const { service, prisma } = setup();
      prisma.telephonyPhoneNumber.findUnique.mockResolvedValue(null);

      await expect(service.releaseNumber("missing")).rejects.toThrow(/not found/i);
    });
  });

  describe("setNickname", () => {
    it("saves a trimmed nickname", async () => {
      const { service, prisma } = setup();
      prisma.telephonyPhoneNumber.findUnique.mockResolvedValue(makeNumber());

      await service.setNickname(NUMBER_ID, "  Field team  ", TENANT_ID);

      expect(prisma.telephonyPhoneNumber.update).toHaveBeenCalledWith(
        expect.objectContaining({ where: { id: NUMBER_ID }, data: { nickname: "Field team" } }),
      );
    });

    it("clears the nickname when given whitespace or empty", async () => {
      const { service, prisma } = setup();
      prisma.telephonyPhoneNumber.findUnique.mockResolvedValue(makeNumber());

      await service.setNickname(NUMBER_ID, "   ", TENANT_ID);

      expect(prisma.telephonyPhoneNumber.update).toHaveBeenCalledWith(
        expect.objectContaining({ data: { nickname: null } }),
      );
    });

    it("forbids renaming another tenant's number", async () => {
      const { service, prisma } = setup();
      prisma.telephonyPhoneNumber.findUnique.mockResolvedValue(makeNumber({ tenantId: "other-tenant" }));

      await expect(service.setNickname(NUMBER_ID, "Nope", TENANT_ID)).rejects.toThrow(/your own/i);
      expect(prisma.telephonyPhoneNumber.update).not.toHaveBeenCalled();
    });

    it("throws when the number does not exist", async () => {
      const { service, prisma } = setup();
      prisma.telephonyPhoneNumber.findUnique.mockResolvedValue(null);

      await expect(service.setNickname("missing", "x")).rejects.toThrow(/not found/i);
    });

    it('refuses to repurpose a +614 mobile as the calls number ("transactional")', async () => {
      const { service, prisma } = setup();
      prisma.telephonyPhoneNumber.findUnique.mockResolvedValue(makeNumber({ phoneNumberE164: "+61485052501" }));

      await expectApiError(
        service.setNickname(NUMBER_ID, undefined, TENANT_ID, "transactional"),
        "VOICE_NUMBER_REQUIRED",
      );
      expect(prisma.telephonyPhoneNumber.update).not.toHaveBeenCalled();
    });

    it("repurposes a local number to transactional (and leaves the nickname untouched)", async () => {
      const { service, prisma } = setup();
      prisma.telephonyPhoneNumber.findUnique.mockResolvedValue(makeNumber({ phoneNumberE164: "+61255501234" }));

      await service.setNickname(NUMBER_ID, undefined, TENANT_ID, "transactional");

      expect(prisma.telephonyPhoneNumber.update).toHaveBeenCalledWith(
        expect.objectContaining({ where: { id: NUMBER_ID }, data: { purpose: "transactional" } }),
      );
    });
  });

  describe("compliancePrefill", () => {
    it("maps the org profile (credential legal name, primary contact, registered address) to a compliance input", async () => {
      const { service, prisma } = setup();
      prisma.orgProfile.findFirst.mockResolvedValue({
        name: "Trading Name",
        credential: { legalTradingName: "Legal Org Ltd", australianBusinessNumber: "12 345 678 901", australianCompanyNumber: null },
        contacts: [
          { isPrimaryContact: false, firstName: "Bob", lastName: "Backup", email: "bob@example.org" },
          { isPrimaryContact: true, firstName: "Ada", lastName: "Lovelace", email: "ada@example.org" },
        ],
        addresses: [{ line1: "1 Test St", line2: "Level 2", suburb: "Sydney", city: null, state: "NSW", postcode: "2000" }],
      });

      const prefill = await service.compliancePrefill(TENANT_ID);

      expect(prefill).toEqual({
        legalName: "Legal Org Ltd",
        contactFirstName: "Ada",
        contactLastName: "Lovelace",
        email: "ada@example.org",
        businessNumber: "12345678901",
        address: { street: "1 Test St, Level 2", city: "Sydney", region: "NSW", postalCode: "2000" },
      });
    });


    // Twilio matches the bundle against the address registered to the ABN. A tenant can hold
    // several addresses and the billing one is commonly first, so picking addresses[0] would
    // submit the wrong one and get rejected by a human reviewer days later.
    it("prefers the REGISTERED address over a billing address listed first", async () => {
      const { service, prisma } = setup();
      prisma.orgProfile.findFirst.mockResolvedValue({
        name: "Org",
        credential: { legalTradingName: "Org Ltd", australianBusinessNumber: "43687271227", australianCompanyNumber: null },
        contacts: [{ isPrimaryContact: true, firstName: "A", lastName: "B", email: "a@b.org" }],
        addresses: [
          { addressType: "billing", line1: "99 Finance Way", suburb: "Docklands", city: null, state: "VIC", postcode: "3008" },
          { addressType: "registered", line1: "3 Albert Coates Ln", suburb: "Melbourne", city: null, state: "VIC", postcode: "3000" },
        ],
      });

      const prefill = await service.compliancePrefill(TENANT_ID);

      expect(prefill.address).toEqual({
        street: "3 Albert Coates Ln",
        city: "Melbourne",
        region: "VIC",
        postalCode: "3000",
      });
    });

    it("falls back to the first address when none is marked registered", async () => {
      const { service, prisma } = setup();
      prisma.orgProfile.findFirst.mockResolvedValue({
        name: "Org",
        credential: null,
        contacts: [],
        addresses: [{ addressType: "postal", line1: "1 Only St", suburb: "Perth", city: null, state: "WA", postcode: "6000" }],
      });

      const prefill = await service.compliancePrefill(TENANT_ID);

      expect(prefill.address.street).toBe("1 Only St");
    });

    // A real tenant's stored ABN carried a leading space, which went to Twilio verbatim.
    it.each([
      ["a grouped ABN", "43 687 271 227"],
      ["a leading space", " 43687271227"],
      ["an ABN written with the ABN prefix", "ABN 43 687 271 227"],
    ])("normalises %s to digits", async (_label, stored) => {
      const { service, prisma } = setup();
      prisma.orgProfile.findFirst.mockResolvedValue({
        name: "Org",
        credential: { legalTradingName: "Org Ltd", australianBusinessNumber: stored, australianCompanyNumber: null },
        contacts: [],
        addresses: [],
      });

      const prefill = await service.compliancePrefill(TENANT_ID);

      expect(prefill.businessNumber).toBe("43687271227");
    });

    it("returns undefined rather than an empty string when the number is only punctuation", async () => {
      const { service, prisma } = setup();
      prisma.orgProfile.findFirst.mockResolvedValue({
        name: "Org",
        credential: { legalTradingName: "Org Ltd", australianBusinessNumber: "  -  ", australianCompanyNumber: null },
        contacts: [],
        addresses: [],
      });

      const prefill = await service.compliancePrefill(TENANT_ID);

      expect(prefill.businessNumber).toBeUndefined();
    });

    it("returns empty fields when the tenant has no org profile", async () => {
      const { service, prisma } = setup();
      prisma.orgProfile.findFirst.mockResolvedValue(null);

      const prefill = await service.compliancePrefill(TENANT_ID);

      expect(prefill.legalName).toBe("");
      expect(prefill.email).toBe("");
      expect(prefill.businessNumber).toBeUndefined();
      expect(prefill.address).toEqual({ street: "", city: "", region: "", postalCode: "" });
    });
  });

  describe("reads", () => {
    it("listRuns filters by tenant", async () => {
      const { service, prisma } = setup();
      await service.listRuns(TENANT_ID);
      expect(prisma.telephonyProvisioningRun.findMany).toHaveBeenCalledWith(
        expect.objectContaining({ where: { tenantId: TENANT_ID } }),
      );
    });

    it("listNumbers with no tenant queries all", async () => {
      const { service, prisma } = setup();
      await service.listNumbers();
      expect(prisma.telephonyPhoneNumber.findMany).toHaveBeenCalledWith(
        expect.objectContaining({ where: undefined }),
      );
    });

    it("getRunWithTimeline returns the run with its ordered steps", async () => {
      const { service, prisma } = setup();
      prisma.telephonyProvisioningRun.findUnique.mockResolvedValue({ ...makeRun(), steps: [] });
      const run = await service.getRunWithTimeline(RUN_ID);
      expect(run.id).toBe(RUN_ID);
    });

    it("getRunWithTimeline throws when the run is missing", async () => {
      const { service, prisma } = setup();
      prisma.telephonyProvisioningRun.findUnique.mockResolvedValue(null);
      await expect(service.getRunWithTimeline("missing")).rejects.toThrow(/not found/i);
    });
  });

  describe("addDocument", () => {
    const ORIG = process.env.BLOB_READ_WRITE_TOKEN;
    afterEach(() => {
      if (ORIG === undefined) delete process.env.BLOB_READ_WRITE_TOKEN;
      else process.env.BLOB_READ_WRITE_TOKEN = ORIG;
    });

    it("uploads to blob storage and appends the document to the run", async () => {
      process.env.BLOB_READ_WRITE_TOKEN = "blob-token";
      const { service, prisma } = setup();
      prisma.telephonyProvisioningRun.findUnique.mockResolvedValue(makeRun());

      await service.addDocument(
        RUN_ID,
        { buffer: Buffer.from("pdf"), originalname: "reg.pdf", mimetype: "application/pdf" },
        "business_registration",
      );

      expect(put).toHaveBeenCalled();
      expect(prisma.telephonyProvisioningRun.update).toHaveBeenCalledWith(
        expect.objectContaining({ data: expect.objectContaining({ documents: expect.any(Array) }) }),
      );
    });

    it("throws when no file is provided", async () => {
      const { service, prisma } = setup();
      prisma.telephonyProvisioningRun.findUnique.mockResolvedValue(makeRun());

      await expectApiError(service.addDocument(RUN_ID, {}, "business_registration"), "NO_FILE");
    });

    it("throws when document storage is not configured", async () => {
      delete process.env.BLOB_READ_WRITE_TOKEN;
      delete process.env.BLOB_STORE_ID;
      const { service, prisma } = setup();
      prisma.telephonyProvisioningRun.findUnique.mockResolvedValue(makeRun());

      await expectApiError(
        service.addDocument(RUN_ID, { buffer: Buffer.from("x"), originalname: "x.pdf", mimetype: "application/pdf" }, "t"),
        "DOCUMENT_STORAGE_NOT_CONFIGURED",
      );
    });
  });
});
