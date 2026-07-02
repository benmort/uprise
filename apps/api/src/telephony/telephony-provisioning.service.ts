import { randomUUID } from "crypto";
import { Injectable, NotFoundException } from "@nestjs/common";
import { ConfigService } from "@nestjs/config";
import { put } from "@vercel/blob";
import {
  Prisma,
  TelephonyAccountMode,
  TelephonyAccountStatus,
  TelephonyNumberStatus,
  TelephonyProvisioningStatus,
  TelephonyStepStatus,
} from "@uprise/db";
import type { DomainEventMap } from "@uprise/events";
import { PrismaService } from "../prisma/prisma.service";
import { OutboxService, type AppendInput } from "../common/outbox/outbox.service";
import { DomainLogger } from "../common/logging/domain-logger.service";
import { ApiHttpException } from "../common/http/api-response";
import { CredentialCryptoService } from "../integrations/credential-crypto.service";
import { TelephonySenderResolver } from "./telephony-sender.resolver";
import { assertValidProvisioningTransition } from "./telephony-provisioning-state.machine";
import {
  TwilioProvisioningClient,
  type ComplianceInput,
  type TwilioCreds,
} from "./twilio-provisioning.client";

const S = TelephonyProvisioningStatus;

type RunDocument = {
  blobUrl: string;
  fileName: string;
  contentType: string;
  type: string;
  supportingDocumentSid?: string;
};

/** complianceInput JSON = ComplianceInput + service-owned reuse bookkeeping. */
type StoredComplianceInput = ComplianceInput & {
  reuse?: { bundleSid: string; addressSid: string; sourceNumberId: string };
};

export type StartRunInput = {
  tenantId: string;
  campaignId?: string | null;
  mode: "SUBACCOUNT" | "BYO";
  byoAccountSid?: string;
  byoAuthToken?: string;
  friendlyName?: string;
  complianceInput: ComplianceInput;
  requestedById?: string | null;
};

/** Entry event that drives each state's step — re-emitted on retry. */
const ENTRY_EVENT: Partial<Record<TelephonyProvisioningStatus, keyof DomainEventMap>> = {
  [S.REQUESTED]: "telephony.provisioning.requested",
  [S.SUBACCOUNT_CREATED]: "telephony.provisioning.subaccount-created",
  [S.COMPLIANCE_DRAFT]: "telephony.provisioning.compliance-drafted",
  [S.COMPLIANCE_SUBMITTED]: "telephony.provisioning.compliance-submitted",
  [S.COMPLIANCE_APPROVED]: "telephony.provisioning.compliance-approved",
  [S.COMPLIANCE_REJECTED]: "telephony.provisioning.compliance-rejected",
  [S.NUMBER_PURCHASED]: "telephony.provisioning.number-purchased",
  [S.WEBHOOKS_CONFIGURED]: "telephony.provisioning.webhooks-configured",
};

/**
 * Drives a provisioning run through the FSM. Every step follows the outbox
 * canon: the external Twilio call happens FIRST, then one `$transaction`
 * reloads the run FOR UPDATE, asserts the FSM hop, updates the run, inserts
 * the append-only timeline step, and appends the next domain event — which the
 * worker's reaction chain picks up to run the following step. A failed step
 * parks the run in FAILED with `resumeStatus`; retry re-enters exactly there
 * (the reaction registry swallows errors, so recovery is explicit by design).
 */
@Injectable()
export class TelephonyProvisioningService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly config: ConfigService,
    private readonly crypto: CredentialCryptoService,
    private readonly twilio: TwilioProvisioningClient,
    private readonly outbox: OutboxService,
    private readonly logger: DomainLogger,
    private readonly senderResolver: TelephonySenderResolver,
  ) {}

  // ── URLs ────────────────────────────────────────────────────────────
  private apiBaseUrl(): string {
    return this.config.get<string>("API_BASE_URL", "").trim().replace(/\/+$/, "");
  }

  private inboundHookUrl(): string {
    return `${this.apiBaseUrl()}/api/v1/inbound-text-message-hook`;
  }

  private bundleCallbackUrl(): string {
    return `${this.apiBaseUrl()}/api/v1/telephony/bundle-status-callback`;
  }

  // ── plumbing ────────────────────────────────────────────────────────
  private async getRunOrThrow(id: string) {
    const run = await this.prisma.telephonyProvisioningRun.findUnique({ where: { id } });
    if (!run) throw new NotFoundException("Provisioning run not found");
    return run;
  }

  private async accountCreds(accountId: string): Promise<TwilioCreds & { id: string }> {
    const account = await this.prisma.telephonyAccount.findUnique({ where: { id: accountId } });
    if (!account) throw new NotFoundException("Telephony account not found");
    return {
      id: account.id,
      accountSid: account.accountSid,
      authToken: this.crypto.decrypt(account.encryptedAuthToken),
    };
  }

  private complianceInputOf(run: { complianceInput: Prisma.JsonValue }): StoredComplianceInput {
    return (run.complianceInput ?? {}) as StoredComplianceInput;
  }

  private documentsOf(run: { documents: Prisma.JsonValue | null }): RunDocument[] {
    return Array.isArray(run.documents) ? (run.documents as RunDocument[]) : [];
  }

  /**
   * One guarded FSM hop (or several for reuse-skips), atomic with its timeline
   * step(s) and the next event. `hops` are applied in order — each asserted.
   */
  private async advance(
    runId: string,
    opts: {
      hops: Array<{ to: TelephonyProvisioningStatus; step: string; stepStatus?: TelephonyStepStatus; detail?: Record<string, unknown> }>;
      data?: Prisma.TelephonyProvisioningRunUncheckedUpdateInput;
      event?: AppendInput | null;
      /** Related-row writes that must commit atomically with the hop (e.g. number/account status). */
      mutate?: (tx: Prisma.TransactionClient) => Promise<void>;
    },
  ) {
    return this.prisma.$transaction(async (tx) => {
      await tx.$queryRaw`SELECT "id" FROM "telephony"."TelephonyProvisioningRun" WHERE "id" = ${runId} FOR UPDATE`;
      const run = await tx.telephonyProvisioningRun.findUnique({ where: { id: runId } });
      if (!run) throw new NotFoundException("Provisioning run not found");
      if (opts.mutate) await opts.mutate(tx);

      let from = run.status;
      for (const hop of opts.hops) {
        assertValidProvisioningTransition(from, hop.to);
        from = hop.to;
      }
      const finalStatus = from;

      const updated = await tx.telephonyProvisioningRun.update({
        where: { id: runId },
        data: { ...opts.data, status: finalStatus, resumeStatus: null, lastError: null },
      });
      for (const hop of opts.hops) {
        await tx.telephonyProvisioningStep.create({
          data: {
            runId,
            tenantId: run.tenantId,
            step: hop.step,
            status: hop.stepStatus ?? TelephonyStepStatus.SUCCEEDED,
            detail: (hop.detail ?? {}) as Prisma.InputJsonValue,
          },
        });
      }
      if (opts.event) await this.outbox.append(tx, opts.event);
      return updated;
    });
  }

  /** Park the run in FAILED, recording where retry should re-enter. */
  private async failRun(runId: string, step: string, error: unknown): Promise<void> {
    const message = String(error instanceof Error ? error.message : error).slice(0, 2000);
    await this.prisma.$transaction(async (tx) => {
      await tx.$queryRaw`SELECT "id" FROM "telephony"."TelephonyProvisioningRun" WHERE "id" = ${runId} FOR UPDATE`;
      const run = await tx.telephonyProvisioningRun.findUnique({ where: { id: runId } });
      if (!run || run.status === S.FAILED || run.status === S.ACTIVE) return;
      assertValidProvisioningTransition(run.status, S.FAILED);
      await tx.telephonyProvisioningRun.update({
        where: { id: runId },
        data: { status: S.FAILED, resumeStatus: run.status, lastError: message },
      });
      await tx.telephonyProvisioningStep.create({
        data: { runId, tenantId: run.tenantId, step, status: TelephonyStepStatus.FAILED, error: message },
      });
      await this.outbox.append(tx, {
        tenantId: run.tenantId,
        eventType: "telephony.provisioning.failed",
        aggregateId: runId,
        payload: { runId, tenantId: run.tenantId, step, error: message },
      });
    });
    this.logger.error("telephony", "Provisioning step failed", undefined, { runId, step, error: message });
  }

  /** Run a step's external work; park the run in FAILED if it throws. */
  private async guarded(runId: string, step: string, expect: TelephonyProvisioningStatus[], work: () => Promise<void>): Promise<void> {
    const run = await this.prisma.telephonyProvisioningRun.findUnique({ where: { id: runId } });
    if (!run) return;
    if (!expect.includes(run.status)) {
      // Stale/duplicate event (e.g. replay after retry) — the FSM already moved on.
      this.logger.warn("telephony", "Skipping stale provisioning event", { runId, step, status: run.status });
      return;
    }
    try {
      await work();
    } catch (err) {
      await this.failRun(runId, step, err);
    }
  }

  // ── lifecycle ───────────────────────────────────────────────────────
  async startRun(input: StartRunInput) {
    const friendlyName = input.friendlyName?.trim() || `uprise ${input.tenantId}`;
    return this.prisma.$transaction(async (tx) => {
      let accountId: string | null = null;
      if (input.mode === "BYO") {
        if (!input.byoAccountSid || !input.byoAuthToken) {
          throw new ApiHttpException("BYO_CREDENTIALS_REQUIRED", "BYO mode needs an account SID and auth token");
        }
        const account = await tx.telephonyAccount.upsert({
          where: { accountSid: input.byoAccountSid },
          create: {
            tenantId: input.tenantId,
            mode: TelephonyAccountMode.BYO,
            accountSid: input.byoAccountSid,
            encryptedAuthToken: this.crypto.encrypt(input.byoAuthToken),
            friendlyName,
          },
          update: { encryptedAuthToken: this.crypto.encrypt(input.byoAuthToken) },
        });
        accountId = account.id;
      }
      const run = await tx.telephonyProvisioningRun.create({
        data: {
          tenantId: input.tenantId,
          campaignId: input.campaignId ?? null,
          accountId,
          status: S.REQUESTED,
          complianceInput: input.complianceInput as unknown as Prisma.InputJsonValue,
          requestedById: input.requestedById ?? null,
        },
      });
      await tx.telephonyProvisioningStep.create({
        data: {
          runId: run.id,
          tenantId: input.tenantId,
          step: "run.requested",
          status: TelephonyStepStatus.SUCCEEDED,
          detail: { mode: input.mode, campaignId: input.campaignId ?? null } as Prisma.InputJsonValue,
        },
      });
      await this.outbox.append(tx, {
        tenantId: input.tenantId,
        eventType: "telephony.provisioning.requested",
        aggregateId: run.id,
        payload: { runId: run.id, tenantId: input.tenantId, campaignId: input.campaignId ?? null, mode: input.mode },
      });
      return run;
    });
  }

  /** Store an uploaded compliance document in blob storage, on the run. */
  async addDocument(
    runId: string,
    file: { buffer?: Buffer; originalname?: string; mimetype?: string },
    documentType: string,
  ) {
    const run = await this.getRunOrThrow(runId);
    if (!file?.buffer) throw new ApiHttpException("NO_FILE", "No document provided");
    const token = process.env.BLOB_READ_WRITE_TOKEN;
    if (!token && !process.env.BLOB_STORE_ID) {
      throw new ApiHttpException("DOCUMENT_STORAGE_NOT_CONFIGURED", "Document storage is not configured");
    }
    const ext = (file.originalname?.split(".").pop() || "pdf").toLowerCase().replace(/[^a-z0-9]/g, "");
    const key = `telephony-compliance/${runId}/${Date.now()}-${Math.random().toString(36).slice(2)}.${ext || "pdf"}`;
    const { url } = await put(key, file.buffer, {
      access: "public",
      contentType: file.mimetype,
      ...(token ? { token } : {}),
    });
    const documents: RunDocument[] = [
      ...this.documentsOf(run),
      {
        blobUrl: url,
        fileName: file.originalname ?? key,
        contentType: file.mimetype ?? "application/octet-stream",
        type: documentType,
      },
    ];
    return this.prisma.telephonyProvisioningRun.update({
      where: { id: runId },
      data: { documents: documents as unknown as Prisma.InputJsonValue },
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
      await tx.$queryRaw`SELECT "id" FROM "telephony"."TelephonyProvisioningRun" WHERE "id" = ${runId} FOR UPDATE`;
      const fresh = await tx.telephonyProvisioningRun.findUnique({ where: { id: runId } });
      if (!fresh || fresh.status !== S.FAILED) {
        throw new ApiHttpException("NOT_RETRYABLE", "Run is no longer FAILED", 409);
      }
      assertValidProvisioningTransition(S.FAILED, resume);
      const updated = await tx.telephonyProvisioningRun.update({
        where: { id: runId },
        data: { status: resume, resumeStatus: null, lastError: null },
      });
      await tx.telephonyProvisioningStep.create({
        data: {
          runId,
          tenantId: run.tenantId,
          step: "run.retry",
          status: TelephonyStepStatus.SUCCEEDED,
          detail: { resumedAt: resume } as Prisma.InputJsonValue,
        },
      });
      await this.outbox.append(tx, {
        tenantId: run.tenantId,
        eventType: "telephony.provisioning.retry-requested",
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

  /** Rebuild the entry-event payload for a resume point from the run's rows. */
  private async entryPayload(
    run: { id: string; tenantId: string; campaignId: string | null; accountId: string | null; bundleSid: string | null; addressSid: string | null; endUserSid: string | null; phoneNumberId: string | null },
    resume: TelephonyProvisioningStatus,
  ): Promise<Record<string, unknown> | null> {
    const base = { runId: run.id, tenantId: run.tenantId };
    switch (resume) {
      case S.REQUESTED:
        return { ...base, campaignId: run.campaignId, mode: run.accountId ? "BYO" : "SUBACCOUNT" };
      case S.SUBACCOUNT_CREATED: {
        if (!run.accountId) return null;
        const account = await this.prisma.telephonyAccount.findUnique({ where: { id: run.accountId } });
        return account ? { ...base, accountId: account.id, accountSid: account.accountSid } : null;
      }
      case S.COMPLIANCE_DRAFT:
        return { ...base, bundleSid: run.bundleSid, addressSid: run.addressSid, endUserSid: run.endUserSid };
      case S.COMPLIANCE_SUBMITTED:
      case S.COMPLIANCE_APPROVED:
        return { ...base, bundleSid: run.bundleSid };
      case S.COMPLIANCE_REJECTED:
        return { ...base, bundleSid: run.bundleSid, reason: null };
      case S.NUMBER_PURCHASED:
      case S.WEBHOOKS_CONFIGURED: {
        if (!run.phoneNumberId) return null;
        const number = await this.prisma.telephonyPhoneNumber.findUnique({ where: { id: run.phoneNumberId } });
        return number
          ? { ...base, phoneNumberId: number.id, phoneNumberE164: number.phoneNumberE164 }
          : null;
      }
      default:
        return null;
    }
  }

  // ── steps (called from reactions) ───────────────────────────────────
  /** REQUESTED → SUBACCOUNT_CREATED: create a subaccount, or reuse BYO/tenant account. */
  async stepCreateSubaccount(runId: string): Promise<void> {
    await this.guarded(runId, "subaccount.create", [S.REQUESTED], async () => {
      const run = await this.getRunOrThrow(runId);

      // BYO run, or a tenant that already has an ACTIVE account (campaign runs).
      const existing = run.accountId
        ? await this.prisma.telephonyAccount.findUnique({ where: { id: run.accountId } })
        : await this.prisma.telephonyAccount.findFirst({
            where: { tenantId: run.tenantId, status: TelephonyAccountStatus.ACTIVE },
          });
      if (existing) {
        await this.advance(runId, {
          hops: [
            {
              to: S.SUBACCOUNT_CREATED,
              step: "subaccount.create",
              stepStatus: run.accountId ? TelephonyStepStatus.SUCCEEDED : TelephonyStepStatus.SKIPPED,
              detail: { accountSid: existing.accountSid, reused: !run.accountId },
            },
          ],
          data: { accountId: existing.id },
          event: {
            tenantId: run.tenantId,
            eventType: "telephony.provisioning.subaccount-created",
            aggregateId: runId,
            payload: { runId, tenantId: run.tenantId, accountId: existing.id, accountSid: existing.accountSid },
          },
        });
        return;
      }

      const tenant = await this.prisma.tenant.findUnique({ where: { id: run.tenantId } });
      const created = await this.twilio.createSubaccount(`uprise · ${tenant?.name ?? run.tenantId}`);
      const account = await this.prisma.telephonyAccount.create({
        data: {
          tenantId: run.tenantId,
          mode: TelephonyAccountMode.SUBACCOUNT,
          accountSid: created.accountSid,
          encryptedAuthToken: this.crypto.encrypt(created.authToken),
          friendlyName: tenant?.name ?? run.tenantId,
        },
      });
      await this.advance(runId, {
        hops: [{ to: S.SUBACCOUNT_CREATED, step: "subaccount.create", detail: { accountSid: account.accountSid } }],
        data: { accountId: account.id },
        event: {
          tenantId: run.tenantId,
          eventType: "telephony.provisioning.subaccount-created",
          aggregateId: runId,
          payload: { runId, tenantId: run.tenantId, accountId: account.id, accountSid: account.accountSid },
        },
      });
    });
  }

  /**
   * SUBACCOUNT_CREATED (or COMPLIANCE_REJECTED, on resubmit) → COMPLIANCE_DRAFT:
   * Address + EndUser + SupportingDocuments + Bundle + ItemAssignments. When the
   * tenant already holds an approved bundle (a prior number), the run walks
   * DRAFT → SUBMITTED → APPROVED in one go with SKIPPED steps.
   */
  async stepDraftCompliance(runId: string): Promise<void> {
    await this.guarded(runId, "compliance.draft", [S.SUBACCOUNT_CREATED, S.COMPLIANCE_REJECTED], async () => {
      const run = await this.getRunOrThrow(runId);
      if (!run.accountId) throw new Error("Run has no account — subaccount step incomplete");
      const creds = await this.accountCreds(run.accountId);
      const input = this.complianceInputOf(run);

      // Reuse: any prior number of this tenant that carries an approved bundle.
      const prior = await this.prisma.telephonyPhoneNumber.findFirst({
        where: { tenantId: run.tenantId, accountId: run.accountId, bundleSid: { not: null }, addressSid: { not: null } },
        orderBy: { createdAt: "desc" },
      });
      if (prior?.bundleSid && prior.addressSid && run.status === S.SUBACCOUNT_CREATED) {
        const stored: StoredComplianceInput = {
          ...input,
          reuse: { bundleSid: prior.bundleSid, addressSid: prior.addressSid, sourceNumberId: prior.id },
        };
        await this.advance(runId, {
          hops: [
            { to: S.COMPLIANCE_DRAFT, step: "compliance.draft", stepStatus: TelephonyStepStatus.SKIPPED, detail: { reusedBundleSid: prior.bundleSid } },
            { to: S.COMPLIANCE_SUBMITTED, step: "compliance.submit", stepStatus: TelephonyStepStatus.SKIPPED },
            { to: S.COMPLIANCE_APPROVED, step: "compliance.review", stepStatus: TelephonyStepStatus.SKIPPED, detail: { reused: true } },
          ],
          data: { addressSid: prior.addressSid, complianceInput: stored as unknown as Prisma.InputJsonValue },
          event: {
            tenantId: run.tenantId,
            eventType: "telephony.provisioning.compliance-approved",
            aggregateId: runId,
            payload: { runId, tenantId: run.tenantId, bundleSid: prior.bundleSid },
          },
        });
        return;
      }

      const addressSid = run.addressSid ?? (await this.twilio.createAddress(creds, input));
      const endUserSid = run.endUserSid ?? (await this.twilio.createEndUser(creds, input));

      // Upload each stored document to Twilio (idempotent — skip already-uploaded).
      const documents = this.documentsOf(run);
      for (const doc of documents) {
        if (doc.supportingDocumentSid) continue;
        const res = await fetch(doc.blobUrl);
        if (!res.ok) throw new Error(`Could not fetch compliance document ${doc.fileName} (${res.status})`);
        const content = Buffer.from(await res.arrayBuffer());
        doc.supportingDocumentSid = await this.twilio.createSupportingDocument(creds, {
          fileName: doc.fileName,
          contentType: doc.contentType,
          type: doc.type,
          content,
        });
      }

      const bundleSid = await this.twilio.createBundle(creds, `uprise ${run.tenantId}`, input.email, this.bundleCallbackUrl());
      await this.twilio.assignBundleItem(creds, bundleSid, endUserSid);
      await this.twilio.assignBundleItem(creds, bundleSid, addressSid);
      for (const doc of documents) {
        if (doc.supportingDocumentSid) await this.twilio.assignBundleItem(creds, bundleSid, doc.supportingDocumentSid);
      }

      await this.advance(runId, {
        hops: [{ to: S.COMPLIANCE_DRAFT, step: "compliance.draft", detail: { bundleSid, addressSid, endUserSid, documents: documents.length } }],
        data: {
          bundleSid,
          addressSid,
          endUserSid,
          documents: documents as unknown as Prisma.InputJsonValue,
        },
        event: {
          tenantId: run.tenantId,
          eventType: "telephony.provisioning.compliance-drafted",
          aggregateId: runId,
          payload: { runId, tenantId: run.tenantId, bundleSid, addressSid, endUserSid },
        },
      });
    });
  }

  /** COMPLIANCE_DRAFT → COMPLIANCE_SUBMITTED: submit the bundle for review. */
  async stepSubmitBundle(runId: string): Promise<void> {
    await this.guarded(runId, "compliance.submit", [S.COMPLIANCE_DRAFT], async () => {
      const run = await this.getRunOrThrow(runId);
      if (!run.accountId || !run.bundleSid) throw new Error("Run has no bundle to submit");
      const creds = await this.accountCreds(run.accountId);
      await this.twilio.submitBundle(creds, run.bundleSid);
      await this.advance(runId, {
        hops: [{ to: S.COMPLIANCE_SUBMITTED, step: "compliance.submit", detail: { bundleSid: run.bundleSid } }],
        event: {
          tenantId: run.tenantId,
          eventType: "telephony.provisioning.compliance-submitted",
          aggregateId: runId,
          payload: { runId, tenantId: run.tenantId, bundleSid: run.bundleSid },
        },
      });
    });
  }

  /**
   * Bundle verdict (webhook or poll): COMPLIANCE_SUBMITTED → APPROVED/REJECTED.
   * Caller claim-guards for idempotency (WebhookEventService).
   */
  async applyBundleStatus(bundleSid: string, twilioStatus: string, failureReason?: string | null): Promise<void> {
    const run = await this.prisma.telephonyProvisioningRun.findUnique({ where: { bundleSid } });
    if (!run) {
      this.logger.warn("telephony", "Bundle status for unknown run", { bundleSid, twilioStatus });
      return;
    }
    if (run.status !== S.COMPLIANCE_SUBMITTED) return; // stale / duplicate
    if (twilioStatus === "twilio-approved") {
      await this.advance(run.id, {
        hops: [{ to: S.COMPLIANCE_APPROVED, step: "compliance.review", detail: { bundleSid } }],
        event: {
          tenantId: run.tenantId,
          eventType: "telephony.provisioning.compliance-approved",
          aggregateId: run.id,
          payload: { runId: run.id, tenantId: run.tenantId, bundleSid },
        },
      });
    } else if (twilioStatus === "twilio-rejected") {
      await this.advance(run.id, {
        hops: [
          {
            to: S.COMPLIANCE_REJECTED,
            step: "compliance.review",
            stepStatus: TelephonyStepStatus.FAILED,
            detail: { bundleSid, reason: failureReason ?? null },
          },
        ],
        event: {
          tenantId: run.tenantId,
          eventType: "telephony.provisioning.compliance-rejected",
          aggregateId: run.id,
          payload: { runId: run.id, tenantId: run.tenantId, bundleSid, reason: failureReason ?? null },
        },
      });
    }
  }

  /** Cron fallback: poll bundles parked in COMPLIANCE_SUBMITTED (missed webhooks). */
  async pollSubmittedBundles(): Promise<{ polled: number; advanced: number }> {
    const runs = await this.prisma.telephonyProvisioningRun.findMany({
      where: { status: S.COMPLIANCE_SUBMITTED, bundleSid: { not: null } },
      take: 50,
    });
    let advanced = 0;
    for (const run of runs) {
      try {
        if (!run.accountId || !run.bundleSid) continue;
        const creds = await this.accountCreds(run.accountId);
        const { status, failureReason } = await this.twilio.fetchBundleStatus(creds, run.bundleSid);
        if (status === "twilio-approved" || status === "twilio-rejected") {
          await this.applyBundleStatus(run.bundleSid, status, failureReason);
          advanced += 1;
        }
      } catch (err) {
        this.logger.warn("telephony", "Bundle poll failed", { runId: run.id, error: String(err) });
      }
    }
    return { polled: runs.length, advanced };
  }

  /** COMPLIANCE_REJECTED: update details and re-run the draft step (new bundle). */
  async resubmit(runId: string, complianceInput?: ComplianceInput) {
    const run = await this.getRunOrThrow(runId);
    if (run.status !== S.COMPLIANCE_REJECTED) {
      throw new ApiHttpException("NOT_REJECTED", "Only a COMPLIANCE_REJECTED run can be resubmitted", 409);
    }
    if (complianceInput) {
      await this.prisma.telephonyProvisioningRun.update({
        where: { id: runId },
        // A rejected bundle is abandoned — the redraft creates a fresh one.
        data: { complianceInput: complianceInput as unknown as Prisma.InputJsonValue, bundleSid: null },
      });
    } else {
      await this.prisma.telephonyProvisioningRun.update({ where: { id: runId }, data: { bundleSid: null } });
    }
    await this.stepDraftCompliance(runId);
    return this.getRunOrThrow(runId);
  }

  /** COMPLIANCE_APPROVED → NUMBER_PURCHASED: buy an AU mobile into the account. */
  async stepPurchaseNumber(runId: string): Promise<void> {
    await this.guarded(runId, "number.purchase", [S.COMPLIANCE_APPROVED], async () => {
      const run = await this.getRunOrThrow(runId);
      if (!run.accountId) throw new Error("Run has no account");
      const creds = await this.accountCreds(run.accountId);
      const input = this.complianceInputOf(run);
      const bundleSid = run.bundleSid ?? input.reuse?.bundleSid;
      const addressSid = run.addressSid ?? input.reuse?.addressSid;
      if (!bundleSid || !addressSid) throw new Error("Run has no approved bundle/address to purchase with");

      const candidate = await this.twilio.findAvailableAuMobile(creds);
      const purchased = await this.twilio.purchaseNumber(creds, {
        phoneNumber: candidate,
        bundleSid,
        addressSid,
        smsUrl: this.inboundHookUrl(),
      });

      // Number row rides the advance tx (run + number + event atomic — a crash
      // between them can never leave a run pointing at a missing number row).
      const numberId = randomUUID();
      const accountId = run.accountId;
      await this.advance(runId, {
        hops: [{ to: S.NUMBER_PURCHASED, step: "number.purchase", detail: { phoneNumberE164: purchased.phoneNumberE164 } }],
        data: { phoneNumberId: numberId },
        mutate: async (tx) => {
          await tx.telephonyPhoneNumber.create({
            data: {
              id: numberId,
              tenantId: run.tenantId,
              accountId,
              campaignId: run.campaignId,
              phoneNumberE164: purchased.phoneNumberE164,
              phoneNumberSid: purchased.phoneNumberSid,
              bundleSid,
              addressSid,
              status: TelephonyNumberStatus.PENDING,
            },
          });
        },
        event: {
          tenantId: run.tenantId,
          eventType: "telephony.provisioning.number-purchased",
          aggregateId: runId,
          payload: { runId, tenantId: run.tenantId, phoneNumberId: numberId, phoneNumberE164: purchased.phoneNumberE164 },
        },
      });
    });
  }

  /** NUMBER_PURCHASED → WEBHOOKS_CONFIGURED: (re)assert the inbound SmsUrl. */
  async stepConfigureWebhooks(runId: string): Promise<void> {
    await this.guarded(runId, "webhooks.configure", [S.NUMBER_PURCHASED], async () => {
      const run = await this.getRunOrThrow(runId);
      if (!run.accountId || !run.phoneNumberId) throw new Error("Run has no purchased number");
      const number = await this.prisma.telephonyPhoneNumber.findUnique({ where: { id: run.phoneNumberId } });
      if (!number) throw new Error("Purchased number row missing");
      const creds = await this.accountCreds(run.accountId);
      await this.twilio.configureNumberWebhook(creds, number.phoneNumberSid, this.inboundHookUrl());
      await this.advance(runId, {
        hops: [{ to: S.WEBHOOKS_CONFIGURED, step: "webhooks.configure", detail: { smsUrl: this.inboundHookUrl() } }],
        event: {
          tenantId: run.tenantId,
          eventType: "telephony.provisioning.webhooks-configured",
          aggregateId: runId,
          payload: { runId, tenantId: run.tenantId, phoneNumberId: number.id },
        },
      });
    });
  }

  /** WEBHOOKS_CONFIGURED → ACTIVE: number + account live; senders re-resolve.
   *  The number/account flips ride the advance transaction — a run can never
   *  read ACTIVE while its number is still PENDING (or vice versa). */
  async stepActivate(runId: string): Promise<void> {
    await this.guarded(runId, "activate", [S.WEBHOOKS_CONFIGURED], async () => {
      const run = await this.getRunOrThrow(runId);
      if (!run.accountId || !run.phoneNumberId) throw new Error("Run has no purchased number");
      const number = await this.prisma.telephonyPhoneNumber.findUnique({ where: { id: run.phoneNumberId } });
      if (!number) throw new Error("Purchased number row missing");
      const accountId = run.accountId;
      await this.advance(runId, {
        hops: [{ to: S.ACTIVE, step: "activate", detail: { phoneNumberE164: number.phoneNumberE164 } }],
        mutate: async (tx) => {
          await tx.telephonyPhoneNumber.update({
            where: { id: number.id },
            data: { status: TelephonyNumberStatus.ACTIVE },
          });
          await tx.telephonyAccount.update({
            where: { id: accountId },
            data: { status: TelephonyAccountStatus.ACTIVE },
          });
        },
        event: {
          tenantId: run.tenantId,
          eventType: "telephony.provisioning.activated",
          aggregateId: runId,
          payload: { runId, tenantId: run.tenantId, phoneNumberE164: number.phoneNumberE164 },
        },
      });
      this.senderResolver.invalidate(run.tenantId);
    });
  }

  // ── reads + number management ───────────────────────────────────────
  async listRuns(tenantId?: string) {
    return this.prisma.telephonyProvisioningRun.findMany({
      where: tenantId ? { tenantId } : undefined,
      orderBy: { createdAt: "desc" },
      take: 100,
    });
  }

  async getRunWithTimeline(id: string) {
    const run = await this.prisma.telephonyProvisioningRun.findUnique({
      where: { id },
      include: { steps: { orderBy: { createdAt: "asc" } } },
    });
    if (!run) throw new NotFoundException("Provisioning run not found");
    return run;
  }

  async listNumbers(tenantId?: string) {
    return this.prisma.telephonyPhoneNumber.findMany({
      where: tenantId ? { tenantId } : undefined,
      orderBy: { createdAt: "desc" },
      take: 200,
    });
  }

  async releaseNumber(numberId: string) {
    const number = await this.prisma.telephonyPhoneNumber.findUnique({ where: { id: numberId } });
    if (!number) throw new NotFoundException("Number not found");
    if (number.status === TelephonyNumberStatus.RELEASED) return number;
    const creds = await this.accountCreds(number.accountId);
    await this.twilio.releaseNumber(creds, number.phoneNumberSid);
    const updated = await this.prisma.telephonyPhoneNumber.update({
      where: { id: numberId },
      data: { status: TelephonyNumberStatus.RELEASED },
    });
    this.senderResolver.invalidate(number.tenantId);
    return updated;
  }
}
