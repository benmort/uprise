import { NotFoundException } from "@nestjs/common";
import {
  EmailAccountMode,
  EmailAccountStatus,
  EmailIdentityKind,
  EmailIdentityStatus,
  EmailProvisioningStatus as S,
} from "@uprise/db";
import { EmailProvisioningService } from "./email-provisioning.service";

// ── shared mock factory (positional construction, hand-mocked Prisma) ──
function setup() {
  const prisma: any = {
    emailProvisioningRun: {
      findUnique: jest.fn(),
      findFirst: jest.fn(async () => null),
      findMany: jest.fn(async () => []),
      create: jest.fn(async ({ data }: any) => ({ id: "run1", ...data })),
      update: jest.fn(async ({ data }: any) => ({ id: "run1", ...data })),
    },
    emailProvisioningStep: { create: jest.fn(async () => ({ id: "step1" })) },
    emailSenderIdentity: {
      findUnique: jest.fn(),
      findFirst: jest.fn(async () => null),
      findMany: jest.fn(async () => []),
      create: jest.fn(async ({ data }: any) => ({ id: "id1", ...data })),
      update: jest.fn(async ({ data }: any) => ({ id: "id1", ...data })),
    },
    emailAccount: {
      findUnique: jest.fn(),
      findFirst: jest.fn(async () => null),
      create: jest.fn(async ({ data }: any) => ({ id: "acc1", ...data })),
      update: jest.fn(async ({ data }: any) => ({ id: "acc1", ...data })),
    },
    tenant: { findUnique: jest.fn(async () => ({ id: "t1", name: "Acme", slug: "acme" })) },
    $queryRaw: jest.fn(async () => []),
    // callback seam: tx === prisma so code under test runs against the same mock
    $transaction: jest.fn(async (cb: any) => cb(prisma)),
  };
  const config: any = { get: jest.fn((_key: string, fallback?: any) => fallback) };
  const crypto: any = {
    encrypt: jest.fn((s: string) => `enc:${s}`),
    decrypt: jest.fn((s: string) => `dec:${s}`),
  };
  const sendgrid: any = {
    masterCreds: jest.fn(() => ({ apiKey: "master" })),
    listIps: jest.fn(async () => ["1.2.3.4"]),
    createSubuser: jest.fn(async () => undefined),
    createSubuserApiKey: jest.fn(async () => "sk_sub"),
    createDomainAuth: jest.fn(async () => ({
      sendgridDomainId: "d1",
      domain: "acme.mail.uprise.org.au",
      dns: [{ record: "r1", host: "s1._domainkey.acme", type: "CNAME", data: "s1.dkim", valid: false }],
    })),
    assignDomainToSubuser: jest.fn(async () => undefined),
    validateDomain: jest.fn(async () => ({ valid: true, results: {} })),
    getDomainAuth: jest.fn(async () => ({ sendgridDomainId: "d1", domain: "acme.mail.uprise.org.au", dns: [] })),
    configureEventWebhook: jest.fn(async () => undefined),
    enableSignedWebhook: jest.fn(async () => "pubkey"),
    deleteDomainAuth: jest.fn(async () => undefined),
    deleteSubuser: jest.fn(async () => undefined),
  };
  const dnsimple: any = {
    ensureRecord: jest.fn(async () => ({ id: 101 })),
    relativise: jest.fn((h: string) => h),
    deleteRecord: jest.fn(async () => undefined),
  };
  const outbox: any = { append: jest.fn(async () => undefined) };
  const logger: any = { error: jest.fn(), warn: jest.fn(), info: jest.fn(), debug: jest.fn() };
  const senderResolver: any = { invalidate: jest.fn(), resolve: jest.fn() };
  const svc = new EmailProvisioningService(
    prisma,
    config,
    crypto,
    sendgrid,
    dnsimple,
    outbox,
    logger,
    senderResolver,
  );
  return { svc, prisma, config, crypto, sendgrid, dnsimple, outbox, logger, senderResolver };
}

const emitted = (outbox: any): string[] => outbox.append.mock.calls.map((c: any[]) => c[1].eventType);

const makeRun = (over: Record<string, unknown> = {}) => ({
  id: "run1",
  tenantId: "t1",
  campaignId: null,
  accountId: null,
  identityId: null,
  status: S.REQUESTED,
  resumeStatus: null,
  sendgridDomainId: null,
  dnsimpleRecordIds: null,
  input: {},
  createdAt: new Date(),
  ...over,
});

const makeAccount = (over: Record<string, unknown> = {}) => ({
  id: "acc1",
  tenantId: "t1",
  mode: EmailAccountMode.SUBUSER,
  status: EmailAccountStatus.PROVISIONING,
  subuserUsername: "uprise-acme",
  encryptedApiKey: "enc:key",
  webhookPublicKey: null,
  friendlyName: "Acme",
  ...over,
});

const makeIdentity = (over: Record<string, unknown> = {}) => ({
  id: "id1",
  tenantId: "t1",
  accountId: "acc1",
  campaignId: null,
  kind: EmailIdentityKind.UPRISE_SUBDOMAIN,
  domain: "acme.mail.uprise.org.au",
  fromEmail: "hello@acme.mail.uprise.org.au",
  fromName: "Acme",
  sendgridDomainId: "d1",
  dnsRecords: [{ record: "r1", host: "s1._domainkey.acme", type: "CNAME", data: "s1.dkim", valid: false }],
  purpose: "marketing",
  status: EmailIdentityStatus.PENDING,
  ...over,
});

// ── shared guard behaviour (guarded()) ──────────────────────────────────
describe("EmailProvisioningService – guards (shared)", () => {
  it("is a no-op when the run is missing (not-found guard)", async () => {
    const { svc, prisma, outbox, sendgrid } = setup();
    prisma.emailProvisioningRun.findUnique.mockResolvedValue(null);
    await svc.stepCreateSubuser("run1");
    expect(outbox.append).not.toHaveBeenCalled();
    expect(sendgrid.listIps).not.toHaveBeenCalled();
  });

  it("skips a stale event when the run has already advanced past the expected status", async () => {
    const { svc, prisma, outbox, sendgrid, logger } = setup();
    prisma.emailProvisioningRun.findUnique.mockResolvedValue(makeRun({ status: S.SUBUSER_CREATED }));
    await svc.stepCreateSubuser("run1");
    expect(logger.warn).toHaveBeenCalled();
    expect(outbox.append).not.toHaveBeenCalled();
    expect(sendgrid.listIps).not.toHaveBeenCalled();
  });
});

// ── stepCreateSubuser: REQUESTED → SUBUSER_CREATED ──────────────────────
describe("stepCreateSubuser", () => {
  it("creates the subuser + key + account, advances to SUBUSER_CREATED and emits", async () => {
    const { svc, prisma, crypto, sendgrid, outbox } = setup();
    prisma.emailProvisioningRun.findUnique.mockResolvedValue(makeRun({ status: S.REQUESTED, input: { slug: "acme" } }));
    await svc.stepCreateSubuser("run1");

    expect(sendgrid.listIps).toHaveBeenCalled();
    expect(sendgrid.createSubuser).toHaveBeenCalledWith(
      { apiKey: "master" },
      expect.objectContaining({ username: "uprise-acme", ips: ["1.2.3.4"] }),
    );
    expect(sendgrid.createSubuserApiKey).toHaveBeenCalled();
    expect(crypto.encrypt).toHaveBeenCalledWith("sk_sub");
    expect(prisma.emailAccount.create).toHaveBeenCalledWith(
      expect.objectContaining({ data: expect.objectContaining({ mode: EmailAccountMode.SUBUSER, subuserUsername: "uprise-acme" }) }),
    );
    expect(prisma.emailProvisioningRun.update).toHaveBeenCalledWith(
      expect.objectContaining({ data: expect.objectContaining({ status: S.SUBUSER_CREATED }) }),
    );
    expect(outbox.append).toHaveBeenCalledWith(
      expect.anything(),
      expect.objectContaining({ eventType: "email.provisioning.subuser-created" }),
    );
  });

  it("reuses the run's own account (BYO) without touching SendGrid", async () => {
    const { svc, prisma, sendgrid, outbox } = setup();
    prisma.emailProvisioningRun.findUnique.mockResolvedValue(makeRun({ status: S.REQUESTED, accountId: "accX" }));
    prisma.emailAccount.findUnique.mockResolvedValue(makeAccount({ id: "accX", mode: EmailAccountMode.BYO }));
    await svc.stepCreateSubuser("run1");

    expect(sendgrid.createSubuser).not.toHaveBeenCalled();
    expect(prisma.emailProvisioningRun.update).toHaveBeenCalledWith(
      expect.objectContaining({ data: expect.objectContaining({ status: S.SUBUSER_CREATED, accountId: "accX" }) }),
    );
    expect(emitted(outbox)).toContain("email.provisioning.subuser-created");
  });

  it("reuses an existing ACTIVE tenant account (second identity)", async () => {
    const { svc, prisma, sendgrid, outbox } = setup();
    prisma.emailProvisioningRun.findUnique.mockResolvedValue(makeRun({ status: S.REQUESTED, accountId: null }));
    prisma.emailAccount.findFirst.mockResolvedValue(makeAccount({ status: EmailAccountStatus.ACTIVE }));
    await svc.stepCreateSubuser("run1");

    expect(sendgrid.createSubuser).not.toHaveBeenCalled();
    expect(prisma.emailAccount.create).not.toHaveBeenCalled();
    expect(emitted(outbox)).toContain("email.provisioning.subuser-created");
  });

  it("parks the run FAILED (resumeStatus REQUESTED + failed event) when the master account has no IPs", async () => {
    const { svc, prisma, sendgrid, outbox } = setup();
    prisma.emailProvisioningRun.findUnique.mockResolvedValue(makeRun({ status: S.REQUESTED }));
    prisma.emailAccount.findFirst.mockResolvedValue(null);
    sendgrid.listIps.mockResolvedValue([]);
    await svc.stepCreateSubuser("run1");

    expect(prisma.emailProvisioningRun.update).toHaveBeenCalledWith(
      expect.objectContaining({ data: expect.objectContaining({ status: S.FAILED, resumeStatus: S.REQUESTED }) }),
    );
    expect(outbox.append).toHaveBeenCalledWith(
      expect.anything(),
      expect.objectContaining({ eventType: "email.provisioning.failed" }),
    );
    expect(emitted(outbox)).not.toContain("email.provisioning.subuser-created");
  });
});

// ── stepCreateDomainAuth: SUBUSER_CREATED → DOMAIN_AUTH_CREATED / fast-path ──
describe("stepCreateDomainAuth", () => {
  it("creates SendGrid domain auth, assigns it to the subuser, writes the identity and emits domain-auth-created", async () => {
    const { svc, prisma, sendgrid, outbox } = setup();
    prisma.emailProvisioningRun.findUnique.mockResolvedValue(
      makeRun({ status: S.SUBUSER_CREATED, accountId: "acc1", input: { kind: "UPRISE_SUBDOMAIN", slug: "acme", fromLocalPart: "hello", fromName: "Acme" } }),
    );
    prisma.emailAccount.findUnique.mockResolvedValue(makeAccount());
    await svc.stepCreateDomainAuth("run1");

    expect(sendgrid.createDomainAuth).toHaveBeenCalledWith({ apiKey: "master" }, "acme.mail.uprise.org.au");
    expect(sendgrid.assignDomainToSubuser).toHaveBeenCalledWith({ apiKey: "master" }, "d1", "uprise-acme");
    expect(prisma.emailSenderIdentity.create).toHaveBeenCalledWith(
      expect.objectContaining({ data: expect.objectContaining({ domain: "acme.mail.uprise.org.au", sendgridDomainId: "d1" }) }),
    );
    expect(prisma.emailProvisioningRun.update).toHaveBeenCalledWith(
      expect.objectContaining({ data: expect.objectContaining({ status: S.DOMAIN_AUTH_CREATED, sendgridDomainId: "d1" }) }),
    );
    expect(outbox.append).toHaveBeenCalledWith(
      expect.anything(),
      expect.objectContaining({ eventType: "email.provisioning.domain-auth-created" }),
    );
  });

  it("SINGLE_ADDRESS fast-path skips domain auth and hops straight to DOMAIN_VERIFIED", async () => {
    const { svc, prisma, sendgrid, outbox } = setup();
    prisma.emailProvisioningRun.findUnique.mockResolvedValue(
      makeRun({ status: S.SUBUSER_CREATED, accountId: "acc1", input: { kind: "SINGLE_ADDRESS", domain: "Mail.Acme.Com", fromLocalPart: "hi", fromName: "Acme" } }),
    );
    prisma.emailAccount.findUnique.mockResolvedValue(makeAccount({ mode: EmailAccountMode.BYO }));
    await svc.stepCreateDomainAuth("run1");

    expect(sendgrid.createDomainAuth).not.toHaveBeenCalled();
    expect(prisma.emailSenderIdentity.create).toHaveBeenCalledWith(
      expect.objectContaining({ data: expect.objectContaining({ kind: EmailIdentityKind.SINGLE_ADDRESS, domain: "mail.acme.com" }) }),
    );
    expect(prisma.emailProvisioningRun.update).toHaveBeenCalledWith(
      expect.objectContaining({ data: expect.objectContaining({ status: S.DOMAIN_VERIFIED }) }),
    );
    expect(outbox.append).toHaveBeenCalledWith(
      expect.anything(),
      expect.objectContaining({ eventType: "email.provisioning.domain-verified" }),
    );
  });

  it("parks FAILED when the run has no account (subuser step incomplete)", async () => {
    const { svc, prisma, outbox } = setup();
    prisma.emailProvisioningRun.findUnique.mockResolvedValue(makeRun({ status: S.SUBUSER_CREATED, accountId: null }));
    await svc.stepCreateDomainAuth("run1");

    expect(prisma.emailProvisioningRun.update).toHaveBeenCalledWith(
      expect.objectContaining({ data: expect.objectContaining({ status: S.FAILED, resumeStatus: S.SUBUSER_CREATED }) }),
    );
    expect(emitted(outbox)).toContain("email.provisioning.failed");
  });

  it("parks FAILED when SendGrid domain auth throws", async () => {
    const { svc, prisma, sendgrid, outbox } = setup();
    prisma.emailProvisioningRun.findUnique.mockResolvedValue(
      makeRun({ status: S.SUBUSER_CREATED, accountId: "acc1", input: { kind: "CUSTOM_DOMAIN", domain: "acme.com", fromLocalPart: "hi", fromName: "Acme" } }),
    );
    prisma.emailAccount.findUnique.mockResolvedValue(makeAccount({ mode: EmailAccountMode.BYO }));
    sendgrid.createDomainAuth.mockRejectedValue(new Error("sendgrid 500"));
    await svc.stepCreateDomainAuth("run1");

    expect(emitted(outbox)).toEqual(["email.provisioning.failed"]);
    expect(prisma.emailProvisioningRun.update).toHaveBeenCalledWith(
      expect.objectContaining({ data: expect.objectContaining({ status: S.FAILED }) }),
    );
  });
});

// ── stepConfigureDns: DOMAIN_AUTH_CREATED → DNS_CONFIGURED ───────────────
describe("stepConfigureDns", () => {
  it("automates CNAMEs via DNSimple for UPRISE_SUBDOMAIN and emits dns-configured", async () => {
    const { svc, prisma, dnsimple, outbox } = setup();
    prisma.emailProvisioningRun.findUnique.mockResolvedValue(
      makeRun({ status: S.DOMAIN_AUTH_CREATED, identityId: "id1", input: { kind: "UPRISE_SUBDOMAIN" } }),
    );
    prisma.emailSenderIdentity.findUnique.mockResolvedValue(makeIdentity());
    await svc.stepConfigureDns("run1");

    expect(dnsimple.ensureRecord).toHaveBeenCalledWith(
      expect.objectContaining({ type: "CNAME", content: "s1.dkim" }),
    );
    expect(prisma.emailProvisioningRun.update).toHaveBeenCalledWith(
      expect.objectContaining({ data: expect.objectContaining({ status: S.DNS_CONFIGURED, dnsimpleRecordIds: [101] }) }),
    );
    expect(outbox.append).toHaveBeenCalledWith(
      expect.anything(),
      expect.objectContaining({ eventType: "email.provisioning.dns-configured" }),
    );
  });

  it("surfaces records for the tenant to add (CUSTOM_DOMAIN) without touching DNSimple", async () => {
    const { svc, prisma, dnsimple, outbox } = setup();
    prisma.emailProvisioningRun.findUnique.mockResolvedValue(
      makeRun({ status: S.DOMAIN_AUTH_CREATED, identityId: "id1", input: { kind: "CUSTOM_DOMAIN" } }),
    );
    prisma.emailSenderIdentity.findUnique.mockResolvedValue(makeIdentity({ kind: EmailIdentityKind.CUSTOM_DOMAIN }));
    await svc.stepConfigureDns("run1");

    expect(dnsimple.ensureRecord).not.toHaveBeenCalled();
    expect(prisma.emailProvisioningRun.update).toHaveBeenCalledWith(
      expect.objectContaining({ data: expect.objectContaining({ status: S.DNS_CONFIGURED }) }),
    );
    expect(emitted(outbox)).toContain("email.provisioning.dns-configured");
  });

  it("parks FAILED when DNSimple record creation throws", async () => {
    const { svc, prisma, dnsimple, outbox } = setup();
    prisma.emailProvisioningRun.findUnique.mockResolvedValue(
      makeRun({ status: S.DOMAIN_AUTH_CREATED, identityId: "id1", input: { kind: "UPRISE_SUBDOMAIN" } }),
    );
    prisma.emailSenderIdentity.findUnique.mockResolvedValue(makeIdentity());
    dnsimple.ensureRecord.mockRejectedValue(new Error("dnsimple down"));
    await svc.stepConfigureDns("run1");

    expect(emitted(outbox)).toEqual(["email.provisioning.failed"]);
    expect(prisma.emailProvisioningRun.update).toHaveBeenCalledWith(
      expect.objectContaining({ data: expect.objectContaining({ status: S.FAILED, resumeStatus: S.DOMAIN_AUTH_CREATED }) }),
    );
  });
});

// ── stepValidateDomain: DNS_CONFIGURED|VALIDATION_FAILED → DOMAIN_VERIFIED/VALIDATION_FAILED ──
describe("stepValidateDomain", () => {
  it("verifies the domain, refreshes DNS, advances to DOMAIN_VERIFIED and emits", async () => {
    const { svc, prisma, sendgrid, outbox } = setup();
    prisma.emailProvisioningRun.findUnique.mockResolvedValue(
      makeRun({ status: S.DNS_CONFIGURED, accountId: "acc1", identityId: "id1", sendgridDomainId: "d1" }),
    );
    prisma.emailAccount.findUnique.mockResolvedValue(makeAccount());
    await svc.stepValidateDomain("run1");

    expect(sendgrid.validateDomain).toHaveBeenCalledWith({ apiKey: "master" }, "d1");
    expect(sendgrid.getDomainAuth).toHaveBeenCalledWith({ apiKey: "master" }, "d1");
    expect(prisma.emailSenderIdentity.update).toHaveBeenCalledWith(
      expect.objectContaining({ where: { id: "id1" } }),
    );
    expect(prisma.emailProvisioningRun.update).toHaveBeenCalledWith(
      expect.objectContaining({ data: expect.objectContaining({ status: S.DOMAIN_VERIFIED }) }),
    );
    expect(outbox.append).toHaveBeenCalledWith(
      expect.anything(),
      expect.objectContaining({ eventType: "email.provisioning.domain-verified" }),
    );
  });

  it("retries with a propagation grace, breaking on the first valid check (BYO decrypt path)", async () => {
    const { svc, prisma, crypto, sendgrid } = setup();
    prisma.emailProvisioningRun.findUnique.mockResolvedValue(
      makeRun({ status: S.DNS_CONFIGURED, accountId: "acc1", identityId: "id1", sendgridDomainId: "d1" }),
    );
    prisma.emailAccount.findUnique.mockResolvedValue(makeAccount({ mode: EmailAccountMode.BYO }));
    sendgrid.validateDomain
      .mockResolvedValueOnce({ valid: false, results: { a: 1 } })
      .mockResolvedValueOnce({ valid: true, results: {} });
    await svc.stepValidateDomain("run1", { attempts: 3, delayMs: 0 });

    expect(crypto.decrypt).toHaveBeenCalledWith("enc:key");
    expect(sendgrid.validateDomain).toHaveBeenCalledTimes(2);
    expect(prisma.emailProvisioningRun.update).toHaveBeenCalledWith(
      expect.objectContaining({ data: expect.objectContaining({ status: S.DOMAIN_VERIFIED }) }),
    );
  });

  it("hops DNS_CONFIGURED → VALIDATION_FAILED once and emits validation-failed", async () => {
    const { svc, prisma, sendgrid, outbox } = setup();
    prisma.emailProvisioningRun.findUnique.mockResolvedValue(
      makeRun({ status: S.DNS_CONFIGURED, accountId: "acc1", identityId: "id1", sendgridDomainId: "d1" }),
    );
    prisma.emailAccount.findUnique.mockResolvedValue(makeAccount());
    sendgrid.validateDomain.mockResolvedValue({ valid: false, results: { dkim: "missing" } });
    await svc.stepValidateDomain("run1");

    expect(sendgrid.getDomainAuth).not.toHaveBeenCalled();
    expect(prisma.emailProvisioningRun.update).toHaveBeenCalledWith(
      expect.objectContaining({ data: expect.objectContaining({ status: S.VALIDATION_FAILED }) }),
    );
    expect(outbox.append).toHaveBeenCalledWith(
      expect.anything(),
      expect.objectContaining({ eventType: "email.provisioning.validation-failed" }),
    );
  });

  it("stays calm on a repeat invalid check from VALIDATION_FAILED (only refreshes lastError, no event)", async () => {
    const { svc, prisma, sendgrid, outbox } = setup();
    prisma.emailProvisioningRun.findUnique.mockResolvedValue(
      makeRun({ status: S.VALIDATION_FAILED, accountId: "acc1", identityId: "id1", sendgridDomainId: "d1" }),
    );
    prisma.emailAccount.findUnique.mockResolvedValue(makeAccount());
    sendgrid.validateDomain.mockResolvedValue({ valid: false, results: { dkim: "still missing" } });
    await svc.stepValidateDomain("run1");

    expect(outbox.append).not.toHaveBeenCalled();
    expect(prisma.emailProvisioningRun.update).toHaveBeenCalledWith(
      expect.objectContaining({ data: { lastError: expect.any(String) } }),
    );
  });

  it("parks FAILED when the run has no domain auth to validate", async () => {
    const { svc, prisma, outbox } = setup();
    prisma.emailProvisioningRun.findUnique.mockResolvedValue(
      makeRun({ status: S.DNS_CONFIGURED, accountId: "acc1", identityId: "id1", sendgridDomainId: null }),
    );
    await svc.stepValidateDomain("run1");

    expect(emitted(outbox)).toEqual(["email.provisioning.failed"]);
  });
});

// ── stepConfigureWebhooks: DOMAIN_VERIFIED → WEBHOOKS_CONFIGURED ─────────
describe("stepConfigureWebhooks", () => {
  it("configures the event webhook + signed key on-behalf-of the subuser and emits", async () => {
    const { svc, prisma, sendgrid, outbox } = setup();
    prisma.emailProvisioningRun.findUnique.mockResolvedValue(makeRun({ status: S.DOMAIN_VERIFIED, accountId: "acc1" }));
    prisma.emailAccount.findUnique.mockResolvedValue(makeAccount({ webhookPublicKey: null }));
    await svc.stepConfigureWebhooks("run1");

    expect(sendgrid.configureEventWebhook).toHaveBeenCalledWith(
      { apiKey: "master", onBehalfOf: "uprise-acme" },
      expect.stringContaining("/api/v1/email-webhook"),
    );
    expect(sendgrid.enableSignedWebhook).toHaveBeenCalled();
    expect(prisma.emailAccount.update).toHaveBeenCalledWith(
      expect.objectContaining({ data: { webhookPublicKey: "pubkey" } }),
    );
    expect(prisma.emailProvisioningRun.update).toHaveBeenCalledWith(
      expect.objectContaining({ data: expect.objectContaining({ status: S.WEBHOOKS_CONFIGURED }) }),
    );
    expect(outbox.append).toHaveBeenCalledWith(
      expect.anything(),
      expect.objectContaining({ eventType: "email.provisioning.webhooks-configured" }),
    );
  });

  it("reuses an already-configured webhook key (SKIPPED) without calling SendGrid", async () => {
    const { svc, prisma, sendgrid, outbox } = setup();
    prisma.emailProvisioningRun.findUnique.mockResolvedValue(makeRun({ status: S.DOMAIN_VERIFIED, accountId: "acc1" }));
    prisma.emailAccount.findUnique.mockResolvedValue(makeAccount({ webhookPublicKey: "existing-key" }));
    await svc.stepConfigureWebhooks("run1");

    expect(sendgrid.configureEventWebhook).not.toHaveBeenCalled();
    expect(sendgrid.enableSignedWebhook).not.toHaveBeenCalled();
    expect(emitted(outbox)).toContain("email.provisioning.webhooks-configured");
  });

  it("parks FAILED when the signed-webhook call throws", async () => {
    const { svc, prisma, sendgrid, outbox } = setup();
    prisma.emailProvisioningRun.findUnique.mockResolvedValue(makeRun({ status: S.DOMAIN_VERIFIED, accountId: "acc1" }));
    prisma.emailAccount.findUnique.mockResolvedValue(makeAccount({ webhookPublicKey: null }));
    sendgrid.enableSignedWebhook.mockRejectedValue(new Error("no public key"));
    await svc.stepConfigureWebhooks("run1");

    expect(emitted(outbox)).toEqual(["email.provisioning.failed"]);
    expect(prisma.emailProvisioningRun.update).toHaveBeenCalledWith(
      expect.objectContaining({ data: expect.objectContaining({ status: S.FAILED, resumeStatus: S.DOMAIN_VERIFIED }) }),
    );
  });
});

// ── stepActivate: WEBHOOKS_CONFIGURED → ACTIVE ──────────────────────────
describe("stepActivate", () => {
  it("activates the identity + account, emits activated and invalidates the sender cache", async () => {
    const { svc, prisma, outbox, senderResolver } = setup();
    prisma.emailProvisioningRun.findUnique.mockResolvedValue(
      makeRun({ status: S.WEBHOOKS_CONFIGURED, accountId: "acc1", identityId: "id1" }),
    );
    prisma.emailSenderIdentity.findUnique.mockResolvedValue(makeIdentity());
    await svc.stepActivate("run1");

    expect(prisma.emailSenderIdentity.update).toHaveBeenCalledWith(
      expect.objectContaining({ data: { status: EmailIdentityStatus.ACTIVE } }),
    );
    expect(prisma.emailAccount.update).toHaveBeenCalledWith(
      expect.objectContaining({ data: { status: EmailAccountStatus.ACTIVE } }),
    );
    expect(prisma.emailProvisioningRun.update).toHaveBeenCalledWith(
      expect.objectContaining({ data: expect.objectContaining({ status: S.ACTIVE }) }),
    );
    expect(outbox.append).toHaveBeenCalledWith(
      expect.anything(),
      expect.objectContaining({ eventType: "email.provisioning.activated" }),
    );
    expect(senderResolver.invalidate).toHaveBeenCalledWith("t1");
  });

  it("parks FAILED when the identity row is missing", async () => {
    const { svc, prisma, outbox, senderResolver } = setup();
    prisma.emailProvisioningRun.findUnique.mockResolvedValue(
      makeRun({ status: S.WEBHOOKS_CONFIGURED, accountId: "acc1", identityId: "id1" }),
    );
    prisma.emailSenderIdentity.findUnique.mockResolvedValue(null);
    await svc.stepActivate("run1");

    expect(emitted(outbox)).toEqual(["email.provisioning.failed"]);
    expect(senderResolver.invalidate).not.toHaveBeenCalled();
  });
});

// ── startRun ────────────────────────────────────────────────────────────
describe("startRun", () => {
  it("rejects BYO mode without an API key", async () => {
    const { svc } = setup();
    await expect(
      svc.startRun({ tenantId: "t1", mode: "BYO", kind: "CUSTOM_DOMAIN", domain: "acme.com", fromLocalPart: "hi", fromName: "Acme" }),
    ).rejects.toThrow();
  });

  it("rejects a custom-domain kind without a domain", async () => {
    const { svc } = setup();
    await expect(
      svc.startRun({ tenantId: "t1", mode: "SUBUSER", kind: "CUSTOM_DOMAIN", fromLocalPart: "hi", fromName: "Acme" }),
    ).rejects.toThrow();
  });

  it("creates a SUBUSER run + requested step and emits requested (no account row)", async () => {
    const { svc, prisma, outbox } = setup();
    await svc.startRun({ tenantId: "t1", mode: "SUBUSER", kind: "UPRISE_SUBDOMAIN", slug: "acme", fromLocalPart: "hi", fromName: "Acme" });

    expect(prisma.emailAccount.create).not.toHaveBeenCalled();
    expect(prisma.emailProvisioningRun.create).toHaveBeenCalledWith(
      expect.objectContaining({ data: expect.objectContaining({ status: S.REQUESTED, accountId: null }) }),
    );
    expect(outbox.append).toHaveBeenCalledWith(
      expect.anything(),
      expect.objectContaining({ eventType: "email.provisioning.requested" }),
    );
  });

  it("BYO stores the encrypted key on a new account and never in the run input", async () => {
    const { svc, prisma, crypto } = setup();
    await svc.startRun({
      tenantId: "t1",
      mode: "BYO",
      kind: "CUSTOM_DOMAIN",
      domain: "acme.com",
      fromLocalPart: "hi",
      fromName: "Acme",
      byoApiKey: "SG.secret",
    });

    expect(crypto.encrypt).toHaveBeenCalledWith("SG.secret");
    expect(prisma.emailAccount.create).toHaveBeenCalledWith(
      expect.objectContaining({ data: expect.objectContaining({ mode: EmailAccountMode.BYO, encryptedApiKey: "enc:SG.secret" }) }),
    );
    const runInput = (prisma.emailProvisioningRun.create.mock.calls[0][0].data.input) as Record<string, unknown>;
    expect(runInput).not.toHaveProperty("byoApiKey");
  });
});

// ── retry ────────────────────────────────────────────────────────────────
describe("retry", () => {
  it("rejects a run that is not FAILED / has no resume point", async () => {
    const { svc, prisma } = setup();
    prisma.emailProvisioningRun.findUnique.mockResolvedValue(makeRun({ status: S.ACTIVE }));
    await expect(svc.retry("run1")).rejects.toThrow();
  });

  it("resumes a FAILED run to its resumeStatus and re-emits the entry event", async () => {
    const { svc, prisma, outbox } = setup();
    prisma.emailProvisioningRun.findUnique.mockResolvedValue(
      makeRun({ status: S.FAILED, resumeStatus: S.DOMAIN_VERIFIED, identityId: "id1" }),
    );
    await svc.retry("run1");

    expect(prisma.emailProvisioningRun.update).toHaveBeenCalledWith(
      expect.objectContaining({ data: expect.objectContaining({ status: S.DOMAIN_VERIFIED, resumeStatus: null }) }),
    );
    const types = emitted(outbox);
    expect(types).toContain("email.provisioning.retry-requested");
    expect(types).toContain("email.provisioning.domain-verified");
  });
});

// ── revokeIdentity ────────────────────────────────────────────────────────
describe("revokeIdentity", () => {
  it("throws when the identity is missing", async () => {
    const { svc, prisma } = setup();
    prisma.emailSenderIdentity.findUnique.mockResolvedValue(null);
    await expect(svc.revokeIdentity("id1")).rejects.toBeInstanceOf(NotFoundException);
  });

  it("is a no-op for an already-revoked identity", async () => {
    const { svc, prisma, sendgrid } = setup();
    prisma.emailSenderIdentity.findUnique.mockResolvedValue(makeIdentity({ status: EmailIdentityStatus.REVOKED }));
    const result = await svc.revokeIdentity("id1");
    expect(result.status).toBe(EmailIdentityStatus.REVOKED);
    expect(prisma.emailSenderIdentity.update).not.toHaveBeenCalled();
    expect(sendgrid.deleteDomainAuth).not.toHaveBeenCalled();
  });

  it("cleans up SendGrid + DNSimple, revokes the identity and invalidates the cache", async () => {
    const { svc, prisma, sendgrid, dnsimple, senderResolver } = setup();
    prisma.emailSenderIdentity.findUnique.mockResolvedValue(makeIdentity({ status: EmailIdentityStatus.ACTIVE }));
    prisma.emailProvisioningRun.findFirst.mockResolvedValue(makeRun({ accountId: "acc1", dnsimpleRecordIds: [101, 102] }));
    prisma.emailAccount.findUnique.mockResolvedValue(makeAccount());
    await svc.revokeIdentity("id1");

    expect(sendgrid.deleteDomainAuth).toHaveBeenCalledWith({ apiKey: "master" }, "d1");
    expect(dnsimple.deleteRecord).toHaveBeenCalledTimes(2);
    expect(prisma.emailSenderIdentity.update).toHaveBeenCalledWith(
      expect.objectContaining({ data: { status: EmailIdentityStatus.REVOKED } }),
    );
    expect(prisma.emailProvisioningStep.create).toHaveBeenCalled();
    expect(senderResolver.invalidate).toHaveBeenCalledWith("t1");
  });
});

// ── poll / validateNow / reads ────────────────────────────────────────────
describe("pollPendingValidations", () => {
  it("returns zero counts when nothing is pending", async () => {
    const { svc } = setup();
    const result = await svc.pollPendingValidations();
    expect(result).toEqual({ polled: 0, advanced: 0 });
  });

  it("polls each pending run through validation", async () => {
    const { svc, prisma, sendgrid } = setup();
    prisma.emailProvisioningRun.findMany.mockResolvedValue([
      makeRun({ status: S.DNS_CONFIGURED, accountId: "acc1", identityId: "id1", sendgridDomainId: "d1" }),
    ]);
    prisma.emailProvisioningRun.findUnique.mockResolvedValue(
      makeRun({ status: S.DNS_CONFIGURED, accountId: "acc1", identityId: "id1", sendgridDomainId: "d1" }),
    );
    prisma.emailAccount.findUnique.mockResolvedValue(makeAccount());
    const result = await svc.pollPendingValidations();
    expect(result.polled).toBe(1);
    expect(sendgrid.validateDomain).toHaveBeenCalled();
  });
});

describe("validateNow / reads", () => {
  it("validateNow drives validation and returns the run", async () => {
    const { svc, prisma } = setup();
    prisma.emailProvisioningRun.findUnique.mockResolvedValue(
      makeRun({ status: S.DNS_CONFIGURED, accountId: "acc1", identityId: "id1", sendgridDomainId: "d1" }),
    );
    prisma.emailAccount.findUnique.mockResolvedValue(makeAccount());
    const run = await svc.validateNow("run1");
    expect(run.id).toBe("run1");
  });

  it("listRuns / listIdentities delegate to Prisma", async () => {
    const { svc, prisma } = setup();
    prisma.emailProvisioningRun.findMany.mockResolvedValue([makeRun()]);
    prisma.emailSenderIdentity.findMany.mockResolvedValue([makeIdentity()]);
    expect(await svc.listRuns("t1")).toHaveLength(1);
    expect(await svc.listIdentities("t1")).toHaveLength(1);
  });

  it("getRunWithTimeline throws when the run is missing", async () => {
    const { svc, prisma } = setup();
    prisma.emailProvisioningRun.findUnique.mockResolvedValue(null);
    await expect(svc.getRunWithTimeline("run1")).rejects.toBeInstanceOf(NotFoundException);
  });

  it("getRunWithTimeline returns the run with its timeline", async () => {
    const { svc, prisma } = setup();
    prisma.emailProvisioningRun.findUnique.mockResolvedValue({ ...makeRun(), steps: [] });
    const run = await svc.getRunWithTimeline("run1");
    expect(run.id).toBe("run1");
  });
});
