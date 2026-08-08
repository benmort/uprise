import {
  TelephonyProvisioningStatus as S,
  TelephonyNumberStatus,
  TelephonyStepStatus,
} from "@uprise/db";
import { put } from "@vercel/blob";
import { TelephonyProvisioningService } from "./telephony-provisioning.service";
import { buildTelephonyProvisioningReactions } from "./telephony-provisioning.reactions";
import { ImageUploadService } from "../common/storage/image-upload.service";

// addDocument writes to Vercel Blob — mock the SDK so the unit spec never
// touches the network.
jest.mock("@vercel/blob", () => ({ put: jest.fn(async () => ({ url: "https://blob.test/doc.pdf" })) }));

const RUN_ID = "run-1";
const TENANT_ID = "tenant-1";
const ACCOUNT_ID = "acct-1";
const ACCOUNT_SID = "AC" + "1".repeat(32);
const NUMBER_ID = "num-1";

// Obviously-fake, correctly-SHAPED Twilio SIDs: BU/AD + 32 hex. The shape is the point –
// the service refuses anything else rather than passing junk to Twilio.
const SUPPLIED_BUNDLE_SID = "BU" + "a".repeat(32);
const SUPPLIED_ADDRESS_SID = "AD" + "b".repeat(32);

const ENV: Record<string, string> = { API_BASE_URL: "https://api.test" };

/** The inbound-voice TwiML route a local (calls) number is pointed at. */
const VOICE_URL = "https://api.test/api/v1/voice-outbound";

/** A compliance document as `addDocument` stores it, once uploaded to Twilio. */
const UPLOADED_DOC = {
  blobUrl: "https://blob.test/telephony-compliance/run-1/reg.pdf",
  fileName: "reg.pdf",
  contentType: "application/pdf",
  type: "business_registration",
  supportingDocumentSid: "RD" + "7".repeat(32),
};

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
    // Non-regional by default – the column is null on every account that predates it.
    region: null as string | null,
    edge: null as string | null,
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

/** The SID of a number the BYO account already owns. Obviously fake, correctly shaped. */
const OWNED_SID = "PN" + "c".repeat(32);
/** A TwiML application on a hook – the organisation's own autodialer, not ours. */
const FOREIGN_APP_SID = "AP" + "d".repeat(32);

/**
 * A number the tenant's Twilio account ALREADY owns, as the client reports it. The defaults
 * mirror the real BYO account: a +614 mobile, BOTH voice and SMS enabled, a live voice
 * configuration pointing at the organisation's existing autodialer, and messaging blank.
 */
function makeOwnedNumber(overrides: Record<string, unknown> = {}) {
  return {
    phoneNumberE164: "+61400000001",
    phoneNumberSid: OWNED_SID,
    friendlyName: "Existing line",
    capabilities: { voice: true, sms: true, mms: true },
    voiceUrl: "https://example-autodialer.test/voice",
    voiceApplicationSid: FOREIGN_APP_SID,
    voiceFallbackUrl: null as string | null,
    trunkSid: null as string | null,
    smsUrl: null as string | null,
    smsApplicationSid: null as string | null,
    smsFallbackUrl: null as string | null,
    ...overrides,
  };
}

/** The `existing` shape every hook report carries; overridden per-case. */
const freeHook = (overrides: Record<string, unknown> = {}) => ({
  url: null,
  applicationSid: null,
  fallbackUrl: null,
  trunkSid: null,
  ...overrides,
});

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
    // What Twilio says a SUPPLIED bundle/address actually are. Approved, Australian and
    // mobile by default – the class of the run `makeRun()` builds.
    fetchBundleFacts: jest.fn(async () => ({
      status: "twilio-approved",
      numberType: "mobile" as string | null,
      isoCountry: "AU" as string | null,
    })),
    fetchAddressCountry: jest.fn(async () => "AU" as string | null),
    findAvailableAuNumber: jest.fn(async () => "+61400000000"),
    purchaseNumber: jest.fn(async () => ({ phoneNumberSid: "PN" + "9".repeat(32), phoneNumberE164: "+61400000000" })),
    configureNumberWebhook: jest.fn(async (..._args: any[]) => undefined),
    releaseNumber: jest.fn(async () => undefined),
    // What the BYO account already owns. Default: the real account's shape – an AU mobile
    // with BOTH capabilities, a working foreign voice configuration, and messaging blank.
    listOwnedNumbers: jest.fn(async (): Promise<any[]> => [makeOwnedNumber()]),
    fetchOwnedNumber: jest.fn(async (): Promise<any> => makeOwnedNumber()),
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

    // The other half of the chained-documents fix: a run that CARRIES documents must draft
    // its bundle with them assigned, and must not re-upload one that already has a SID.
    it("assigns the run's already-uploaded documents to the new bundle without re-uploading", async () => {
      const { service, prisma, twilio } = setup();
      prisma.telephonyProvisioningRun.findUnique.mockResolvedValue(
        makeRun({
          status: S.SUBACCOUNT_CREATED,
          accountId: ACCOUNT_ID,
          numberType: "local",
          documents: [UPLOADED_DOC],
        }),
      );
      prisma.telephonyAccount.findUnique.mockResolvedValue(makeAccount());

      await service.stepDraftCompliance(RUN_ID);

      expect(twilio.createSupportingDocument).not.toHaveBeenCalled();
      // endUser + address + the inherited document.
      expect(twilio.assignBundleItem).toHaveBeenCalledTimes(3);
      expect(twilio.assignBundleItem).toHaveBeenCalledWith(
        expect.anything(),
        "BUnew",
        UPLOADED_DOC.supportingDocumentSid,
      );
      expect(prisma.telephonyProvisioningRun.update).toHaveBeenCalledWith(
        statusData(S.COMPLIANCE_DRAFT, { documents: [UPLOADED_DOC] }),
      );
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
      // The stored bookkeeping still names the prior NUMBER row it came from – the
      // operator-supplied provenance must not have swallowed this branch.
      const stored = prisma.telephonyProvisioningRun.update.mock.calls[0][0].data.complianceInput;
      expect(stored.reuse).toEqual(
        expect.objectContaining({
          bundleSid: "BUprior",
          addressSid: "ADprior",
          sourceNumberId: NUMBER_ID,
          source: "prior-number",
        }),
      );
    });

    // A tenant that brings its own Twilio account has ALREADY been through the AU regulatory
    // journey on it: approved bundle, registered address. `startRun` stores that pair as the
    // run's reuse bookkeeping, stamped with the class it is approved for.
    const suppliedRun = (
      numberType: "mobile" | "local" = "mobile",
      approvedFor = numberType,
      overrides: Record<string, unknown> = {},
    ) =>
      makeRun({
        status: S.SUBACCOUNT_CREATED,
        accountId: ACCOUNT_ID,
        numberType,
        ...overrides,
        complianceInput: {
          ...makeRun().complianceInput,
          reuse: {
            bundleSid: SUPPLIED_BUNDLE_SID,
            addressSid: SUPPLIED_ADDRESS_SID,
            source: "operator-supplied",
            numberType: approvedFor,
          },
        },
      });

    it("an operator-supplied bundle+address skips DRAFT→SUBMITTED→APPROVED with SKIPPED steps", async () => {
      const { service, prisma, outbox } = setup();
      prisma.telephonyProvisioningRun.findUnique.mockResolvedValue(suppliedRun());
      prisma.telephonyAccount.findUnique.mockResolvedValue(makeAccount({ mode: "BYO" }));

      await service.stepDraftCompliance(RUN_ID);

      expect(prisma.telephonyProvisioningRun.update).toHaveBeenCalledWith(
        // The bundle SID is deliberately NOT written onto the run (it is unique per run and
        // the supplied bundle is not this run's to own) – only the address it buys against.
        statusData(S.COMPLIANCE_APPROVED, { addressSid: SUPPLIED_ADDRESS_SID }),
      );
      const steps = prisma.telephonyProvisioningStep.create.mock.calls.map((c: any) => c[0].data);
      expect(steps.map((s: any) => [s.step, s.status])).toEqual([
        ["compliance.draft", TelephonyStepStatus.SKIPPED],
        ["compliance.submit", TelephonyStepStatus.SKIPPED],
        ["compliance.review", TelephonyStepStatus.SKIPPED],
      ]);
      expect(outbox.append).toHaveBeenCalledWith(prisma, emitOf("telephony.provisioning.compliance-approved"));
    });

    // The whole point: the human review at Twilio has already happened on this account, so
    // nothing may be drafted, uploaded or submitted a second time.
    it("creates no bundle, uploads no document and never queries a prior number on the supplied path", async () => {
      const { service, prisma, twilio } = setup();
      prisma.telephonyProvisioningRun.findUnique.mockResolvedValue(suppliedRun());
      prisma.telephonyAccount.findUnique.mockResolvedValue(makeAccount({ mode: "BYO" }));

      await service.stepDraftCompliance(RUN_ID);

      expect(twilio.createBundle).not.toHaveBeenCalled();
      expect(twilio.createAddress).not.toHaveBeenCalled();
      expect(twilio.createEndUser).not.toHaveBeenCalled();
      expect(twilio.createSupportingDocument).not.toHaveBeenCalled();
      expect(twilio.assignBundleItem).not.toHaveBeenCalled();
      expect(twilio.submitBundle).not.toHaveBeenCalled();
      expect(prisma.telephonyPhoneNumber.findFirst).not.toHaveBeenCalled();
    });

    // A run carrying a supplied bundle can only reach COMPLIANCE_REJECTED if that bundle
    // turned out unusable, so a resubmit must draft a FRESH one. Re-taking the fast-path
    // would re-approve the same rejected bundle and the operator's resubmit would fix
    // nothing, forever.
    it("a resubmit after rejection drafts a fresh bundle instead of re-taking the supplied fast-path", async () => {
      const { service, prisma, twilio } = setup();
      prisma.telephonyProvisioningRun.findUnique.mockResolvedValue(
        suppliedRun("mobile", "mobile", { status: S.COMPLIANCE_REJECTED }),
      );
      prisma.telephonyAccount.findUnique.mockResolvedValue(makeAccount({ mode: "BYO" }));

      await service.stepDraftCompliance(RUN_ID);

      expect(twilio.createBundle).toHaveBeenCalled();
      expect(prisma.telephonyProvisioningRun.update).toHaveBeenCalledWith(statusData(S.COMPLIANCE_DRAFT));
    });

    // Honest about what this pins: `startRun` writes the run's class and the stamp together
    // (after checking the class against Twilio – see `SUPPLIED_BUNDLE_WRONG_CLASS`), so a
    // mismatch cannot arrive through the API. What it CAN come from is the stored JSON,
    // which is hand-editable and sits for days. This is that consistency assertion, and the
    // point of it is the direction of the failure: fall back to drafting a fresh bundle,
    // never buy against a bundle of the wrong regulation.
    it("drafts a fresh bundle when the stored stamp disagrees with the run's class", async () => {
      const { service, prisma, twilio, logger } = setup();
      prisma.telephonyProvisioningRun.findUnique.mockResolvedValue(suppliedRun("local", "mobile"));
      prisma.telephonyAccount.findUnique.mockResolvedValue(makeAccount({ mode: "BYO" }));

      await service.stepDraftCompliance(RUN_ID);

      expect(twilio.createBundle).toHaveBeenCalledWith(
        expect.anything(),
        expect.any(String),
        expect.any(String),
        expect.any(String),
        "local",
      );
      expect(prisma.telephonyProvisioningRun.update).toHaveBeenCalledWith(statusData(S.COMPLIANCE_DRAFT));
      expect(logger.warn).toHaveBeenCalled();
    });

    // Region/edge are a property of the ACCOUNT row, so every Twilio call made on that
    // account's behalf has to carry them or it routes to the wrong Twilio region.
    it("threads the account's region + edge into the creds it hands the Twilio client", async () => {
      const { service, prisma, twilio } = setup();
      prisma.telephonyProvisioningRun.findUnique.mockResolvedValue(draftRun());
      prisma.telephonyAccount.findUnique.mockResolvedValue(
        makeAccount({ mode: "BYO", region: "au1", edge: "sydney" }),
      );

      await service.stepDraftCompliance(RUN_ID);

      expect(twilio.createAddress).toHaveBeenCalledWith(
        expect.objectContaining({ accountSid: ACCOUNT_SID, region: "au1", edge: "sydney" }),
        expect.anything(),
      );
    });

    it("passes a null region for a non-regional account (today's behaviour, unchanged)", async () => {
      const { service, prisma, twilio } = setup();
      prisma.telephonyProvisioningRun.findUnique.mockResolvedValue(draftRun());
      prisma.telephonyAccount.findUnique.mockResolvedValue(makeAccount());

      await service.stepDraftCompliance(RUN_ID);

      expect(twilio.createAddress).toHaveBeenCalledWith(
        expect.objectContaining({ region: null, edge: null }),
        expect.anything(),
      );
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
        expect.objectContaining({
          bundleSid: "BUnew",
          addressSid: "ADnew",
          // A mobile is the SMS sender, so it is bought with the inbound SMS hook.
          webhooks: { smsUrl: "https://api.test/api/v1/inbound-text-message-hook", smsMethod: "POST" },
        }),
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

    /**
     * The single load-bearing line of the whole supplied-bundle feature.
     *
     * The fast-path deliberately never writes `bundleSid` onto the run row (the supplied
     * bundle is not this run's to own, and `applyBundleStatus` looks runs up BY that column),
     * so the `?? input.reuse?.bundleSid` fallback here is the ONLY thing that carries the
     * operator's bundle to the purchase. Break it and every supplied-bundle run throws "Run
     * has no approved bundle/address to purchase with" and parks FAILED – the exact outcome
     * the feature exists to avoid. Both provenances are pinned: prior-number reuse stores its
     * pair the same way.
     */
    it.each([
      ["operator-supplied", { source: "operator-supplied", numberType: "mobile", classVerified: true }],
      ["prior-number", { source: "prior-number", sourceNumberId: NUMBER_ID }],
    ])("purchases against the %s bundle carried in reuse when the run row has none", async (_name, provenance) => {
      const { service, prisma, twilio } = setup();
      prisma.telephonyProvisioningRun.findUnique.mockResolvedValue(
        approvedRun({
          bundleSid: null,
          addressSid: null,
          complianceInput: {
            ...makeRun().complianceInput,
            reuse: { bundleSid: SUPPLIED_BUNDLE_SID, addressSid: SUPPLIED_ADDRESS_SID, ...provenance },
          },
        }),
      );
      prisma.telephonyAccount.findUnique.mockResolvedValue(makeAccount({ mode: "BYO" }));

      await service.stepPurchaseNumber(RUN_ID);

      expect(twilio.purchaseNumber).toHaveBeenCalledWith(
        expect.anything(),
        expect.objectContaining({ bundleSid: SUPPLIED_BUNDLE_SID, addressSid: SUPPLIED_ADDRESS_SID }),
      );
      // And the number row records the pair it was actually bought against, so a later run
      // of the same class can reuse it.
      expect(prisma.telephonyPhoneNumber.create).toHaveBeenCalledWith(
        expect.objectContaining({
          data: expect.objectContaining({ bundleSid: SUPPLIED_BUNDLE_SID, addressSid: SUPPLIED_ADDRESS_SID }),
        }),
      );
      expect(prisma.telephonyProvisioningRun.update).toHaveBeenCalledWith(statusData(S.NUMBER_PURCHASED));
    });

    // The run row wins when it HAS a bundle: a run that drafted its own must never buy
    // against stale reuse bookkeeping left in its compliance JSON.
    it("prefers the run's own bundle over the reuse bookkeeping", async () => {
      const { service, prisma, twilio } = setup();
      prisma.telephonyProvisioningRun.findUnique.mockResolvedValue(
        approvedRun({
          complianceInput: {
            ...makeRun().complianceInput,
            reuse: { bundleSid: SUPPLIED_BUNDLE_SID, addressSid: SUPPLIED_ADDRESS_SID, source: "operator-supplied" },
          },
        }),
      );
      prisma.telephonyAccount.findUnique.mockResolvedValue(makeAccount());

      await service.stepPurchaseNumber(RUN_ID);

      expect(twilio.purchaseNumber).toHaveBeenCalledWith(
        expect.anything(),
        expect.objectContaining({ bundleSid: "BUnew", addressSid: "ADnew" }),
      );
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

    // The local number is the one the organisation calls from; buying it with only an SMS
    // hook left inbound calls to it unanswered and configured a hook that can never fire.
    it("buys a local number with a VOICE webhook, never the SMS hook", async () => {
      const { service, prisma, twilio } = setup();
      prisma.telephonyProvisioningRun.findUnique.mockResolvedValue(approvedRun({ numberType: "local" }));
      prisma.telephonyAccount.findUnique.mockResolvedValue(makeAccount());
      twilio.findAvailableAuNumber.mockResolvedValue("+61255501234");
      twilio.purchaseNumber.mockResolvedValue({ phoneNumberSid: "PN" + "8".repeat(32), phoneNumberE164: "+61255501234" });

      await service.stepPurchaseNumber(RUN_ID);

      // An exact object match: an SMS hook alongside the voice one would fail here.
      expect(twilio.purchaseNumber).toHaveBeenCalledWith(
        expect.anything(),
        expect.objectContaining({ webhooks: { voiceUrl: VOICE_URL, voiceMethod: "POST" } }),
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

    // The gate on the MONEY event. Everything else is checked before the run parks in
    // COMPLIANCE_SUBMITTED for the days a human at Twilio takes; the plan can lapse in that
    // window, and this is the step that buys a recurring number. Guarding only the chain's
    // creation left both the lapse-mid-flight path and the ungated retry() able to spend.
    it("refuses to buy a number when the tenant's telephony plan has lapsed mid-flight", async () => {
      const { service, prisma, twilio, outbox, flags } = setup();
      prisma.telephonyProvisioningRun.findUnique.mockResolvedValue(approvedRun());
      prisma.telephonyAccount.findUnique.mockResolvedValue(makeAccount());
      flags.isEnabled.mockResolvedValue(false);

      await service.stepPurchaseNumber(RUN_ID);

      expect(flags.isEnabled).toHaveBeenCalledWith("FEATURE_TENANT_TELEPHONY_ENABLED", { tenantId: TENANT_ID });
      // Nothing bought, nothing searched – the refusal is before any Twilio call.
      expect(twilio.findAvailableAuNumber).not.toHaveBeenCalled();
      expect(twilio.purchaseNumber).not.toHaveBeenCalled();
      expect(prisma.telephonyPhoneNumber.create).not.toHaveBeenCalled();
      // Parked, not lost: the approved bundle survives and retry re-enters here (and so
      // re-checks) once the plan is restored.
      expect(prisma.telephonyProvisioningRun.update).toHaveBeenCalledWith(
        statusData(S.FAILED, { resumeStatus: S.COMPLIANCE_APPROVED }),
      );
      expect(outbox.append).toHaveBeenCalledWith(prisma, emitOf("telephony.provisioning.failed"));
    });

    it("buys the number when the plan is still enabled", async () => {
      const { service, prisma, twilio, flags } = setup();
      prisma.telephonyProvisioningRun.findUnique.mockResolvedValue(approvedRun());
      prisma.telephonyAccount.findUnique.mockResolvedValue(makeAccount());
      flags.isEnabled.mockResolvedValue(true);

      await service.stepPurchaseNumber(RUN_ID);

      expect(twilio.purchaseNumber).toHaveBeenCalled();
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

    it("NUMBER_PURCHASED → WEBHOOKS_CONFIGURED: asserts the SmsUrl on a mobile and emits webhooks-configured", async () => {
      const { service, prisma, twilio, outbox } = setup();
      prisma.telephonyProvisioningRun.findUnique.mockResolvedValue(purchasedRun());
      prisma.telephonyAccount.findUnique.mockResolvedValue(makeAccount());
      prisma.telephonyPhoneNumber.findUnique.mockResolvedValue(makeNumber());

      await service.stepConfigureWebhooks(RUN_ID);

      expect(twilio.configureNumberWebhook).toHaveBeenCalledWith(
        expect.anything(),
        makeNumber().phoneNumberSid,
        { smsUrl: "https://api.test/api/v1/inbound-text-message-hook", smsMethod: "POST" },
      );
      expect(prisma.telephonyProvisioningRun.update).toHaveBeenCalledWith(statusData(S.WEBHOOKS_CONFIGURED));
      expect(outbox.append).toHaveBeenCalledWith(prisma, emitOf("telephony.provisioning.webhooks-configured"));
    });

    // A local number cannot receive SMS, so the SMS hook on it was a hook that could never
    // fire – while inbound calls to the organisation's published calls number went nowhere.
    it("asserts a VOICE webhook on a local number (and no SMS hook)", async () => {
      const { service, prisma, twilio } = setup();
      prisma.telephonyProvisioningRun.findUnique.mockResolvedValue(
        makeRun({ status: S.NUMBER_PURCHASED, accountId: ACCOUNT_ID, phoneNumberId: NUMBER_ID, numberType: "local" }),
      );
      prisma.telephonyAccount.findUnique.mockResolvedValue(makeAccount());
      prisma.telephonyPhoneNumber.findUnique.mockResolvedValue(
        makeNumber({ numberType: "local", phoneNumberE164: "+61255501234" }),
      );

      await service.stepConfigureWebhooks(RUN_ID);

      expect(twilio.configureNumberWebhook).toHaveBeenCalledWith(
        expect.anything(),
        makeNumber().phoneNumberSid,
        { voiceUrl: VOICE_URL, voiceMethod: "POST" },
      );
      // The voice URL is a REAL, signature-validated route in this repo, not an invention;
      // and the exact-object match above means no smsUrl rides along with it.
      expect(VOICE_URL).toBe("https://api.test/api/v1/voice-outbound");
    });

    // The class recorded on the number row is what was actually bought; a run row that
    // disagrees must not talk the step into configuring the wrong hook.
    it("follows the NUMBER row's class, not the run's, when they disagree", async () => {
      const { service, prisma, twilio } = setup();
      prisma.telephonyProvisioningRun.findUnique.mockResolvedValue(purchasedRun()); // run says mobile
      prisma.telephonyAccount.findUnique.mockResolvedValue(makeAccount());
      prisma.telephonyPhoneNumber.findUnique.mockResolvedValue(makeNumber({ numberType: "local" }));

      await service.stepConfigureWebhooks(RUN_ID);

      expect(twilio.configureNumberWebhook).toHaveBeenCalledWith(expect.anything(), expect.any(String), {
        voiceUrl: VOICE_URL,
        voiceMethod: "POST",
      });
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

    // The operator-supplied bundle was approved for ONE regulation class. Inheriting it would
    // have the local run buy a local number against a mobile bundle; the local half must
    // draft (and have reviewed) its own.
    it("the chained run does NOT inherit an operator-supplied bundle", async () => {
      const { service, prisma } = setup();
      prisma.telephonyProvisioningRun.findUnique.mockResolvedValue(
        activeRun({
          complianceInput: {
            ...makeRun().complianceInput,
            reuse: {
              bundleSid: SUPPLIED_BUNDLE_SID,
              addressSid: SUPPLIED_ADDRESS_SID,
              source: "operator-supplied",
              numberType: "mobile",
            },
          },
        }),
      );
      chainCreates(prisma);

      await service.maybeChainComplementaryRun(RUN_ID);

      const created = prisma.telephonyProvisioningRun.create.mock.calls[0][0].data;
      expect(created.numberType).toBe("local");
      expect(created.complianceInput.reuse).toBeUndefined();
    });

    // The chained run drafts a SECOND regulatory bundle that a human at Twilio reviews. It
    // used to be created with documents: null, so that bundle went in with no supporting
    // documents at all and was rejected days later.
    it("the chained run inherits the source's supporting documents", async () => {
      const { service, prisma } = setup();
      prisma.telephonyProvisioningRun.findUnique.mockResolvedValue(activeRun({ documents: [UPLOADED_DOC] }));
      chainCreates(prisma);

      await service.maybeChainComplementaryRun(RUN_ID);

      const created = prisma.telephonyProvisioningRun.create.mock.calls[0][0].data;
      // SID and all: a Twilio SupportingDocument is account-scoped and the chained run
      // inherits the same accountId, so the bundle can assign the very same object.
      expect(created.documents).toEqual([UPLOADED_DOC]);
      expect(prisma.telephonyProvisioningStep.create).toHaveBeenCalledWith(
        expect.objectContaining({
          data: expect.objectContaining({ detail: expect.objectContaining({ inheritedDocuments: 1 }) }),
        }),
      );
    });

    // Defensive branch: a supporting-document SID belongs to the account it was uploaded
    // under, so without that account the SID is dropped and the blob is re-uploaded.
    it("drops the document SIDs (keeping the blob) when the account is not carried over", async () => {
      const { service, prisma } = setup();
      prisma.telephonyProvisioningRun.findUnique.mockResolvedValue(
        activeRun({ accountId: null, documents: [UPLOADED_DOC] }),
      );
      chainCreates(prisma);

      await service.maybeChainComplementaryRun(RUN_ID);

      const created = prisma.telephonyProvisioningRun.create.mock.calls[0][0].data;
      expect(created.documents).toEqual([
        {
          blobUrl: UPLOADED_DOC.blobUrl,
          fileName: UPLOADED_DOC.fileName,
          contentType: UPLOADED_DOC.contentType,
          type: UPLOADED_DOC.type,
        },
      ]);
      expect(created.documents[0].supportingDocumentSid).toBeUndefined();
    });

    // A plan can lapse while the first bundle sits in review for days; buying a second
    // number for a tenant no longer entitled to one is money we cannot claw back.
    it("refuses to chain when the telephony plan flag has lapsed – softly", async () => {
      const { service, prisma, outbox, flags, logger } = setup();
      prisma.telephonyProvisioningRun.findUnique.mockResolvedValue(activeRun());
      flags.isEnabled.mockResolvedValue(false);

      const result = await service.maybeChainComplementaryRun(RUN_ID);

      expect(result).toEqual({ chained: false, reason: "plan-disabled" });
      expect(flags.isEnabled).toHaveBeenCalledWith("FEATURE_TENANT_TELEPHONY_ENABLED", { tenantId: TENANT_ID });
      expect(prisma.telephonyProvisioningRun.create).not.toHaveBeenCalled();
      expect(outbox.append).not.toHaveBeenCalled();
      // The mobile number is ACTIVE and must stay that way – a refused chain writes nothing
      // to the number or the account, and is a warn, not an error.
      expect(prisma.telephonyPhoneNumber.update).not.toHaveBeenCalled();
      expect(prisma.telephonyAccount.update).not.toHaveBeenCalled();
      expect(logger.warn).toHaveBeenCalled();
      expect(logger.error).not.toHaveBeenCalled();
    });

    // The gate is re-run in full only for the PLAN: org-KYC edits made mid-flight (an admin
    // tidying a profile field) must not strand the voice half of an entitled tenant.
    it("still chains when org identification has since been emptied – only the plan re-gates", async () => {
      const { service, prisma } = setup();
      prisma.telephonyProvisioningRun.findUnique.mockResolvedValue(activeRun());
      prisma.orgProfile.findFirst.mockResolvedValue(null);
      chainCreates(prisma);

      const result = await service.maybeChainComplementaryRun(RUN_ID);

      expect(result).toEqual({ chained: true, reason: "chained", runId: CHAINED_RUN_ID });
    });

    // "Fails softly" is the whole contract of this edge: the reaction registry swallows
    // errors, so a throw here would be lost – and the mobile number is already live.
    it("a refused chain never throws into the activated reaction", async () => {
      const { service, prisma, flags } = setup();
      prisma.telephonyProvisioningRun.findUnique.mockResolvedValue(activeRun());
      flags.isEnabled.mockResolvedValue(false);
      const reaction = buildTelephonyProvisioningReactions({ provisioning: service }).find(
        (r) => r.trigger === "telephony.provisioning.activated",
      )!;

      await expect(
        reaction.handle({
          id: "evt-1",
          eventType: "telephony.provisioning.activated",
          tenantId: TENANT_ID,
          aggregateId: RUN_ID,
          payload: { runId: RUN_ID },
          metadata: {},
          occurredAt: "2026-08-05T00:00:00.000Z",
        } as never),
      ).resolves.toBeUndefined();
      expect(prisma.telephonyProvisioningRun.create).not.toHaveBeenCalled();
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

    // A tenant bringing an established Twilio account has already been through Twilio's AU
    // regulatory review on it. These cases pin what `startRun` accepts, and what it refuses
    // rather than discovering days later at the purchase call.
    describe("operator-supplied bundle + address", () => {
      const byo = (extra: Record<string, unknown> = {}) => ({
        tenantId: TENANT_ID,
        mode: "BYO" as const,
        byoAccountSid: ACCOUNT_SID,
        byoAuthToken: "byo-token",
        complianceInput: makeRun().complianceInput as any,
        ...extra,
      });

      it("stores the supplied pair as the run's reuse bookkeeping, stamped with its class", async () => {
        const { service, prisma, twilio } = setup();
        // The class comes from TWILIO's record of the bundle, not from the request.
        twilio.fetchBundleFacts.mockResolvedValue({
          status: "twilio-approved",
          numberType: "local",
          isoCountry: "AU",
        });

        await service.startRun(
          byo({ byoBundleSid: SUPPLIED_BUNDLE_SID, byoAddressSid: SUPPLIED_ADDRESS_SID, numberType: "local" }),
        );

        expect(twilio.fetchBundleFacts).toHaveBeenCalledWith(
          expect.objectContaining({ accountSid: ACCOUNT_SID }),
          SUPPLIED_BUNDLE_SID,
        );
        const data = prisma.telephonyProvisioningRun.create.mock.calls[0][0].data;
        expect(data.complianceInput.reuse).toEqual({
          bundleSid: SUPPLIED_BUNDLE_SID,
          addressSid: SUPPLIED_ADDRESS_SID,
          source: "operator-supplied",
          numberType: "local",
          classVerified: true,
        });
        // The timeline says why this run will never draft a bundle.
        expect(prisma.telephonyProvisioningStep.create).toHaveBeenCalledWith(
          expect.objectContaining({ data: expect.objectContaining({ detail: expect.objectContaining({ suppliedBundle: true }) }) }),
        );
      });

      // The class the OPERATOR asked for and the class the BUNDLE is approved for are two
      // different facts. Only Twilio knows the second one, and buying a local number against
      // a mobile-approved bundle is the expensive mistake this call exists to stop – it is
      // otherwise found at the purchase step, after the run has skipped its review.
      it("refuses a bundle Twilio says is approved for the OTHER regulation class", async () => {
        const { service, prisma, twilio } = setup();
        twilio.fetchBundleFacts.mockResolvedValue({
          status: "twilio-approved",
          numberType: "mobile",
          isoCountry: "AU",
        });

        await expectApiError(
          service.startRun(
            byo({ byoBundleSid: SUPPLIED_BUNDLE_SID, byoAddressSid: SUPPLIED_ADDRESS_SID, numberType: "local" }),
          ),
          "SUPPLIED_BUNDLE_WRONG_CLASS",
        );
        expect(prisma.telephonyProvisioningRun.create).not.toHaveBeenCalled();
      });

      it("refuses a bundle that is not twilio-approved – there is no review to skip", async () => {
        const { service, prisma, twilio } = setup();
        twilio.fetchBundleFacts.mockResolvedValue({
          status: "pending-review",
          numberType: "mobile",
          isoCountry: "AU",
        });

        await expectApiError(
          service.startRun(byo({ byoBundleSid: SUPPLIED_BUNDLE_SID, byoAddressSid: SUPPLIED_ADDRESS_SID })),
          "SUPPLIED_BUNDLE_NOT_APPROVED",
        );
        expect(prisma.telephonyProvisioningRun.create).not.toHaveBeenCalled();
      });

      it("refuses a bundle regulated for another country", async () => {
        const { service, twilio } = setup();
        twilio.fetchBundleFacts.mockResolvedValue({
          status: "twilio-approved",
          numberType: "mobile",
          isoCountry: "US",
        });

        await expectApiError(
          service.startRun(byo({ byoBundleSid: SUPPLIED_BUNDLE_SID, byoAddressSid: SUPPLIED_ADDRESS_SID })),
          "SUPPLIED_BUNDLE_WRONG_COUNTRY",
        );
      });

      // A fat-fingered-but-well-shaped SID is the likely mistake, and it is the one the
      // regex cannot catch. Caught here, it is a 422 on the operator's screen; caught at the
      // purchase step it is a run that no retry can rescue.
      it("refuses a bundle or address that cannot be read on the account", async () => {
        const { service, prisma, twilio } = setup();
        twilio.fetchBundleFacts.mockRejectedValue(new Error("The requested resource was not found"));

        await expectApiError(
          service.startRun(byo({ byoBundleSid: SUPPLIED_BUNDLE_SID, byoAddressSid: SUPPLIED_ADDRESS_SID })),
          "SUPPLIED_BUNDLE_UNREADABLE",
        );

        twilio.fetchBundleFacts.mockResolvedValue({
          status: "twilio-approved",
          numberType: "mobile",
          isoCountry: "AU",
        });
        twilio.fetchAddressCountry.mockRejectedValue(new Error("The requested resource was not found"));
        await expectApiError(
          service.startRun(byo({ byoBundleSid: SUPPLIED_BUNDLE_SID, byoAddressSid: SUPPLIED_ADDRESS_SID })),
          "SUPPLIED_ADDRESS_UNREADABLE",
        );
        expect(prisma.telephonyProvisioningRun.create).not.toHaveBeenCalled();
      });

      it("refuses an address registered outside Australia", async () => {
        const { service, twilio } = setup();
        twilio.fetchAddressCountry.mockResolvedValue("NZ");

        await expectApiError(
          service.startRun(byo({ byoBundleSid: SUPPLIED_BUNDLE_SID, byoAddressSid: SUPPLIED_ADDRESS_SID })),
          "SUPPLIED_ADDRESS_WRONG_COUNTRY",
        );
      });

      // Twilio knowing the bundle is approved but not what class it is (the regulation
      // lookup failed) must not read as "the class matches" – it is recorded as unverified.
      it("stamps classVerified false when Twilio cannot say what class the bundle is", async () => {
        const { service, prisma, twilio } = setup();
        twilio.fetchBundleFacts.mockResolvedValue({
          status: "twilio-approved",
          numberType: null,
          isoCountry: null,
        });

        await service.startRun(byo({ byoBundleSid: SUPPLIED_BUNDLE_SID, byoAddressSid: SUPPLIED_ADDRESS_SID }));

        expect(prisma.telephonyProvisioningRun.create.mock.calls[0][0].data.complianceInput.reuse).toEqual(
          expect.objectContaining({ numberType: "mobile", classVerified: false }),
        );
      });

      it("leaves reuse unset – and asks Twilio nothing – when no pair is supplied", async () => {
        const { service, prisma, twilio } = setup();
        await service.startRun(byo());
        expect(prisma.telephonyProvisioningRun.create.mock.calls[0][0].data.complianceInput.reuse).toBeUndefined();
        expect(twilio.fetchBundleFacts).not.toHaveBeenCalled();
        expect(twilio.fetchAddressCountry).not.toHaveBeenCalled();
      });

      it("rejects half a pair – a bundle cannot buy a number without its address", async () => {
        const { service, prisma } = setup();

        await expectApiError(
          service.startRun(byo({ byoBundleSid: SUPPLIED_BUNDLE_SID })),
          "BUNDLE_REUSE_PAIR_REQUIRED",
        );
        await expectApiError(
          service.startRun(byo({ byoAddressSid: SUPPLIED_ADDRESS_SID })),
          "BUNDLE_REUSE_PAIR_REQUIRED",
        );
        expect(prisma.telephonyProvisioningRun.create).not.toHaveBeenCalled();
      });

      it("rejects a malformed SID rather than passing junk to Twilio", async () => {
        const { service, prisma } = setup();

        await expectApiError(
          service.startRun(byo({ byoBundleSid: "BUtooshort", byoAddressSid: SUPPLIED_ADDRESS_SID })),
          "INVALID_TWILIO_SID",
        );
        // Right length, wrong prefix – an address SID passed as the bundle.
        await expectApiError(
          service.startRun(byo({ byoBundleSid: SUPPLIED_ADDRESS_SID, byoAddressSid: SUPPLIED_ADDRESS_SID })),
          "INVALID_TWILIO_SID",
        );
        await expectApiError(
          service.startRun(byo({ byoBundleSid: SUPPLIED_BUNDLE_SID, byoAddressSid: "AD" + "z".repeat(32) })),
          "INVALID_TWILIO_SID",
        );
        expect(prisma.telephonyProvisioningRun.create).not.toHaveBeenCalled();
      });

      // Rejected, not ignored: a subaccount under the platform master cannot use a bundle
      // that lives under someone else's account, and silently dropping the field would leave
      // the operator believing a days-long review had been skipped.
      it("rejects a supplied pair on a SUBACCOUNT run", async () => {
        const { service, prisma } = setup();

        await expectApiError(
          service.startRun({
            tenantId: TENANT_ID,
            mode: "SUBACCOUNT",
            byoBundleSid: SUPPLIED_BUNDLE_SID,
            byoAddressSid: SUPPLIED_ADDRESS_SID,
            complianceInput: makeRun().complianceInput as any,
          }),
          "BYO_ONLY_FIELD",
        );
        expect(prisma.telephonyProvisioningRun.create).not.toHaveBeenCalled();
      });
    });

    describe("regional BYO account", () => {
      const byo = (extra: Record<string, unknown> = {}) => ({
        tenantId: TENANT_ID,
        mode: "BYO" as const,
        byoAccountSid: ACCOUNT_SID,
        byoAuthToken: "byo-token",
        complianceInput: makeRun().complianceInput as any,
        ...extra,
      });

      it("persists region + edge on the account", async () => {
        const { service, prisma } = setup();

        await service.startRun(byo({ byoRegion: "AU1", byoEdge: "Sydney" }));

        const args = prisma.telephonyAccount.upsert.mock.calls[0][0];
        // Normalised to the lowercase form the Twilio SDK expects.
        expect(args.create).toEqual(expect.objectContaining({ region: "au1", edge: "sydney" }));
        expect(args.update).toEqual(expect.objectContaining({ region: "au1", edge: "sydney" }));
        expect(prisma.telephonyProvisioningStep.create).toHaveBeenCalledWith(
          expect.objectContaining({ data: expect.objectContaining({ detail: expect.objectContaining({ regional: true }) }) }),
        );
      });

      it("writes null on create and touches nothing on update when no region is stated", async () => {
        const { service, prisma } = setup();

        await service.startRun(byo());

        const args = prisma.telephonyAccount.upsert.mock.calls[0][0];
        expect(args.create).toEqual(expect.objectContaining({ region: null, edge: null }));
        // An omitted region means "unchanged", never "clear the one the account has".
        expect(args.update).not.toHaveProperty("region");
        expect(args.update).not.toHaveProperty("edge");
      });

      // Region and edge name ONE host between them (numbers.<edge>.<region>.twilio.com), so
      // a run that states a new region must not leave the previous region's edge behind: an
      // account at au1/sydney re-run as us1 would otherwise be stored as us1/sydney, a host
      // that does not exist and that the edge-needs-a-region guard cannot catch (both are set).
      it("a stated region rewrites the edge too, rather than leaving a stale half behind", async () => {
        const { service, prisma } = setup();

        await service.startRun(byo({ byoRegion: "us1" }));

        const args = prisma.telephonyAccount.upsert.mock.calls[0][0];
        expect(args.update).toEqual(expect.objectContaining({ region: "us1", edge: null }));
      });

      it("rejects an edge with no region, and a malformed region or edge", async () => {
        const { service } = setup();

        await expectApiError(service.startRun(byo({ byoEdge: "sydney" })), "TWILIO_REGION_REQUIRED");
        await expectApiError(service.startRun(byo({ byoRegion: "australia" })), "INVALID_TWILIO_REGION");
        await expectApiError(
          service.startRun(byo({ byoRegion: "au1", byoEdge: "Sydney NSW" })),
          "INVALID_TWILIO_REGION",
        );
      });

      it("rejects a region on a SUBACCOUNT run (it inherits the master's)", async () => {
        const { service } = setup();

        await expectApiError(
          service.startRun({
            tenantId: TENANT_ID,
            mode: "SUBACCOUNT",
            byoRegion: "au1",
            complianceInput: makeRun().complianceInput as any,
          }),
          "BYO_ONLY_FIELD",
        );
      });
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
      // Pin the KEY, not just the answer. The mock replies false to any key, so without
      // this the start gate could read a different flag from the chain and the purchase
      // step and no test would notice the drift.
      expect(flags.isEnabled).toHaveBeenCalledWith("FEATURE_TENANT_TELEPHONY_ENABLED", { tenantId: TENANT_ID });
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

    /**
     * The one FAILED state `retry` cannot fix. A run using a supplied bundle that falls over
     * at the purchase step parks FAILED with resumeStatus COMPLIANCE_APPROVED, and retry
     * re-enters exactly there – re-attempting the purchase with the SAME two SIDs, forever.
     * It can never reach COMPLIANCE_REJECTED either (its bundle is deliberately not on the
     * run row, so no webhook or poll resolves to it), so without this branch the operator's
     * only remedy is abandoning the run and starting again.
     */
    it("rescues a run stuck FAILED at purchase on a supplied bundle by drafting a fresh one", async () => {
      const { service, prisma, twilio } = setup();
      const stuck = makeRun({
        status: S.FAILED,
        resumeStatus: S.COMPLIANCE_APPROVED,
        accountId: ACCOUNT_ID,
        addressSid: SUPPLIED_ADDRESS_SID,
        lastError: "Bundle not found",
        complianceInput: {
          ...makeRun().complianceInput,
          reuse: {
            bundleSid: SUPPLIED_BUNDLE_SID,
            addressSid: SUPPLIED_ADDRESS_SID,
            source: "operator-supplied",
            numberType: "mobile",
          },
        },
      });
      prisma.telephonyProvisioningRun.findUnique
        // resubmit's own read, then advance's re-read inside the transaction …
        .mockResolvedValueOnce(stuck)
        .mockResolvedValueOnce(stuck)
        // … and the redraft hop lands the run back at SUBACCOUNT_CREATED for every later read.
        .mockResolvedValue(makeRun({ status: S.SUBACCOUNT_CREATED, accountId: ACCOUNT_ID }));
      prisma.telephonyAccount.findUnique.mockResolvedValue(makeAccount({ mode: "BYO" }));

      await service.resubmit(RUN_ID);

      // The supplied pair is DISCARDED – leaving `reuse` in place would send the redraft
      // straight back down the fast-path to the same failing purchase.
      const redraft = prisma.telephonyProvisioningRun.update.mock.calls[0][0].data;
      expect(redraft.status).toBe(S.SUBACCOUNT_CREATED);
      expect(redraft.bundleSid).toBeNull();
      expect(redraft.addressSid).toBeNull();
      expect(redraft.complianceInput.reuse).toBeUndefined();
      // …and a bundle of uprise's own is drafted, which is the whole point of the rescue.
      expect(twilio.createBundle).toHaveBeenCalled();
      expect(prisma.telephonyProvisioningRun.update).toHaveBeenCalledWith(statusData(S.COMPLIANCE_DRAFT));
    });

    // Only the supplied-bundle dead end is rescued this way. A run that failed anywhere else
    // has a working `retry`, and re-entering it at SUBACCOUNT_CREATED would throw away an
    // approved bundle uprise itself paid a human review for.
    it("does not rescue a FAILED run that has no supplied bundle", async () => {
      const { service, prisma } = setup();
      prisma.telephonyProvisioningRun.findUnique.mockResolvedValue(
        makeRun({ status: S.FAILED, resumeStatus: S.COMPLIANCE_APPROVED, accountId: ACCOUNT_ID, bundleSid: "BUnew" }),
      );

      await expectApiError(service.resubmit(RUN_ID), "NOT_REJECTED");
    });

    it("does not rescue a supplied-bundle run that failed at a different step", async () => {
      const { service, prisma } = setup();
      prisma.telephonyProvisioningRun.findUnique.mockResolvedValue(
        makeRun({
          status: S.FAILED,
          resumeStatus: S.REQUESTED,
          accountId: ACCOUNT_ID,
          complianceInput: {
            ...makeRun().complianceInput,
            reuse: {
              bundleSid: SUPPLIED_BUNDLE_SID,
              addressSid: SUPPLIED_ADDRESS_SID,
              source: "operator-supplied",
            },
          },
        }),
      );

      await expectApiError(service.resubmit(RUN_ID), "NOT_REJECTED");
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

    // Provisioning stamps "voice"; the DTO/UI could only say "transactional". The two never met,
    // so a provisioned local number never resolved as the calls number. Both spellings now fold to
    // one value — and the +614 guard must apply to BOTH, or picking the other spelling bypasses it.
    describe("purpose vocabulary", () => {
      it("persists the canonical 'voice' whichever spelling is sent", async () => {
        for (const sent of ["voice", "transactional"] as const) {
          const { service, prisma } = setup();
          prisma.telephonyPhoneNumber.findUnique.mockResolvedValue(
            makeNumber({ phoneNumberE164: "+61255501234" }),
          );
          await service.setNickname(NUMBER_ID, undefined, TENANT_ID, sent);
          expect(prisma.telephonyPhoneNumber.update).toHaveBeenCalledWith(
            expect.objectContaining({ data: { purpose: "voice" } }),
          );
        }
      });

      it("refuses an AU mobile as the calls number under EITHER spelling", async () => {
        for (const sent of ["voice", "transactional"] as const) {
          const { service, prisma } = setup();
          prisma.telephonyPhoneNumber.findUnique.mockResolvedValue(
            makeNumber({ phoneNumberE164: "+61412345678" }),
          );
          await expect(
            service.setNickname(NUMBER_ID, undefined, TENANT_ID, sent),
          ).rejects.toMatchObject({ response: { error: { code: "VOICE_NUMBER_REQUIRED" } } });
          expect(prisma.telephonyPhoneNumber.update).not.toHaveBeenCalled();
        }
      });

      it("leaves the other purposes alone", async () => {
        const { service, prisma } = setup();
        prisma.telephonyPhoneNumber.findUnique.mockResolvedValue(makeNumber());
        await service.setNickname(NUMBER_ID, undefined, TENANT_ID, "marketing");
        expect(prisma.telephonyPhoneNumber.update).toHaveBeenCalledWith(
          expect.objectContaining({ data: { purpose: "marketing" } }),
        );
      });
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

    // Sends the legacy "transactional" and PERSISTS "voice" — the value provisioning stamps and
    // the sender resolver matches. Storing the alias verbatim is what left a repurposed number
    // invisible to the calls path.
    it("repurposes a local number to the calls purpose (and leaves the nickname untouched)", async () => {
      const { service, prisma } = setup();
      prisma.telephonyPhoneNumber.findUnique.mockResolvedValue(makeNumber({ phoneNumberE164: "+61255501234" }));

      await service.setNickname(NUMBER_ID, undefined, TENANT_ID, "transactional");

      expect(prisma.telephonyPhoneNumber.update).toHaveBeenCalledWith(
        expect.objectContaining({ where: { id: NUMBER_ID }, data: { purpose: "voice" } }),
      );
    });
  });

  // Adoption needs an accountId, but until connectByoAccount existed the only thing that created
  // a BYO account was a provisioning run - which BUYS a number. An organisation that already owned
  // numbers had to purchase one it did not need before it could adopt the ones it did.
  describe("connectByoAccount", () => {
    const SID = "AC" + "a".repeat(32);
    const connect = (over: Record<string, unknown> = {}) => ({
      tenantId: TENANT_ID,
      accountSid: SID,
      authToken: "tok-live",
      ...over,
    });

    it("verifies the credentials against Twilio BEFORE storing them", async () => {
      const { service, prisma, twilio } = setup();
      prisma.telephonyAccount.findUnique.mockResolvedValue(null);
      await service.connectByoAccount(connect());
      expect(twilio.listOwnedNumbers).toHaveBeenCalled();
      const verifiedAt = twilio.listOwnedNumbers.mock.invocationCallOrder[0];
      const storedAt = prisma.telephonyAccount.upsert.mock.invocationCallOrder[0];
      expect(verifiedAt).toBeLessThan(storedAt);
    });

    it("stores nothing when Twilio rejects the credentials", async () => {
      const { service, prisma, twilio } = setup();
      prisma.telephonyAccount.findUnique.mockResolvedValue(null);
      twilio.listOwnedNumbers.mockRejectedValueOnce(new Error("401"));
      await expectApiError(service.connectByoAccount(connect()), "TWILIO_CREDENTIALS_REJECTED");
      expect(prisma.telephonyAccount.upsert).not.toHaveBeenCalled();
    });

    it("encrypts the auth token at rest and never stores it raw", async () => {
      const { service, prisma, crypto } = setup();
      prisma.telephonyAccount.findUnique.mockResolvedValue(null);
      await service.connectByoAccount(connect({ authToken: "super-secret" }));
      expect(crypto.encrypt).toHaveBeenCalledWith("super-secret");
      const written = JSON.stringify(prisma.telephonyAccount.upsert.mock.calls[0][0]);
      expect(written).not.toContain("super-secret");
    });

    it("lands ACTIVE - there is nothing to provision on an account we just read from", async () => {
      const { service, prisma } = setup();
      prisma.telephonyAccount.findUnique.mockResolvedValue(null);
      await service.connectByoAccount(connect());
      expect(prisma.telephonyAccount.upsert.mock.calls[0][0].create.status).toBe("ACTIVE");
    });

    it("refuses an account another organisation already holds, without naming them", async () => {
      const { service, prisma } = setup();
      prisma.telephonyAccount.findUnique.mockResolvedValue({
        id: "acct-other", accountSid: SID, tenantId: "some-other-tenant",
      });
      const err = await service.connectByoAccount(connect()).catch((e) => e);
      expect(err.response?.error?.code).toBe("ACCOUNT_HELD_BY_ANOTHER_TENANT");
      // The other organisation is never named back to the caller.
      expect(JSON.stringify(err.response)).not.toContain("some-other-tenant");
      expect(prisma.telephonyAccount.upsert).not.toHaveBeenCalled();
    });

    it("rejects a malformed account SID before calling Twilio at all", async () => {
      const { service, twilio } = setup();
      await expectApiError(service.connectByoAccount(connect({ accountSid: "AC-nope" })), "INVALID_TWILIO_SID");
      expect(twilio.listOwnedNumbers).not.toHaveBeenCalled();
    });

    it("refuses to connect on behalf of a tenant outside the caller's scope", async () => {
      const { service, twilio } = setup();
      await expect(
        service.connectByoAccount(connect({ scopeTenantId: "not-my-tenant" })),
      ).rejects.toThrow(/your own organisation/i);
      expect(twilio.listOwnedNumbers).not.toHaveBeenCalled();
    });

    it("carries the region and edge onto the account", async () => {
      const { service, prisma } = setup();
      prisma.telephonyAccount.findUnique.mockResolvedValue(null);
      await service.connectByoAccount(connect({ region: "au1", edge: "sydney" }));
      expect(prisma.telephonyAccount.upsert.mock.calls[0][0].create).toMatchObject({
        region: "au1",
        edge: "sydney",
      });
    });

    it("rejects an edge with no region", async () => {
      const { service } = setup();
      await expectApiError(service.connectByoAccount(connect({ edge: "sydney" })), "TWILIO_REGION_REQUIRED");
    });

    // Re-connecting is what an operator does after rotating credentials at Twilio.
    it("rotates the token in place on re-connect rather than failing", async () => {
      const { service, prisma } = setup();
      prisma.telephonyAccount.findUnique.mockResolvedValue({
        id: "acct-1", accountSid: SID, tenantId: TENANT_ID,
      });
      await service.connectByoAccount(connect({ authToken: "rotated" }));
      expect(prisma.telephonyAccount.upsert.mock.calls[0][0].update.encryptedAuthToken).toBeDefined();
    });

    it("invalidates the sender cache so the new account is used immediately", async () => {
      const { service, prisma, senderResolver } = setup();
      prisma.telephonyAccount.findUnique.mockResolvedValue(null);
      await service.connectByoAccount(connect());
      expect(senderResolver.invalidate).toHaveBeenCalledWith(TENANT_ID);
    });
  });

  describe("syncPrivatePool", () => {
    const POOL_SID = "AC" + "b".repeat(32);
    const POOL_ENV = {
      PRIVATE_TELEPHONY_TENANT_SLUG: "common-threads",
      PRIVATE_TELEPHONY_ACCOUNT_SID: POOL_SID,
      PRIVATE_TELEPHONY_AUTH_TOKEN: "pool-token",
      PRIVATE_TELEPHONY_REGION: "au1",
      PRIVATE_TELEPHONY_EDGE: "sydney",
    };
    const configurePool = (over: Record<string, string> = {}) => {
      Object.assign(ENV, POOL_ENV, over);
    };
    // ENV is module-level and shared by every setup(), so a pool-configured test must not
    // leak into the rest of the file – every other case asserts on the UNconfigured default.
    afterEach(() => {
      for (const key of Object.keys(POOL_ENV)) delete ENV[key];
    });

    /**
     * `telephonyAccount.findUnique` serves BOTH halves of a sync: the pre-connect
     * "does anyone hold this SID" check (by accountSid ⇒ nobody does) and the post-connect
     * lookup adoption does (by id ⇒ the account just connected). Keying on the where-clause
     * is what lets one mock answer both.
     */
    const poolAccountLookups = (prisma: any) => {
      const connected = makeAccount({ mode: "BYO", accountSid: POOL_SID, region: "au1", edge: "sydney" });
      prisma.telephonyAccount.upsert.mockResolvedValue(connected);
      prisma.telephonyAccount.findUnique.mockImplementation(async (args: any) =>
        args?.where?.accountSid ? null : connected,
      );
    };

    /** Three owned mobiles, matching the real account: SMS-capable, messaging hook free. */
    const threeOwned = () => [
      makeOwnedNumber({ phoneNumberE164: "+61468006466", phoneNumberSid: "PN" + "1".repeat(32) }),
      makeOwnedNumber({ phoneNumberE164: "+61468018690", phoneNumberSid: "PN" + "2".repeat(32) }),
      makeOwnedNumber({ phoneNumberE164: "+61468018989", phoneNumberSid: "PN" + "3".repeat(32) }),
    ];

    it("is inert when the env vars are absent – every other tenant's state", async () => {
      const { service, prisma, twilio } = setup();
      await expect(service.syncPrivatePool()).resolves.toEqual({ configured: false });
      expect(twilio.listOwnedNumbers).not.toHaveBeenCalled();
      expect(prisma.telephonyAccount.upsert).not.toHaveBeenCalled();
    });

    // A half-filled config is a mistake, not an intention to connect: acting on it would try
    // to reach Twilio with no token and report a credential failure for a typo.
    it("stays inert when the config is only half-supplied", async () => {
      const { service, twilio } = setup();
      configurePool({ PRIVATE_TELEPHONY_AUTH_TOKEN: "" });
      await expect(service.syncPrivatePool()).resolves.toEqual({ configured: false });
      expect(twilio.listOwnedNumbers).not.toHaveBeenCalled();
    });

    it("connects the account and registers EVERY usable number as the pool", async () => {
      const { service, prisma, twilio } = setup();
      configurePool();
      poolAccountLookups(prisma);
      twilio.listOwnedNumbers.mockResolvedValue(threeOwned());
      twilio.fetchOwnedNumber.mockImplementation(async (...args: any[]) =>
        threeOwned().find((n) => n.phoneNumberSid === args[1]),
      );

      const result = await service.syncPrivatePool();

      expect(result).toMatchObject({ configured: true, tenantId: TENANT_ID });
      // The pool is the whole set – not one designated number.
      expect((result as any).adopted).toEqual(["+61468006466", "+61468018690", "+61468018989"]);
    });

    it("drives the account regionally, from the env pair", async () => {
      const { service, prisma, twilio } = setup();
      configurePool();
      poolAccountLookups(prisma);
      twilio.listOwnedNumbers.mockResolvedValue([]);
      await service.syncPrivatePool();
      expect(twilio.listOwnedNumbers).toHaveBeenCalledWith(
        expect.objectContaining({ accountSid: POOL_SID, region: "au1", edge: "sydney" }),
      );
    });

    // Adopting a MOBILE writes its messaging hook and clears only what overrides that hook.
    // The organisation's live voice application has to survive untouched: four of the real
    // numbers are carrying dialler traffic on it, and taking it would break a running service.
    it("writes only the messaging hook, leaving a live voice application alone", async () => {
      const { service, prisma, twilio } = setup();
      configurePool();
      poolAccountLookups(prisma);
      twilio.listOwnedNumbers.mockResolvedValue([makeOwnedNumber()]);

      await service.syncPrivatePool();

      expect(twilio.configureNumberWebhook).toHaveBeenCalledTimes(1);
      const written = twilio.configureNumberWebhook.mock.calls[0][2];
      expect(Object.keys(written).some((k) => k.startsWith("voice") || k === "trunkSid")).toBe(false);
      expect(written).toEqual(expect.objectContaining({ smsApplicationSid: "", smsFallbackUrl: "" }));
    });

    // A LOCAL number in the pool is adopted as a caller ID, and its inbound voice hook is the
    // organisation's own. `claimVoiceHook: false` is what leaves it in place – with an opt-in
    // the sync would overwrite a working configuration.
    it("never takes over a local number's occupied voice hook", async () => {
      const { service, prisma, twilio } = setup();
      configurePool();
      poolAccountLookups(prisma);
      const local = makeOwnedNumber({
        phoneNumberE164: "+61300000001",
        phoneNumberSid: "PN" + "4".repeat(32),
      });
      twilio.listOwnedNumbers.mockResolvedValue([local]);
      twilio.fetchOwnedNumber.mockResolvedValue(local);

      const result: any = await service.syncPrivatePool();

      expect(result.adopted).toEqual(["+61300000001"]);
      // Adoption still happened – but nothing was written to Twilio's hooks.
      expect(twilio.configureNumberWebhook).not.toHaveBeenCalled();
    });

    // The blocked-reason branch handles a number uprise can classify as unusable. This is the
    // OTHER failure: adoption itself throwing part-way. It must not abandon the rest either.
    it("skips a number whose adoption throws, and still registers the rest", async () => {
      const { service, prisma, twilio } = setup();
      configurePool();
      poolAccountLookups(prisma);
      const good = makeOwnedNumber({ phoneNumberE164: "+61468018989", phoneNumberSid: "PN" + "3".repeat(32) });
      twilio.listOwnedNumbers.mockResolvedValue([
        makeOwnedNumber({ phoneNumberE164: "+61468006466", phoneNumberSid: "PN" + "1".repeat(32) }),
        good,
      ]);
      // The first number vanishes from the account between the listing and the adoption.
      twilio.fetchOwnedNumber.mockImplementation(async (...args: any[]) =>
        args[1] === good.phoneNumberSid ? good : null,
      );

      const result: any = await service.syncPrivatePool();

      expect(result.adopted).toEqual(["+61468018989"]);
      expect(result.skipped).toEqual([
        { phoneNumberE164: "+61468006466", reason: "NUMBER_NOT_ON_ACCOUNT" },
      ]);
    });

    it("reports numbers it already holds instead of re-adopting them", async () => {
      const { service, prisma, twilio } = setup();
      configurePool();
      poolAccountLookups(prisma);
      twilio.listOwnedNumbers.mockResolvedValue([makeOwnedNumber()]);
      prisma.telephonyPhoneNumber.findMany.mockResolvedValue([
        { phoneNumberE164: "+61400000001", phoneNumberSid: OWNED_SID, tenantId: TENANT_ID },
      ]);
      const result: any = await service.syncPrivatePool();
      expect(result.alreadyHeld).toEqual(["+61400000001"]);
      expect(result.adopted).toEqual([]);
    });

    // A pool is a set. One member uprise has no use for is not a reason to register none of
    // the others, so an unusable number is skipped with its reason rather than thrown.
    it("skips an unusable number and still registers the rest", async () => {
      const { service, prisma, twilio } = setup();
      configurePool();
      poolAccountLookups(prisma);
      twilio.listOwnedNumbers.mockResolvedValue([
        makeOwnedNumber({
          phoneNumberE164: "+61468006466",
          phoneNumberSid: "PN" + "1".repeat(32),
          capabilities: { voice: true, sms: false, mms: false },
        }),
        makeOwnedNumber({ phoneNumberE164: "+61468018989", phoneNumberSid: "PN" + "3".repeat(32) }),
      ]);
      twilio.fetchOwnedNumber.mockImplementation(async () =>
        makeOwnedNumber({ phoneNumberE164: "+61468018989", phoneNumberSid: "PN" + "3".repeat(32) }),
      );

      const result: any = await service.syncPrivatePool();

      expect(result.adopted).toEqual(["+61468018989"]);
      expect(result.skipped).toEqual([{ phoneNumberE164: "+61468006466", reason: "NUMBER_NOT_USABLE" }]);
    });

    it("names the misconfigured var when the slug matches no tenant", async () => {
      const { service, prisma } = setup();
      configurePool({ PRIVATE_TELEPHONY_TENANT_SLUG: "no-such-org" });
      prisma.tenant.findUnique.mockResolvedValue(null);
      await expectApiError(service.syncPrivatePool(), "PRIVATE_POOL_TENANT_NOT_FOUND");
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

    // The bundle names the human who attests to the org's identity — that is what the
    // isAuthorisedSignatory flag on step 5 is collected for. It used to be ignored.
    it("names the AUTHORISED SIGNATORY over the primary contact", async () => {
      const { service, prisma } = setup();
      prisma.orgProfile.findFirst.mockResolvedValue({
        name: "Org",
        credential: { legalTradingName: "Org Ltd", australianBusinessNumber: "43687271227", australianCompanyNumber: null },
        contacts: [
          { isPrimaryContact: true, isAuthorisedSignatory: false, firstName: "Pat", lastName: "Primary", email: "pat@org.au" },
          { isPrimaryContact: false, isAuthorisedSignatory: true, firstName: "Sam", lastName: "Signatory", email: "sam@org.au" },
        ],
        addresses: [],
      });

      const prefill = await service.compliancePrefill(TENANT_ID);

      expect(prefill).toMatchObject({
        contactFirstName: "Sam",
        contactLastName: "Signatory",
        email: "sam@org.au",
      });
    });

    it("falls back to the primary contact when no signatory is named", async () => {
      const { service, prisma } = setup();
      prisma.orgProfile.findFirst.mockResolvedValue({
        name: "Org",
        credential: null,
        contacts: [
          { isPrimaryContact: false, isAuthorisedSignatory: false, firstName: "Bob", lastName: "Backup", email: "bob@org.au" },
          { isPrimaryContact: true, isAuthorisedSignatory: false, firstName: "Pat", lastName: "Primary", email: "pat@org.au" },
        ],
        addresses: [],
      });

      expect(await service.compliancePrefill(TENANT_ID)).toMatchObject({ contactFirstName: "Pat" });
    });

    // evaluateOrgSetup blocks provisioning without an entity type, so it was being
    // collected under a promise nothing kept — it never reached the bundle.
    it("carries the entity type through for the bundle's business type", async () => {
      const { service, prisma } = setup();
      prisma.orgProfile.findFirst.mockResolvedValue({
        name: "Org",
        credential: { legalTradingName: "Org Ltd", australianBusinessNumber: "43687271227", australianCompanyNumber: null, entityType: "charity" },
        contacts: [],
        addresses: [],
      });

      expect((await service.compliancePrefill(TENANT_ID)).entityType).toBe("charity");
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

/**
 * Adopting a number the tenant's own Twilio account ALREADY owns.
 *
 * The point of the whole path: a real BYO account has seven-plus unused AU numbers on it,
 * and before this the only way one entered uprise was to BUY another – real money on
 * inventory the organisation holds, plus a fresh regulatory bundle and days of human review
 * at Twilio. None of that is a provisioning run, so none of it goes through the FSM.
 */
describe("TelephonyProvisioningService number adoption", () => {
  const SMS_HOOK = "https://api.test/api/v1/inbound-text-message-hook";
  const VOICE_HOOK = "https://api.test/api/v1/voice-outbound";

  /** An adoption setup with the BYO account already in place. */
  function adoptSetup(accountOverrides: Record<string, unknown> = {}) {
    const ctx = setup();
    ctx.prisma.telephonyAccount.findUnique.mockResolvedValue(
      makeAccount({ mode: "BYO", ...accountOverrides }),
    );
    return ctx;
  }

  describe("listAdoptableNumbers", () => {
    it("returns each owned number with its current configuration, class and hook plan", async () => {
      const { service, twilio } = adoptSetup();

      const [candidate] = await service.listAdoptableNumbers(ACCOUNT_ID);

      expect(twilio.listOwnedNumbers).toHaveBeenCalled();
      expect(candidate).toMatchObject({
        phoneNumberE164: "+61400000001",
        phoneNumberSid: OWNED_SID,
        capabilities: { voice: true, sms: true, mms: true },
        // The configuration that is ALREADY there – the operator has to see the conflict.
        voiceUrl: "https://example-autodialer.test/voice",
        voiceApplicationSid: FOREIGN_APP_SID,
        classification: { numberType: "mobile" },
        blockedReason: null,
        // A mobile is adopted for messaging, so the SMS hook is the one in play – and it is
        // free, so adoption would claim it. The occupied voice hook is not even a candidate.
        hook: { hook: "sms", action: "claimed", existing: freeHook() },
      });
    });

    it("marks a number this tenant has already adopted, and one another tenant holds", async () => {
      const { service, prisma, twilio } = adoptSetup();
      twilio.listOwnedNumbers.mockResolvedValue([
        makeOwnedNumber(),
        makeOwnedNumber({ phoneNumberE164: "+61400000002", phoneNumberSid: "PN" + "e".repeat(32) }),
      ]);
      prisma.telephonyPhoneNumber.findMany.mockResolvedValue([
        makeNumber({ phoneNumberE164: "+61400000001", tenantId: TENANT_ID }),
        makeNumber({ phoneNumberE164: "+61400000002", tenantId: "other-tenant" }),
      ]);

      const candidates = await service.listAdoptableNumbers(ACCOUNT_ID);

      expect(candidates.map((c) => c.blockedReason)).toEqual([
        "ALREADY_ADOPTED",
        "ADOPTED_BY_ANOTHER_TENANT",
      ]);
    });

    // The listing and the adopt call have to agree on what "already held" means, or the
    // listing offers a number the adopt call then 409s on. A row carrying the SID under a
    // different E.164 (reassigned at Twilio) is that number's row either way.
    it("marks a number held by SID alone, matching what adoption would refuse", async () => {
      const { service, prisma } = adoptSetup();
      prisma.telephonyPhoneNumber.findMany.mockResolvedValue([
        makeNumber({ phoneNumberE164: "+61499999999", phoneNumberSid: OWNED_SID, tenantId: TENANT_ID }),
      ]);

      const [candidate] = await service.listAdoptableNumbers(ACCOUNT_ID);

      expect(candidate.blockedReason).toBe("ALREADY_ADOPTED");
      // Prisma is mocked, so the WHERE clause is the behaviour: a query that asked about the
      // E.164 alone would never see this row in the first place, and the listing would offer
      // a number the adopt call then 409s on.
      expect(prisma.telephonyPhoneNumber.findMany).toHaveBeenCalledWith({
        where: {
          OR: [
            { phoneNumberE164: { in: ["+61400000001"] } },
            { phoneNumberSid: { in: [OWNED_SID] } },
          ],
        },
      });
    });

    it("lists a number Twilio says cannot do its class's job, but does not offer it", async () => {
      const { service, twilio } = adoptSetup();
      twilio.listOwnedNumbers.mockResolvedValue([
        makeOwnedNumber({ capabilities: { voice: false, sms: false, mms: false } }),
      ]);

      const [candidate] = await service.listAdoptableNumbers(ACCOUNT_ID);

      expect(candidate.blockedReason).toBe("NUMBER_NOT_USABLE");
      expect(candidate.classification).toBeNull();
    });

    it("lists a non-Australian number, but does not offer it", async () => {
      const { service, twilio } = adoptSetup();
      twilio.listOwnedNumbers.mockResolvedValue([makeOwnedNumber({ phoneNumberE164: "+12025550123" })]);

      const [candidate] = await service.listAdoptableNumbers(ACCOUNT_ID);

      expect(candidate.blockedReason).toBe("NUMBER_NOT_AUSTRALIAN");
      expect(candidate.classification).toBeNull();
    });

    it("refuses to list another tenant's account", async () => {
      const { service } = adoptSetup();
      await expect(service.listAdoptableNumbers(ACCOUNT_ID, "other-tenant")).rejects.toThrow(
        /your own organisation/i,
      );
    });
  });

  describe("adoptNumber", () => {
    it("registers an owned mobile as an SMS sender – no purchase, no bundle, no run", async () => {
      const { service, prisma, twilio, senderResolver } = adoptSetup();

      const result = await service.adoptNumber({ accountId: ACCOUNT_ID, phoneNumberSid: OWNED_SID });

      expect(twilio.purchaseNumber).not.toHaveBeenCalled();
      expect(twilio.createBundle).not.toHaveBeenCalled();
      expect(prisma.telephonyProvisioningRun.create).not.toHaveBeenCalled();
      expect(prisma.telephonyPhoneNumber.create).toHaveBeenCalledWith({
        data: expect.objectContaining({
          tenantId: TENANT_ID,
          accountId: ACCOUNT_ID,
          phoneNumberE164: "+61400000001",
          phoneNumberSid: OWNED_SID,
          numberType: "mobile",
          purpose: "marketing",
          status: TelephonyNumberStatus.ACTIVE,
          // uprise holds no compliance artefacts for a number it did not provision.
          bundleSid: null,
          addressSid: null,
        }),
      });
      expect(result.classification).toMatchObject({ numberType: "mobile" });
      expect(senderResolver.invalidate).toHaveBeenCalledWith(TENANT_ID);
    });

    // The row and the account flip go together, exactly as the purchase path writes them –
    // otherwise a crash between the two leaves an ACTIVE number under a PROVISIONING account,
    // which the sender resolver cannot resolve and nothing would ever retry.
    it("writes the number and the account flip in one transaction", async () => {
      const { service, prisma } = adoptSetup({ status: "PROVISIONING" });

      await service.adoptNumber({ accountId: ACCOUNT_ID, phoneNumberSid: OWNED_SID });

      expect(prisma.$transaction).toHaveBeenCalledTimes(1);
      const tx = prisma.$transaction.mock.calls[0][0];
      expect(typeof tx).toBe("function");
    });

    it("classes a +612 local from its prefix and gives it the voice purpose", async () => {
      const { service, prisma, twilio } = adoptSetup();
      twilio.fetchOwnedNumber.mockResolvedValue(makeOwnedNumber({ phoneNumberE164: "+61212341234" }));

      const result = await service.adoptNumber({ accountId: ACCOUNT_ID, phoneNumberSid: OWNED_SID });

      expect(result.classification).toMatchObject({ numberType: "local" });
      // "voice" matches no SendPurpose, and numberType "local" fails isSmsCapable – two
      // independent reasons the sender resolver can never text from it.
      expect(prisma.telephonyPhoneNumber.create).toHaveBeenCalledWith({
        data: expect.objectContaining({ numberType: "local", purpose: "voice" }),
      });
    });

    /**
     * The class NEVER contradicts the prefix. A +614 Twilio says cannot text has no job here:
     * classing it "local" (as a capability-led rule would) puts it in the tenant's voice pool,
     * where it can displace their real +612 – and then every voice path rejects it by prefix
     * and the tenant's autodialer stops. Refusing is the only outcome that cannot break them.
     */
    it("refuses a +614 Twilio says cannot send SMS rather than classing it local", async () => {
      const { service, prisma, twilio } = adoptSetup();
      twilio.fetchOwnedNumber.mockResolvedValue(
        makeOwnedNumber({ capabilities: { voice: true, sms: false, mms: false } }),
      );

      await expectApiError(
        service.adoptNumber({ accountId: ACCOUNT_ID, phoneNumberSid: OWNED_SID, claimVoiceHook: true }),
        "NUMBER_NOT_USABLE",
      );
      expect(prisma.telephonyPhoneNumber.create).not.toHaveBeenCalled();
      expect(twilio.configureNumberWebhook).not.toHaveBeenCalled();
    });

    // The mirror: a local number is adopted to be a caller ID, so one that cannot take calls
    // is equally useless – and must not be written "local" and handed to the voice resolver.
    it("refuses a +612 Twilio says cannot take calls", async () => {
      const { service, prisma, twilio } = adoptSetup();
      twilio.fetchOwnedNumber.mockResolvedValue(
        makeOwnedNumber({
          phoneNumberE164: "+61212341234",
          capabilities: { voice: false, sms: true, mms: false },
        }),
      );

      await expectApiError(
        service.adoptNumber({ accountId: ACCOUNT_ID, phoneNumberSid: OWNED_SID }),
        "NUMBER_NOT_USABLE",
      );
      expect(prisma.telephonyPhoneNumber.create).not.toHaveBeenCalled();
    });

    it("refuses a number Twilio says can neither text nor call", async () => {
      const { service, prisma, twilio } = adoptSetup();
      twilio.fetchOwnedNumber.mockResolvedValue(
        makeOwnedNumber({ capabilities: { voice: false, sms: false, mms: false } }),
      );

      await expectApiError(
        service.adoptNumber({ accountId: ACCOUNT_ID, phoneNumberSid: OWNED_SID }),
        "NUMBER_NOT_USABLE",
      );
      expect(prisma.telephonyPhoneNumber.create).not.toHaveBeenCalled();
    });

    // uprise's telephony is AU-regulated end to end. A US number on the BYO account must not
    // slide in as the tenant's marketing sender on a "well, it can text" fallback.
    it("refuses a number outside the Australian numbering plan", async () => {
      const { service, prisma, twilio } = adoptSetup();
      twilio.fetchOwnedNumber.mockResolvedValue(makeOwnedNumber({ phoneNumberE164: "+12025550123" }));

      await expectApiError(
        service.adoptNumber({ accountId: ACCOUNT_ID, phoneNumberSid: OWNED_SID }),
        "NUMBER_NOT_AUSTRALIAN",
      );
      expect(prisma.telephonyPhoneNumber.create).not.toHaveBeenCalled();
    });

    // Ownership is proved against Twilio, not taken from the request – otherwise a caller
    // could attach any SID, including one belonging to someone else's account.
    it("refuses a SID the account does not own, writing nothing", async () => {
      const { service, prisma, twilio } = adoptSetup();
      twilio.fetchOwnedNumber.mockResolvedValue(null);

      await expectApiError(
        service.adoptNumber({ accountId: ACCOUNT_ID, phoneNumberSid: OWNED_SID }),
        "NUMBER_NOT_ON_ACCOUNT",
      );
      expect(prisma.telephonyPhoneNumber.create).not.toHaveBeenCalled();
      expect(twilio.configureNumberWebhook).not.toHaveBeenCalled();
    });

    it("fails cleanly when the tenant has already adopted the number", async () => {
      const { service, prisma, twilio } = adoptSetup();
      prisma.telephonyPhoneNumber.findFirst.mockResolvedValue(makeNumber({ tenantId: TENANT_ID }));

      await expectApiError(
        service.adoptNumber({ accountId: ACCOUNT_ID, phoneNumberSid: OWNED_SID }),
        "NUMBER_ALREADY_ADOPTED",
      );
      // Nothing at Twilio is touched on the way to failing.
      expect(twilio.configureNumberWebhook).not.toHaveBeenCalled();
      expect(prisma.telephonyPhoneNumber.create).not.toHaveBeenCalled();
    });

    it("fails cleanly – and anonymously – when another tenant holds the number", async () => {
      const { service, prisma } = adoptSetup();
      prisma.telephonyPhoneNumber.findFirst.mockResolvedValue(makeNumber({ tenantId: "other-tenant" }));

      const attempt = service.adoptNumber({ accountId: ACCOUNT_ID, phoneNumberSid: OWNED_SID });

      await expectApiError(attempt, "NUMBER_ADOPTED_BY_ANOTHER_TENANT");
      // The other organisation is never named back to this caller.
      await attempt.catch((e: any) => expect(e.response.error.message).not.toContain("other-tenant"));
    });

    // The UNIQUE index is the last line of defence when two adoptions race. It must surface
    // as the same machine-readable code, never as a raw Prisma constraint error – and the
    // loser must not leave the number pointing at uprise with no row behind it.
    it("turns a racing unique-constraint violation into the same clean code, and puts the hook back", async () => {
      const { service, prisma, twilio } = adoptSetup();
      prisma.telephonyPhoneNumber.create.mockRejectedValue(
        Object.assign(new Error("Unique constraint failed"), { code: "P2002" }),
      );
      prisma.telephonyPhoneNumber.findFirst
        .mockResolvedValueOnce(null)
        .mockResolvedValueOnce(makeNumber({ tenantId: "other-tenant" }));

      await expectApiError(
        service.adoptNumber({ accountId: ACCOUNT_ID, phoneNumberSid: OWNED_SID }),
        "NUMBER_ADOPTED_BY_ANOTHER_TENANT",
      );
      expect(twilio.configureNumberWebhook).toHaveBeenLastCalledWith(expect.anything(), OWNED_SID, {
        smsUrl: "",
        smsMethod: "POST",
        smsApplicationSid: "",
        smsFallbackUrl: "",
      });
    });

    /**
     * The one deliberately destructive action in the path. If the row cannot be written the
     * organisation's live voice configuration has to come back – nothing else records it, so
     * without this it is simply gone, and the number answers to uprise with no row saying why.
     */
    it("restores a taken-over voice hook when the row cannot be written", async () => {
      const { service, prisma, twilio } = adoptSetup();
      const trunkSid = "TK" + "f".repeat(32);
      // Every field the take-over cleared has to come back, not just the primary URL – the
      // organisation's trunk binding and fallback are as much a part of their configuration.
      twilio.fetchOwnedNumber.mockResolvedValue(
        makeOwnedNumber({
          phoneNumberE164: "+61212341234",
          voiceFallbackUrl: "https://example-autodialer.test/voice-fallback",
          trunkSid,
        }),
      );
      prisma.telephonyPhoneNumber.create.mockRejectedValue(new Error("connection reset"));

      await expect(
        service.adoptNumber({ accountId: ACCOUNT_ID, phoneNumberSid: OWNED_SID, claimVoiceHook: true }),
      ).rejects.toThrow("connection reset");

      expect(twilio.configureNumberWebhook).toHaveBeenLastCalledWith(expect.anything(), OWNED_SID, {
        voiceUrl: "https://example-autodialer.test/voice",
        voiceMethod: "POST",
        voiceApplicationSid: FOREIGN_APP_SID,
        voiceFallbackUrl: "https://example-autodialer.test/voice-fallback",
        trunkSid,
      });
    });

    // Nothing was written, so nothing is restored – a rollback that wrote anyway would itself
    // be the destructive change it exists to undo.
    it("writes nothing back when the failed adoption never touched the hook", async () => {
      const { service, prisma, twilio } = adoptSetup();
      twilio.fetchOwnedNumber.mockResolvedValue(makeOwnedNumber({ phoneNumberE164: "+61212341234" }));
      prisma.telephonyPhoneNumber.create.mockRejectedValue(new Error("connection reset"));

      await expect(
        service.adoptNumber({ accountId: ACCOUNT_ID, phoneNumberSid: OWNED_SID }),
      ).rejects.toThrow("connection reset");

      expect(twilio.configureNumberWebhook).not.toHaveBeenCalled();
    });

    // A restore that fails has nothing left to try, but it must not mask the real failure.
    it("reports the original failure even when the hook cannot be restored", async () => {
      const { service, prisma, twilio, logger } = adoptSetup();
      prisma.telephonyPhoneNumber.create.mockRejectedValue(new Error("connection reset"));
      twilio.configureNumberWebhook
        .mockResolvedValueOnce(undefined)
        .mockRejectedValueOnce(new Error("twilio down"));

      await expect(
        service.adoptNumber({ accountId: ACCOUNT_ID, phoneNumberSid: OWNED_SID }),
      ).rejects.toThrow("connection reset");
      expect(logger.error).toHaveBeenCalled();
    });

    it("refuses to adopt into another tenant's account", async () => {
      const { service, prisma } = adoptSetup();
      await expect(
        service.adoptNumber({ accountId: ACCOUNT_ID, phoneNumberSid: OWNED_SID, scopeTenantId: "other-tenant" }),
      ).rejects.toThrow(/your own organisation/i);
      expect(prisma.telephonyPhoneNumber.create).not.toHaveBeenCalled();
    });

    // Adoption is for numbers the ORGANISATION owns. A uprise-managed subaccount's numbers
    // were bought by uprise and already have rows; there is nothing there to adopt.
    it("refuses a uprise-managed subaccount", async () => {
      const { service, prisma, twilio } = adoptSetup({ mode: "SUBACCOUNT" });

      await expectApiError(
        service.adoptNumber({ accountId: ACCOUNT_ID, phoneNumberSid: OWNED_SID }),
        "ACCOUNT_NOT_BYO",
      );
      expect(prisma.telephonyPhoneNumber.create).not.toHaveBeenCalled();
      expect(twilio.fetchOwnedNumber).not.toHaveBeenCalled();
    });

    it("activates a BYO account that is still PROVISIONING, so the number can actually send", async () => {
      const { service, prisma } = adoptSetup({ status: "PROVISIONING" });

      await service.adoptNumber({ accountId: ACCOUNT_ID, phoneNumberSid: OWNED_SID });

      expect(prisma.telephonyAccount.update).toHaveBeenCalledWith({
        where: { id: ACCOUNT_ID },
        data: { status: "ACTIVE" },
      });
    });

    it("leaves an already-ACTIVE account's status alone", async () => {
      const { service, prisma } = adoptSetup({ status: "ACTIVE" });

      await service.adoptNumber({ accountId: ACCOUNT_ID, phoneNumberSid: OWNED_SID });

      expect(prisma.telephonyAccount.update).not.toHaveBeenCalled();
    });

    /**
     * Adoption ends by putting an account ACTIVE, so an unguarded adopt call would be a back
     * door that reinstates sending on an account somebody deliberately switched off. Only
     * PROVISIONING → ACTIVE is a transition adoption may make.
     */
    it.each(["SUSPENDED", "CLOSED"])("refuses to adopt onto a %s account", async (status) => {
      const { service, prisma } = adoptSetup({ status });

      await expectApiError(
        service.adoptNumber({ accountId: ACCOUNT_ID, phoneNumberSid: OWNED_SID }),
        "ACCOUNT_NOT_USABLE",
      );
      expect(prisma.telephonyAccount.update).not.toHaveBeenCalled();
      expect(prisma.telephonyPhoneNumber.create).not.toHaveBeenCalled();
    });
  });

  /**
   * The overwrite policy. Every number in the real account carries a working voice
   * configuration belonging to the organisation's own autodialer; messaging is unconfigured.
   */
  describe("inbound hook policy", () => {
    it("claims a blank SMS hook, clearing anything that would override or shadow the URL", async () => {
      const { service, twilio } = adoptSetup();

      const result = await service.adoptNumber({ accountId: ACCOUNT_ID, phoneNumberSid: OWNED_SID });

      expect(twilio.configureNumberWebhook).toHaveBeenCalledWith(expect.anything(), OWNED_SID, {
        smsUrl: SMS_HOOK,
        smsMethod: "POST",
        smsApplicationSid: "",
        smsFallbackUrl: "",
      });
      expect(result.hook).toMatchObject({ hook: "sms", action: "claimed" });
    });

    // The asymmetry, and the reason it is safe: a mobile is adopted for MESSAGING, so only
    // its SMS hook is ever written. The occupied voice hook is not a candidate at all.
    it("never touches the voice hook when adopting a mobile, however configured it is", async () => {
      const { service, twilio } = adoptSetup();

      await service.adoptNumber({ accountId: ACCOUNT_ID, phoneNumberSid: OWNED_SID });

      const [, , webhooks] = twilio.configureNumberWebhook.mock.calls[0];
      expect(webhooks).not.toHaveProperty("voiceUrl");
      expect(webhooks).not.toHaveProperty("voiceApplicationSid");
      expect(webhooks).not.toHaveProperty("trunkSid");
    });

    /**
     * A local number is adopted to be an outbound caller ID; its inbound hook does nothing
     * uprise needs (`inboundVoiceUrl` only answers with a spoken apology), so the
     * organisation's own configuration simply wins and the adoption still lands.
     */
    it("leaves an occupied voice hook alone without an explicit opt-in, and reports it", async () => {
      const { service, twilio } = adoptSetup();
      twilio.fetchOwnedNumber.mockResolvedValue(makeOwnedNumber({ phoneNumberE164: "+61212341234" }));

      const result = await service.adoptNumber({ accountId: ACCOUNT_ID, phoneNumberSid: OWNED_SID });

      expect(twilio.configureNumberWebhook).not.toHaveBeenCalled();
      expect(result.hook).toEqual({
        hook: "voice",
        action: "left-in-place",
        existing: freeHook({
          url: "https://example-autodialer.test/voice",
          applicationSid: FOREIGN_APP_SID,
        }),
      });
    });

    it("takes the voice hook over only when the caller explicitly claims it", async () => {
      const { service, twilio } = adoptSetup();
      twilio.fetchOwnedNumber.mockResolvedValue(makeOwnedNumber({ phoneNumberE164: "+61212341234" }));

      const result = await service.adoptNumber({
        accountId: ACCOUNT_ID,
        phoneNumberSid: OWNED_SID,
        claimVoiceHook: true,
      });

      expect(twilio.configureNumberWebhook).toHaveBeenCalledWith(expect.anything(), OWNED_SID, {
        voiceUrl: VOICE_HOOK,
        voiceMethod: "POST",
        voiceApplicationSid: "",
        voiceFallbackUrl: "",
        trunkSid: "",
      });
      expect(result.hook).toMatchObject({ action: "taken-over" });
    });

    /**
     * A messaging number is a different matter from a voice one. uprise's ONLY opt-out capture
     * is the inbound SMS hook – STOP lands there, InboxService records it, and every blast is
     * gated on that state. Landing this row ACTIVE would make the tenant a live blast sender
     * that can never see a STOP: an unsubscribe failure under the Spam Act. So it is refused,
     * not reported.
     */
    it("refuses a messaging number whose SMS hook belongs to someone else", async () => {
      const { service, prisma, twilio } = adoptSetup();
      twilio.fetchOwnedNumber.mockResolvedValue(
        makeOwnedNumber({ smsUrl: "https://example-crm.test/sms" }),
      );

      await expectApiError(
        service.adoptNumber({ accountId: ACCOUNT_ID, phoneNumberSid: OWNED_SID }),
        "SMS_HOOK_OCCUPIED",
      );
      expect(twilio.configureNumberWebhook).not.toHaveBeenCalled();
      expect(prisma.telephonyPhoneNumber.create).not.toHaveBeenCalled();
    });

    /**
     * Each hook has its own opt-in, and only the hook of the class being adopted is in play.
     * A voice opt-in must never authorise writing over somebody's MESSAGING configuration –
     * cross-wire the two flags and this is the direction that silently destroys a third
     * party's webhook, so it is asserted explicitly.
     */
    it("does not let a voice opt-in claim an occupied SMS hook", async () => {
      const { service, twilio } = adoptSetup();
      twilio.fetchOwnedNumber.mockResolvedValue(
        makeOwnedNumber({ smsUrl: "https://example-crm.test/sms" }),
      );

      await expectApiError(
        service.adoptNumber({ accountId: ACCOUNT_ID, phoneNumberSid: OWNED_SID, claimVoiceHook: true }),
        "SMS_HOOK_OCCUPIED",
      );
      expect(twilio.configureNumberWebhook).not.toHaveBeenCalled();
    });

    it("takes an occupied SMS hook over when the caller explicitly claims it", async () => {
      const { service, twilio } = adoptSetup();
      twilio.fetchOwnedNumber.mockResolvedValue(
        makeOwnedNumber({ smsUrl: "https://example-crm.test/sms" }),
      );

      const result = await service.adoptNumber({
        accountId: ACCOUNT_ID,
        phoneNumberSid: OWNED_SID,
        claimSmsHook: true,
      });

      expect(twilio.configureNumberWebhook).toHaveBeenCalledWith(expect.anything(), OWNED_SID, {
        smsUrl: SMS_HOOK,
        smsMethod: "POST",
        smsApplicationSid: "",
        smsFallbackUrl: "",
      });
      expect(result.hook).toMatchObject({ action: "taken-over" });
    });

    // A blank URL with an application SID is CONFIGURED – the application overrides the URL
    // at Twilio – so it must read as occupied, not as free.
    it("treats a bare application SID as an occupied hook", async () => {
      const { service, twilio } = adoptSetup();
      twilio.fetchOwnedNumber.mockResolvedValue(
        makeOwnedNumber({ smsUrl: null, smsApplicationSid: FOREIGN_APP_SID }),
      );

      await expectApiError(
        service.adoptNumber({ accountId: ACCOUNT_ID, phoneNumberSid: OWNED_SID }),
        "SMS_HOOK_OCCUPIED",
      );
      expect(twilio.configureNumberWebhook).not.toHaveBeenCalled();
    });

    // A fallback URL takes the traffic whenever the primary errors, so a hook whose primary is
    // blank but whose fallback is the organisation's is NOT free.
    it("treats a lone fallback URL as an occupied hook", async () => {
      const { service, twilio } = adoptSetup();
      twilio.fetchOwnedNumber.mockResolvedValue(
        makeOwnedNumber({ smsUrl: null, smsFallbackUrl: "https://example-crm.test/sms-fallback" }),
      );

      await expectApiError(
        service.adoptNumber({ accountId: ACCOUNT_ID, phoneNumberSid: OWNED_SID }),
        "SMS_HOOK_OCCUPIED",
      );
    });

    // A SIP-trunk binding overrides voice routing entirely – the URL is never consulted – so a
    // trunk-bound number's voice hook is occupied however blank its URLs look.
    it("treats a SIP trunk binding as an occupied voice hook", async () => {
      const { service, twilio } = adoptSetup();
      twilio.fetchOwnedNumber.mockResolvedValue(
        makeOwnedNumber({
          phoneNumberE164: "+61212341234",
          voiceUrl: null,
          voiceApplicationSid: null,
          trunkSid: "TK" + "f".repeat(32),
        }),
      );

      const result = await service.adoptNumber({ accountId: ACCOUNT_ID, phoneNumberSid: OWNED_SID });

      expect(twilio.configureNumberWebhook).not.toHaveBeenCalled();
      expect(result.hook).toMatchObject({ action: "left-in-place" });
    });

    // Twilio hands a new number its own demo URL; that is not the organisation's
    // configuration, and treating it as a conflict would force a pointless opt-in.
    it("treats Twilio's demo placeholder as a free hook", async () => {
      const { service, twilio } = adoptSetup();
      twilio.fetchOwnedNumber.mockResolvedValue(
        makeOwnedNumber({ smsUrl: "https://demo.twilio.com/welcome/sms/reply" }),
      );

      const result = await service.adoptNumber({ accountId: ACCOUNT_ID, phoneNumberSid: OWNED_SID });

      expect(result.hook).toMatchObject({ action: "claimed" });
    });

    // Re-adopting a number uprise itself configured is not a conflict.
    it("treats a hook already pointing at uprise as free", async () => {
      const { service, twilio } = adoptSetup();
      twilio.fetchOwnedNumber.mockResolvedValue(makeOwnedNumber({ smsUrl: SMS_HOOK }));

      const result = await service.adoptNumber({ accountId: ACCOUNT_ID, phoneNumberSid: OWNED_SID });

      expect(result.hook).toMatchObject({ action: "claimed" });
    });
  });
});
