import { randomUUID } from "crypto";
import { Injectable, NotFoundException } from "@nestjs/common";
import { ConfigService } from "@nestjs/config";
import {
  EmailAccountMode,
  EmailAccountStatus,
  EmailIdentityKind,
  EmailIdentityStatus,
  EmailProvisioningRequestStatus,
  EmailProvisioningStatus,
  EmailStepStatus,
  Prisma,
} from "@uprise/db";
import type { DomainEventMap } from "@uprise/events";
import { PrismaService } from "../prisma/prisma.service";
import { OutboxService, type AppendInput } from "../common/outbox/outbox.service";
import { DomainLogger } from "../common/logging/domain-logger.service";
import { ApiHttpException } from "../common/http/api-response";
import { CredentialCryptoService } from "../integrations/credential-crypto.service";
import { FeatureFlagsService } from "../common/flags/feature-flags.service";
import { EmailSenderResolver } from "./email-sender.resolver";
import { assertValidEmailProvisioningTransition } from "./email-provisioning-state.machine";
import { assertValidEmailSetupRequestTransition } from "./email-setup-request-state.machine";
import {
  SendGridProvisioningClient,
  type DomainAuthDnsRecord,
  type SendGridCreds,
} from "./sendgrid-provisioning.client";
import { DnsimpleClient } from "./dnsimple.client";

const S = EmailProvisioningStatus;

export type StartEmailRunInput = {
  tenantId: string;
  campaignId?: string | null;
  mode: "SUBUSER" | "BYO";
  kind: "UPRISE_SUBDOMAIN" | "CUSTOM_DOMAIN" | "SINGLE_ADDRESS";
  /** Subdomain label for UPRISE_SUBDOMAIN (defaults to the tenant slug). */
  slug?: string;
  /** The tenant-owned domain for CUSTOM_DOMAIN, or the verified address's domain for SINGLE_ADDRESS. */
  domain?: string;
  fromLocalPart: string;
  fromName: string;
  purpose?: string;
  byoApiKey?: string;
  requestedById?: string | null;
  /** An OPEN EmailProvisioningRequest this run fulfils — resolved atomically with run creation. */
  requestId?: string;
};

type RunInput = StartEmailRunInput;

/** Entry event that drives each state's step — re-emitted on retry. */
const ENTRY_EVENT: Partial<Record<EmailProvisioningStatus, keyof DomainEventMap>> = {
  [S.REQUESTED]: "email.provisioning.requested",
  [S.SUBUSER_CREATED]: "email.provisioning.subuser-created",
  [S.DOMAIN_AUTH_CREATED]: "email.provisioning.domain-auth-created",
  [S.DNS_CONFIGURED]: "email.provisioning.dns-configured",
  [S.VALIDATION_FAILED]: "email.provisioning.validation-failed",
  [S.DOMAIN_VERIFIED]: "email.provisioning.domain-verified",
  [S.WEBHOOKS_CONFIGURED]: "email.provisioning.webhooks-configured",
};

/**
 * Drives an email-identity provisioning run through the FSM — the SendGrid twin
 * of TelephonyProvisioningService: every step does its external calls FIRST,
 * then one `$transaction` reloads the run FOR UPDATE, asserts the hop(s),
 * updates the run, appends the timeline step(s), and appends the next domain
 * event for the reaction chain. Failures park the run in FAILED with
 * `resumeStatus`; the reaction registry swallows errors, so recovery is via
 * the explicit retry action. Domain validation has no webhook — the cron poll
 * and "validate now" drive the DNS_CONFIGURED/VALIDATION_FAILED wait states.
 */
@Injectable()
export class EmailProvisioningService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly config: ConfigService,
    private readonly crypto: CredentialCryptoService,
    private readonly sendgrid: SendGridProvisioningClient,
    private readonly dnsimple: DnsimpleClient,
    private readonly outbox: OutboxService,
    private readonly logger: DomainLogger,
    private readonly senderResolver: EmailSenderResolver,
    private readonly flags: FeatureFlagsService,
  ) {}

  private emailWebhookUrl(): string {
    const base = this.config.get<string>("API_BASE_URL", "").trim().replace(/\/+$/, "");
    return `${base}/api/v1/email-webhook`;
  }

  private rootDomain(): string {
    return this.config.get<string>("EMAIL_IDENTITY_ROOT_DOMAIN", "mail.uprise.org.au").trim();
  }

  // ── plumbing (telephony canon) ──────────────────────────────────────
  private async getRunOrThrow(id: string) {
    const run = await this.prisma.emailProvisioningRun.findUnique({ where: { id } });
    if (!run) throw new NotFoundException("Email provisioning run not found");
    return run;
  }

  private inputOf(run: { input: Prisma.JsonValue }): RunInput {
    return (run.input ?? {}) as RunInput;
  }

  /** Creds for external calls against an account: BYO = its own key; SUBUSER/PLATFORM = master. */
  private async accountCreds(accountId: string, opts?: { onBehalfOf?: boolean }): Promise<SendGridCreds> {
    const account = await this.prisma.emailAccount.findUnique({ where: { id: accountId } });
    if (!account) throw new NotFoundException("Email account not found");
    if (account.mode === EmailAccountMode.BYO) {
      return { apiKey: this.crypto.decrypt(account.encryptedApiKey) };
    }
    const master = this.sendgrid.masterCreds();
    return opts?.onBehalfOf && account.subuserUsername
      ? { ...master, onBehalfOf: account.subuserUsername }
      : master;
  }

  private async advance(
    runId: string,
    opts: {
      hops: Array<{ to: EmailProvisioningStatus; step: string; stepStatus?: EmailStepStatus; detail?: Record<string, unknown> }>;
      data?: Prisma.EmailProvisioningRunUncheckedUpdateInput;
      event?: AppendInput | null;
      mutate?: (tx: Prisma.TransactionClient) => Promise<void>;
    },
  ) {
    return this.prisma.$transaction(async (tx) => {
      await tx.$queryRaw`SELECT "id" FROM "email"."EmailProvisioningRun" WHERE "id" = ${runId} FOR UPDATE`;
      const run = await tx.emailProvisioningRun.findUnique({ where: { id: runId } });
      if (!run) throw new NotFoundException("Email provisioning run not found");
      if (opts.mutate) await opts.mutate(tx);

      let from = run.status;
      for (const hop of opts.hops) {
        assertValidEmailProvisioningTransition(from, hop.to);
        from = hop.to;
      }
      const updated = await tx.emailProvisioningRun.update({
        where: { id: runId },
        data: { ...opts.data, status: from, resumeStatus: null, lastError: null },
      });
      for (const hop of opts.hops) {
        await tx.emailProvisioningStep.create({
          data: {
            runId,
            tenantId: run.tenantId,
            step: hop.step,
            status: hop.stepStatus ?? EmailStepStatus.SUCCEEDED,
            detail: (hop.detail ?? {}) as Prisma.InputJsonValue,
          },
        });
      }
      if (opts.event) await this.outbox.append(tx, opts.event);
      return updated;
    });
  }

  private async failRun(runId: string, step: string, error: unknown): Promise<void> {
    const message = String(error instanceof Error ? error.message : error).slice(0, 2000);
    await this.prisma.$transaction(async (tx) => {
      await tx.$queryRaw`SELECT "id" FROM "email"."EmailProvisioningRun" WHERE "id" = ${runId} FOR UPDATE`;
      const run = await tx.emailProvisioningRun.findUnique({ where: { id: runId } });
      if (!run || run.status === S.FAILED || run.status === S.ACTIVE) return;
      assertValidEmailProvisioningTransition(run.status, S.FAILED);
      await tx.emailProvisioningRun.update({
        where: { id: runId },
        data: { status: S.FAILED, resumeStatus: run.status, lastError: message },
      });
      await tx.emailProvisioningStep.create({
        data: { runId, tenantId: run.tenantId, step, status: EmailStepStatus.FAILED, error: message },
      });
      await this.outbox.append(tx, {
        tenantId: run.tenantId,
        eventType: "email.provisioning.failed",
        aggregateId: runId,
        payload: { runId, tenantId: run.tenantId, step, error: message },
      });
    });
    this.logger.error("email", "Email provisioning step failed", undefined, { runId, step, error: message });
  }

  private async guarded(
    runId: string,
    step: string,
    expect: EmailProvisioningStatus[],
    work: () => Promise<void>,
  ): Promise<void> {
    const run = await this.prisma.emailProvisioningRun.findUnique({ where: { id: runId } });
    if (!run) return;
    if (!expect.includes(run.status)) {
      this.logger.warn("email", "Skipping stale email-provisioning event", { runId, step, status: run.status });
      return;
    }
    try {
      await work();
    } catch (err) {
      await this.failRun(runId, step, err);
    }
  }

  // ── lifecycle ───────────────────────────────────────────────────────
  async startRun(input: StartEmailRunInput) {
    if (input.mode === "BYO" && !input.byoApiKey) {
      throw new ApiHttpException("BYO_KEY_REQUIRED", "BYO mode needs a SendGrid API key");
    }
    if (input.kind !== "UPRISE_SUBDOMAIN" && !input.domain?.trim()) {
      throw new ApiHttpException("DOMAIN_REQUIRED", "Custom-domain and single-address identities need a domain");
    }
    // The stored input never contains the BYO key — it lands encrypted on the account row.
    const { byoApiKey, ...storedInput } = input;
    return this.prisma.$transaction(async (tx) => {
      let accountId: string | null = null;
      if (input.mode === "BYO" && byoApiKey) {
        const tenant = await tx.tenant.findUnique({ where: { id: input.tenantId } });
        const existing = await tx.emailAccount.findFirst({
          where: { tenantId: input.tenantId, mode: EmailAccountMode.BYO },
        });
        const account = existing
          ? await tx.emailAccount.update({
              where: { id: existing.id },
              data: { encryptedApiKey: this.crypto.encrypt(byoApiKey) },
            })
          : await tx.emailAccount.create({
              data: {
                tenantId: input.tenantId,
                mode: EmailAccountMode.BYO,
                encryptedApiKey: this.crypto.encrypt(byoApiKey),
                friendlyName: tenant?.name ?? input.tenantId,
              },
            });
        accountId = account.id;
      }
      const run = await tx.emailProvisioningRun.create({
        data: {
          tenantId: input.tenantId,
          campaignId: input.campaignId ?? null,
          accountId,
          status: S.REQUESTED,
          input: storedInput as unknown as Prisma.InputJsonValue,
          requestedById: input.requestedById ?? null,
        },
      });
      await tx.emailProvisioningStep.create({
        data: {
          runId: run.id,
          tenantId: input.tenantId,
          step: "run.requested",
          status: EmailStepStatus.SUCCEEDED,
          detail: { mode: input.mode, kind: input.kind, campaignId: input.campaignId ?? null } as Prisma.InputJsonValue,
        },
      });
      await this.outbox.append(tx, {
        tenantId: input.tenantId,
        eventType: "email.provisioning.requested",
        aggregateId: run.id,
        payload: {
          runId: run.id,
          tenantId: input.tenantId,
          campaignId: input.campaignId ?? null,
          mode: input.mode,
          kind: input.kind,
        },
      });
      // Fulfil the owner's setup request atomically with run creation, so the operator
      // queue can never show an OPEN request alongside its live run.
      if (input.requestId) {
        await tx.$queryRaw`SELECT "id" FROM "email"."EmailProvisioningRequest" WHERE "id" = ${input.requestId} FOR UPDATE`;
        const request = await tx.emailProvisioningRequest.findUnique({ where: { id: input.requestId } });
        if (!request || request.tenantId !== input.tenantId) {
          throw new ApiHttpException("REQUEST_NOT_FOUND", "Email setup request not found for this tenant", 404);
        }
        assertValidEmailSetupRequestTransition(request.status, EmailProvisioningRequestStatus.FULFILLED);
        await tx.emailProvisioningRequest.update({
          where: { id: request.id },
          data: {
            status: EmailProvisioningRequestStatus.FULFILLED,
            runId: run.id,
            resolvedById: input.requestedById ?? null,
            resolvedAt: new Date(),
          },
        });
        await this.outbox.append(tx, {
          tenantId: input.tenantId,
          eventType: "email.setup.resolved",
          aggregateId: request.id,
          payload: { requestId: request.id, tenantId: input.tenantId, outcome: "FULFILLED", runId: run.id },
        });
      }
      return run;
    });
  }

  // ── Setup requests (owner ask → operator queue; provisioning stays super-admin) ──

  /** Owner asks for email setup. Plan-gated; one OPEN request per tenant (409 on a second). */
  async createSetupRequest(input: {
    tenantId: string;
    requestedById: string | null;
    kind?: EmailIdentityKind;
    domain?: string | null;
    notes?: string | null;
  }) {
    const enabled = await this.flags.isEnabled("FEATURE_TENANT_EMAIL_ENABLED", { tenantId: input.tenantId });
    if (!enabled) {
      throw new ApiHttpException(
        "PLAN_UPGRADE_REQUIRED",
        "Your plan does not include a dedicated email identity",
        403,
      );
    }
    try {
      return await this.prisma.$transaction(async (tx) => {
        const open = await tx.emailProvisioningRequest.findFirst({
          where: { tenantId: input.tenantId, status: EmailProvisioningRequestStatus.OPEN },
        });
        if (open) {
          throw new ApiHttpException("EMAIL_REQUEST_ALREADY_OPEN", "An email setup request is already open", 409);
        }
        const request = await tx.emailProvisioningRequest.create({
          data: {
            tenantId: input.tenantId,
            kind: input.kind ?? null,
            domain: input.domain?.trim() || null,
            notes: input.notes?.trim() || null,
            requestedById: input.requestedById,
          },
        });
        // A real domain signal (unlike the advisory onboarding JSON) — emitted in the SAME tx.
        await this.outbox.append(tx, {
          tenantId: input.tenantId,
          eventType: "email.setup.requested",
          aggregateId: request.id,
          payload: {
            requestId: request.id,
            tenantId: input.tenantId,
            requestedById: input.requestedById,
            kind: input.kind ?? null,
            domain: input.domain?.trim() || null,
          },
        });
        return request;
      });
    } catch (error) {
      // Race backstop: the partial unique (one OPEN per tenant) maps to the same 409.
      if (error instanceof Prisma.PrismaClientKnownRequestError && error.code === "P2002") {
        throw new ApiHttpException("EMAIL_REQUEST_ALREADY_OPEN", "An email setup request is already open", 409);
      }
      throw error;
    }
  }

  /** Operator queue (all tenants) or a tenant's own requests. Newest first. */
  listSetupRequests(opts: { tenantId?: string; status?: EmailProvisioningRequestStatus } = {}) {
    return this.prisma.emailProvisioningRequest.findMany({
      where: {
        ...(opts.tenantId ? { tenantId: opts.tenantId } : {}),
        ...(opts.status ? { status: opts.status } : {}),
      },
      orderBy: { createdAt: "desc" },
    });
  }

  /** Operator declines an OPEN request (with an optional reason the owner sees). */
  async declineSetupRequest(id: string, resolvedById: string | null, reason?: string | null) {
    return this.prisma.$transaction(async (tx) => {
      await tx.$queryRaw`SELECT "id" FROM "email"."EmailProvisioningRequest" WHERE "id" = ${id} FOR UPDATE`;
      const request = await tx.emailProvisioningRequest.findUnique({ where: { id } });
      if (!request) throw new NotFoundException("Email setup request not found");
      assertValidEmailSetupRequestTransition(request.status, EmailProvisioningRequestStatus.DECLINED);
      const updated = await tx.emailProvisioningRequest.update({
        where: { id },
        data: {
          status: EmailProvisioningRequestStatus.DECLINED,
          resolvedById,
          resolvedAt: new Date(),
          resolutionReason: reason?.trim() || null,
        },
      });
      await this.outbox.append(tx, {
        tenantId: request.tenantId,
        eventType: "email.setup.resolved",
        aggregateId: request.id,
        payload: { requestId: request.id, tenantId: request.tenantId, outcome: "DECLINED", runId: null },
      });
      return updated;
    });
  }

  /** Owner withdraws their own OPEN request (tenant-scoped). */
  async withdrawSetupRequest(id: string, tenantId: string) {
    return this.prisma.$transaction(async (tx) => {
      await tx.$queryRaw`SELECT "id" FROM "email"."EmailProvisioningRequest" WHERE "id" = ${id} FOR UPDATE`;
      const request = await tx.emailProvisioningRequest.findUnique({ where: { id } });
      if (!request || request.tenantId !== tenantId) {
        throw new NotFoundException("Email setup request not found");
      }
      assertValidEmailSetupRequestTransition(request.status, EmailProvisioningRequestStatus.WITHDRAWN);
      const updated = await tx.emailProvisioningRequest.update({
        where: { id },
        data: { status: EmailProvisioningRequestStatus.WITHDRAWN, resolvedAt: new Date() },
      });
      await this.outbox.append(tx, {
        tenantId,
        eventType: "email.setup.resolved",
        aggregateId: request.id,
        payload: { requestId: request.id, tenantId, outcome: "WITHDRAWN", runId: null },
      });
      return updated;
    });
  }

  /** FAILED → resumeStatus + re-emit that state's entry event (fresh dedup id). */
  async retry(runId: string) {
    const run = await this.getRunOrThrow(runId);
    if (run.status !== S.FAILED || !run.resumeStatus) {
      throw new ApiHttpException("NOT_RETRYABLE", "Only a FAILED run with a recorded resume point can be retried", 409);
    }
    const resume = run.resumeStatus;
    const entryEvent = ENTRY_EVENT[resume];
    const payload = await this.entryPayload(run, resume);
    return this.prisma.$transaction(async (tx) => {
      await tx.$queryRaw`SELECT "id" FROM "email"."EmailProvisioningRun" WHERE "id" = ${runId} FOR UPDATE`;
      const fresh = await tx.emailProvisioningRun.findUnique({ where: { id: runId } });
      if (!fresh || fresh.status !== S.FAILED) {
        throw new ApiHttpException("NOT_RETRYABLE", "Run is no longer FAILED", 409);
      }
      assertValidEmailProvisioningTransition(S.FAILED, resume);
      const updated = await tx.emailProvisioningRun.update({
        where: { id: runId },
        data: { status: resume, resumeStatus: null, lastError: null },
      });
      await tx.emailProvisioningStep.create({
        data: {
          runId,
          tenantId: run.tenantId,
          step: "run.retry",
          status: EmailStepStatus.SUCCEEDED,
          detail: { resumedAt: resume } as Prisma.InputJsonValue,
        },
      });
      await this.outbox.append(tx, {
        tenantId: run.tenantId,
        eventType: "email.provisioning.retry-requested",
        aggregateId: runId,
        payload: { runId, tenantId: run.tenantId, resumeStatus: resume },
      });
      if (entryEvent && payload) {
        await this.outbox.append(tx, {
          tenantId: run.tenantId,
          eventType: entryEvent,
          aggregateId: runId,
          payload: payload as never,
        });
      }
      return updated;
    });
  }

  private async entryPayload(
    run: {
      id: string;
      tenantId: string;
      campaignId: string | null;
      accountId: string | null;
      identityId: string | null;
      sendgridDomainId: string | null;
      input: Prisma.JsonValue;
    },
    resume: EmailProvisioningStatus,
  ): Promise<Record<string, unknown> | null> {
    const base = { runId: run.id, tenantId: run.tenantId };
    const input = this.inputOf(run);
    switch (resume) {
      case S.REQUESTED:
        return { ...base, campaignId: run.campaignId, mode: input.mode, kind: input.kind };
      case S.SUBUSER_CREATED: {
        if (!run.accountId) return null;
        const account = await this.prisma.emailAccount.findUnique({ where: { id: run.accountId } });
        return account
          ? { ...base, accountId: account.id, subuserUsername: account.subuserUsername }
          : null;
      }
      case S.DOMAIN_AUTH_CREATED: {
        if (!run.identityId || !run.sendgridDomainId) return null;
        const identity = await this.prisma.emailSenderIdentity.findUnique({ where: { id: run.identityId } });
        return identity
          ? { ...base, identityId: identity.id, sendgridDomainId: run.sendgridDomainId, domain: identity.domain }
          : null;
      }
      case S.DNS_CONFIGURED:
      case S.VALIDATION_FAILED:
        // kind is required — the dns-configured reaction branches on it, and a
        // missing value would silently skip the automated re-validation.
        return run.identityId && input.kind
          ? { ...base, identityId: run.identityId, kind: input.kind, reason: null }
          : null;
      case S.DOMAIN_VERIFIED:
        return run.identityId ? { ...base, identityId: run.identityId } : null;
      case S.WEBHOOKS_CONFIGURED:
        return run.accountId ? { ...base, accountId: run.accountId } : null;
      default:
        return null;
    }
  }

  // ── steps (called from reactions / cron / validate-now) ────────────
  /** REQUESTED → SUBUSER_CREATED: create the subuser + its key, or reuse. */
  async stepCreateSubuser(runId: string): Promise<void> {
    await this.guarded(runId, "subuser.create", [S.REQUESTED], async () => {
      const run = await this.getRunOrThrow(runId);
      const input = this.inputOf(run);

      // BYO run, or a tenant that already has an ACTIVE account (second identity).
      const existing = run.accountId
        ? await this.prisma.emailAccount.findUnique({ where: { id: run.accountId } })
        : await this.prisma.emailAccount.findFirst({
            where: { tenantId: run.tenantId, status: EmailAccountStatus.ACTIVE },
          });
      if (existing) {
        await this.advance(runId, {
          hops: [
            {
              to: S.SUBUSER_CREATED,
              step: "subuser.create",
              stepStatus: run.accountId ? EmailStepStatus.SUCCEEDED : EmailStepStatus.SKIPPED,
              detail: { subuserUsername: existing.subuserUsername, mode: existing.mode, reused: !run.accountId },
            },
          ],
          data: { accountId: existing.id },
          event: {
            tenantId: run.tenantId,
            eventType: "email.provisioning.subuser-created",
            aggregateId: runId,
            payload: { runId, tenantId: run.tenantId, accountId: existing.id, subuserUsername: existing.subuserUsername },
          },
        });
        return;
      }

      const tenant = await this.prisma.tenant.findUnique({ where: { id: run.tenantId } });
      const slug = (input.slug ?? tenant?.slug ?? run.tenantId).toLowerCase().replace(/[^a-z0-9-]/g, "-");
      const username = `uprise-${slug}`;
      const master = this.sendgrid.masterCreds();
      const ips = await this.sendgrid.listIps(master);
      if (ips.length === 0) throw new Error("No IPs on the SendGrid master account — subusers need at least one");
      await this.sendgrid.createSubuser(master, {
        username,
        email: `sg+${slug}@uprise.org.au`,
        ips,
      });
      const apiKey = await this.sendgrid.createSubuserApiKey(master, username, `uprise ${slug}`);
      const account = await this.prisma.emailAccount.create({
        data: {
          tenantId: run.tenantId,
          mode: EmailAccountMode.SUBUSER,
          subuserUsername: username,
          encryptedApiKey: this.crypto.encrypt(apiKey),
          friendlyName: tenant?.name ?? run.tenantId,
        },
      });
      await this.advance(runId, {
        hops: [{ to: S.SUBUSER_CREATED, step: "subuser.create", detail: { subuserUsername: username } }],
        data: { accountId: account.id },
        event: {
          tenantId: run.tenantId,
          eventType: "email.provisioning.subuser-created",
          aggregateId: runId,
          payload: { runId, tenantId: run.tenantId, accountId: account.id, subuserUsername: username },
        },
      });
    });
  }

  /**
   * SUBUSER_CREATED → DOMAIN_AUTH_CREATED (or the SINGLE_ADDRESS fast-path
   * straight to DOMAIN_VERIFIED with SKIPPED hops). Creates the identity row.
   */
  async stepCreateDomainAuth(runId: string): Promise<void> {
    await this.guarded(runId, "domain-auth.create", [S.SUBUSER_CREATED], async () => {
      const run = await this.getRunOrThrow(runId);
      if (!run.accountId) throw new Error("Run has no account — subuser step incomplete");
      const input = this.inputOf(run);
      const account = await this.prisma.emailAccount.findUnique({ where: { id: run.accountId } });
      if (!account) throw new Error("Email account row missing");

      const domain =
        input.kind === "UPRISE_SUBDOMAIN"
          ? `${(input.slug ?? "").trim() || (await this.tenantSlug(run.tenantId))}.${this.rootDomain()}`
          : String(input.domain).trim().toLowerCase();
      const fromEmail = `${input.fromLocalPart.trim()}@${domain}`;

      if (input.kind === "SINGLE_ADDRESS") {
        // Already-verified sender on the account (BYO) — no domain auth to run.
        // Identity creation rides the advance tx (run + identity + event atomic).
        const identityId = randomUUID();
        await this.advance(runId, {
          hops: [
            { to: S.DOMAIN_AUTH_CREATED, step: "domain-auth.create", stepStatus: EmailStepStatus.SKIPPED, detail: { singleAddress: true } },
            { to: S.DNS_CONFIGURED, step: "dns.configure", stepStatus: EmailStepStatus.SKIPPED },
            { to: S.DOMAIN_VERIFIED, step: "domain.validate", stepStatus: EmailStepStatus.SKIPPED, detail: { singleAddress: true } },
          ],
          data: { identityId },
          mutate: async (tx) => {
            await tx.emailSenderIdentity.create({
              data: {
                id: identityId,
                tenantId: run.tenantId,
                accountId: account.id,
                campaignId: run.campaignId,
                kind: EmailIdentityKind.SINGLE_ADDRESS,
                domain,
                fromEmail,
                fromName: input.fromName,
                purpose: input.purpose ?? "marketing",
              },
            });
          },
          event: {
            tenantId: run.tenantId,
            eventType: "email.provisioning.domain-verified",
            aggregateId: runId,
            payload: { runId, tenantId: run.tenantId, identityId },
          },
        });
        return;
      }

      const creds = await this.accountCreds(account.id);
      const auth = await this.sendgrid.createDomainAuth(creds, domain);
      if (account.mode === EmailAccountMode.SUBUSER && account.subuserUsername) {
        await this.sendgrid.assignDomainToSubuser(this.sendgrid.masterCreds(), auth.sendgridDomainId, account.subuserUsername);
      }
      // Identity creation rides the advance tx (run + identity + event atomic —
      // a crash between them can never leave a run pointing at a missing identity).
      const identityId = randomUUID();
      await this.advance(runId, {
        hops: [
          {
            to: S.DOMAIN_AUTH_CREATED,
            step: "domain-auth.create",
            detail: { domain, sendgridDomainId: auth.sendgridDomainId, records: auth.dns.length },
          },
        ],
        data: { identityId, sendgridDomainId: auth.sendgridDomainId },
        mutate: async (tx) => {
          await tx.emailSenderIdentity.create({
            data: {
              id: identityId,
              tenantId: run.tenantId,
              accountId: account.id,
              campaignId: run.campaignId,
              kind: input.kind as EmailIdentityKind,
              domain,
              fromEmail,
              fromName: input.fromName,
              sendgridDomainId: auth.sendgridDomainId,
              dnsRecords: auth.dns as unknown as Prisma.InputJsonValue,
              purpose: input.purpose ?? "marketing",
            },
          });
        },
        event: {
          tenantId: run.tenantId,
          eventType: "email.provisioning.domain-auth-created",
          aggregateId: runId,
          payload: {
            runId,
            tenantId: run.tenantId,
            identityId,
            sendgridDomainId: auth.sendgridDomainId,
            domain,
          },
        },
      });
    });
  }

  /** DOMAIN_AUTH_CREATED → DNS_CONFIGURED: create the CNAMEs (uprise kind) or
   *  surface them for the tenant to add (custom kind). */
  async stepConfigureDns(runId: string): Promise<void> {
    await this.guarded(runId, "dns.configure", [S.DOMAIN_AUTH_CREATED], async () => {
      const run = await this.getRunOrThrow(runId);
      const input = this.inputOf(run);
      if (!run.identityId) throw new Error("Run has no identity — domain-auth step incomplete");
      const identity = await this.prisma.emailSenderIdentity.findUnique({ where: { id: run.identityId } });
      if (!identity) throw new Error("Identity row missing");
      const records = (identity.dnsRecords ?? []) as unknown as DomainAuthDnsRecord[];

      if (input.kind === "UPRISE_SUBDOMAIN") {
        const created: number[] = [];
        for (const record of records) {
          const row = await this.dnsimple.ensureRecord({
            name: this.dnsimple.relativise(record.host),
            type: record.type || "CNAME",
            content: record.data,
          });
          created.push(row.id);
        }
        await this.advance(runId, {
          hops: [{ to: S.DNS_CONFIGURED, step: "dns.configure", detail: { automated: true, records: records.length } }],
          data: { dnsimpleRecordIds: created as unknown as Prisma.InputJsonValue },
          event: {
            tenantId: run.tenantId,
            eventType: "email.provisioning.dns-configured",
            aggregateId: runId,
            payload: { runId, tenantId: run.tenantId, identityId: identity.id, kind: input.kind },
          },
        });
        return;
      }

      // CUSTOM_DOMAIN: the tenant adds these records — the timeline shows them.
      await this.advance(runId, {
        hops: [
          {
            to: S.DNS_CONFIGURED,
            step: "dns.configure",
            detail: {
              manual: true,
              records: records.map((r) => ({ host: r.host, type: r.type, data: r.data })),
            },
          },
        ],
        event: {
          tenantId: run.tenantId,
          eventType: "email.provisioning.dns-configured",
          aggregateId: runId,
          payload: { runId, tenantId: run.tenantId, identityId: identity.id, kind: input.kind },
        },
      });
    });
  }

  /**
   * DNS_CONFIGURED|VALIDATION_FAILED → DOMAIN_VERIFIED / VALIDATION_FAILED.
   * Invalid results hop to VALIDATION_FAILED once; further invalid checks only
   * update lastError (no timeline spam). attempts>1 = the automated path's
   * propagation grace.
   */
  async stepValidateDomain(runId: string, opts?: { attempts?: number; delayMs?: number }): Promise<void> {
    await this.guarded(runId, "domain.validate", [S.DNS_CONFIGURED, S.VALIDATION_FAILED], async () => {
      const run = await this.getRunOrThrow(runId);
      if (!run.accountId || !run.identityId || !run.sendgridDomainId) {
        throw new Error("Run has no domain auth to validate");
      }
      const creds = await this.accountCreds(run.accountId);
      const attempts = Math.max(1, opts?.attempts ?? 1);
      let valid = false;
      let results: Record<string, unknown> = {};
      for (let i = 0; i < attempts; i++) {
        if (i > 0) await new Promise((r) => setTimeout(r, opts?.delayMs ?? 10_000));
        ({ valid, results } = await this.sendgrid.validateDomain(creds, run.sendgridDomainId));
        if (valid) break;
      }
      const refreshedDns = valid ? (await this.sendgrid.getDomainAuth(creds, run.sendgridDomainId)).dns : null;

      // The hop decision runs on the IN-TX status (cron poll and "validate now"
      // race legitimately); a lost race is benign, never a FAILED park.
      const reason = JSON.stringify(results).slice(0, 800);
      await this.prisma.$transaction(async (tx) => {
        await tx.$queryRaw`SELECT "id" FROM "email"."EmailProvisioningRun" WHERE "id" = ${runId} FOR UPDATE`;
        const fresh = await tx.emailProvisioningRun.findUnique({ where: { id: runId } });
        if (!fresh || (fresh.status !== S.DNS_CONFIGURED && fresh.status !== S.VALIDATION_FAILED)) {
          return; // another validator already advanced/parked the run
        }
        if (valid) {
          assertValidEmailProvisioningTransition(fresh.status, S.DOMAIN_VERIFIED);
          await tx.emailSenderIdentity.update({
            where: { id: run.identityId! },
            data: { dnsRecords: (refreshedDns ?? []) as unknown as Prisma.InputJsonValue },
          });
          await tx.emailProvisioningRun.update({
            where: { id: runId },
            data: { status: S.DOMAIN_VERIFIED, resumeStatus: null, lastError: null },
          });
          await tx.emailProvisioningStep.create({
            data: {
              runId,
              tenantId: run.tenantId,
              step: "domain.validate",
              status: EmailStepStatus.SUCCEEDED,
              detail: { valid: true } as Prisma.InputJsonValue,
            },
          });
          await this.outbox.append(tx, {
            tenantId: run.tenantId,
            eventType: "email.provisioning.domain-verified",
            aggregateId: runId,
            payload: { runId, tenantId: run.tenantId, identityId: run.identityId! },
          });
          return;
        }
        if (fresh.status === S.DNS_CONFIGURED) {
          assertValidEmailProvisioningTransition(fresh.status, S.VALIDATION_FAILED);
          await tx.emailProvisioningRun.update({
            where: { id: runId },
            data: { status: S.VALIDATION_FAILED, lastError: reason },
          });
          await tx.emailProvisioningStep.create({
            data: {
              runId,
              tenantId: run.tenantId,
              step: "domain.validate",
              status: EmailStepStatus.FAILED,
              detail: { valid: false, results } as Prisma.InputJsonValue,
            },
          });
          await this.outbox.append(tx, {
            tenantId: run.tenantId,
            eventType: "email.provisioning.validation-failed",
            aggregateId: runId,
            payload: { runId, tenantId: run.tenantId, identityId: run.identityId!, reason },
          });
          return;
        }
        // Already in VALIDATION_FAILED — stay calm, just refresh the error.
        await tx.emailProvisioningRun.update({ where: { id: runId }, data: { lastError: reason } });
      });
    });
  }

  /** DOMAIN_VERIFIED → WEBHOOKS_CONFIGURED: (sub)account event webhook + signed key. */
  async stepConfigureWebhooks(runId: string): Promise<void> {
    await this.guarded(runId, "webhooks.configure", [S.DOMAIN_VERIFIED], async () => {
      const run = await this.getRunOrThrow(runId);
      if (!run.accountId) throw new Error("Run has no account");
      const account = await this.prisma.emailAccount.findUnique({ where: { id: run.accountId } });
      if (!account) throw new Error("Email account row missing");

      if (account.webhookPublicKey) {
        await this.advance(runId, {
          hops: [
            { to: S.WEBHOOKS_CONFIGURED, step: "webhooks.configure", stepStatus: EmailStepStatus.SKIPPED, detail: { reused: true } },
          ],
          event: {
            tenantId: run.tenantId,
            eventType: "email.provisioning.webhooks-configured",
            aggregateId: runId,
            payload: { runId, tenantId: run.tenantId, accountId: account.id },
          },
        });
        return;
      }

      const creds = await this.accountCreds(account.id, { onBehalfOf: true });
      await this.sendgrid.configureEventWebhook(creds, this.emailWebhookUrl());
      const publicKey = await this.sendgrid.enableSignedWebhook(creds);
      await this.advance(runId, {
        hops: [{ to: S.WEBHOOKS_CONFIGURED, step: "webhooks.configure", detail: { url: this.emailWebhookUrl() } }],
        mutate: async (tx) => {
          await tx.emailAccount.update({
            where: { id: account.id },
            data: { webhookPublicKey: publicKey },
          });
        },
        event: {
          tenantId: run.tenantId,
          eventType: "email.provisioning.webhooks-configured",
          aggregateId: runId,
          payload: { runId, tenantId: run.tenantId, accountId: account.id },
        },
      });
    });
  }

  /** WEBHOOKS_CONFIGURED → ACTIVE: identity + account live; senders re-resolve. */
  async stepActivate(runId: string): Promise<void> {
    await this.guarded(runId, "activate", [S.WEBHOOKS_CONFIGURED], async () => {
      const run = await this.getRunOrThrow(runId);
      if (!run.accountId || !run.identityId) throw new Error("Run has no identity to activate");
      const identity = await this.prisma.emailSenderIdentity.findUnique({ where: { id: run.identityId } });
      if (!identity) throw new Error("Identity row missing");
      const accountId = run.accountId;
      await this.advance(runId, {
        hops: [{ to: S.ACTIVE, step: "activate", detail: { fromEmail: identity.fromEmail } }],
        mutate: async (tx) => {
          await tx.emailSenderIdentity.update({
            where: { id: identity.id },
            data: { status: EmailIdentityStatus.ACTIVE },
          });
          await tx.emailAccount.update({
            where: { id: accountId },
            data: { status: EmailAccountStatus.ACTIVE },
          });
        },
        event: {
          tenantId: run.tenantId,
          eventType: "email.provisioning.activated",
          aggregateId: runId,
          payload: { runId, tenantId: run.tenantId, identityId: identity.id, fromEmail: identity.fromEmail },
        },
      });
      this.senderResolver.invalidate(run.tenantId);
    });
  }

  /** Cron fallback: poll runs waiting on DNS validation. */
  async pollPendingValidations(): Promise<{ polled: number; advanced: number }> {
    const runs = await this.prisma.emailProvisioningRun.findMany({
      where: {
        status: { in: [S.DNS_CONFIGURED, S.VALIDATION_FAILED] },
        sendgridDomainId: { not: null },
      },
      take: 50,
    });
    let advanced = 0;
    for (const run of runs) {
      try {
        const before = run.status;
        await this.stepValidateDomain(run.id);
        const after = await this.prisma.emailProvisioningRun.findUnique({ where: { id: run.id } });
        if (after && after.status !== before && after.status === S.DOMAIN_VERIFIED) advanced += 1;
      } catch (err) {
        this.logger.warn("email", "Domain validation poll failed", { runId: run.id, error: String(err) });
      }
    }
    return { polled: runs.length, advanced };
  }

  /** Super-admin "check now". */
  async validateNow(runId: string) {
    await this.stepValidateDomain(runId);
    return this.getRunOrThrow(runId);
  }

  /** Revoke an identity; best-effort external cleanup, always logged on the run. */
  async revokeIdentity(identityId: string) {
    const identity = await this.prisma.emailSenderIdentity.findUnique({ where: { id: identityId } });
    if (!identity) throw new NotFoundException("Identity not found");
    if (identity.status === EmailIdentityStatus.REVOKED) return identity;

    const run = await this.prisma.emailProvisioningRun.findFirst({
      where: { identityId },
      orderBy: { createdAt: "desc" },
    });
    const cleanup: string[] = [];
    try {
      if (identity.sendgridDomainId && run?.accountId) {
        const creds = await this.accountCreds(run.accountId);
        await this.sendgrid.deleteDomainAuth(creds, identity.sendgridDomainId);
        cleanup.push("sendgrid-domain-auth");
      }
      const recordIds = (run?.dnsimpleRecordIds ?? []) as number[];
      for (const id of recordIds) {
        await this.dnsimple.deleteRecord(id);
      }
      if (recordIds.length) cleanup.push(`dnsimple-records:${recordIds.length}`);
    } catch (err) {
      this.logger.warn("email", "Identity revoke cleanup incomplete", { identityId, error: String(err) });
    }

    const updated = await this.prisma.emailSenderIdentity.update({
      where: { id: identityId },
      data: { status: EmailIdentityStatus.REVOKED },
    });
    if (run) {
      await this.prisma.emailProvisioningStep.create({
        data: {
          runId: run.id,
          tenantId: identity.tenantId,
          step: "identity.revoke",
          status: EmailStepStatus.SUCCEEDED,
          detail: { cleanup } as Prisma.InputJsonValue,
        },
      });
    }
    this.senderResolver.invalidate(identity.tenantId);
    return updated;
  }

  // ── reads ───────────────────────────────────────────────────────────
  private async tenantSlug(tenantId: string): Promise<string> {
    const tenant = await this.prisma.tenant.findUnique({ where: { id: tenantId } });
    return (tenant?.slug ?? tenantId).toLowerCase();
  }

  async listRuns(tenantId?: string) {
    return this.prisma.emailProvisioningRun.findMany({
      where: tenantId ? { tenantId } : undefined,
      orderBy: { createdAt: "desc" },
      take: 100,
    });
  }

  async getRunWithTimeline(id: string) {
    const run = await this.prisma.emailProvisioningRun.findUnique({
      where: { id },
      include: { steps: { orderBy: { createdAt: "asc" } } },
    });
    if (!run) throw new NotFoundException("Email provisioning run not found");
    return run;
  }

  async listIdentities(tenantId?: string) {
    return this.prisma.emailSenderIdentity.findMany({
      where: tenantId ? { tenantId } : undefined,
      orderBy: { createdAt: "desc" },
      take: 200,
    });
  }
}
