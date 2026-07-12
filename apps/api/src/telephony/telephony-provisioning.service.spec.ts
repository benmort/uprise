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
    status: TelephonyNumberStatus.PENDING,
    ...overrides,
  };
}

function setup() {
  const prisma: any = {
    telephonyProvisioningRun: {
      findUnique: jest.fn(),
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
    findAvailableAuMobile: jest.fn(async () => "+61400000000"),
    purchaseNumber: jest.fn(async () => ({ phoneNumberSid: "PN" + "9".repeat(32), phoneNumberE164: "+61400000000" })),
    configureNumberWebhook: jest.fn(async () => undefined),
    releaseNumber: jest.fn(async () => undefined),
  };
  const outbox = { append: jest.fn(async () => undefined) };
  const logger = { error: jest.fn(), warn: jest.fn(), log: jest.fn(), debug: jest.fn() };
  const senderResolver = { invalidate: jest.fn() };

  const service = new TelephonyProvisioningService(
    prisma,
    config as any,
    crypto as any,
    twilio as any,
    outbox as any,
    logger as any,
    senderResolver as any,
    new ImageUploadService(),
  );
  return { prisma, config, crypto, twilio, outbox, logger, senderResolver, service };
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
    const approvedRun = () =>
      makeRun({ status: S.COMPLIANCE_APPROVED, accountId: ACCOUNT_ID, bundleSid: "BUnew", addressSid: "ADnew" });

    it("COMPLIANCE_APPROVED → NUMBER_PURCHASED: buys a number, writes the row, emits number-purchased", async () => {
      const { service, prisma, twilio, outbox } = setup();
      prisma.telephonyProvisioningRun.findUnique.mockResolvedValue(approvedRun());
      prisma.telephonyAccount.findUnique.mockResolvedValue(makeAccount());

      await service.stepPurchaseNumber(RUN_ID);

      expect(twilio.findAvailableAuMobile).toHaveBeenCalled();
      expect(twilio.purchaseNumber).toHaveBeenCalledWith(
        expect.anything(),
        expect.objectContaining({ bundleSid: "BUnew", addressSid: "ADnew", smsUrl: "https://api.test/api/v1/inbound-text-message-hook" }),
      );
      expect(prisma.telephonyPhoneNumber.create).toHaveBeenCalledWith(
        expect.objectContaining({ data: expect.objectContaining({ status: TelephonyNumberStatus.PENDING, phoneNumberE164: "+61400000000" }) }),
      );
      expect(prisma.telephonyProvisioningRun.update).toHaveBeenCalledWith(statusData(S.NUMBER_PURCHASED));
      expect(outbox.append).toHaveBeenCalledWith(prisma, emitOf("telephony.provisioning.number-purchased"));
    });

    it("parks FAILED (resume COMPLIANCE_APPROVED) when number search throws", async () => {
      const { service, prisma, twilio, outbox } = setup();
      prisma.telephonyProvisioningRun.findUnique.mockResolvedValue(approvedRun());
      prisma.telephonyAccount.findUnique.mockResolvedValue(makeAccount());
      twilio.findAvailableAuMobile.mockRejectedValue(new Error("no inventory"));

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
