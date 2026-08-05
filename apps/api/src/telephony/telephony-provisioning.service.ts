import { randomUUID } from "crypto";
import { ForbiddenException, Injectable, NotFoundException } from "@nestjs/common";
import { ConfigService } from "@nestjs/config";
import { ImageUploadService } from "../common/storage/image-upload.service";
import {
  Prisma,
  TelephonyAccountMode,
  TelephonyAccountStatus,
  TelephonyNumberStatus,
  TelephonyProvisioningStatus,
  TelephonyStepStatus,
} from "@uprise/db";
import type { DomainEventMap } from "@uprise/events";
import { evaluateOrgSetup } from "@uprise/contracts";
import { PrismaService } from "../prisma/prisma.service";
import { OutboxService, type AppendInput } from "../common/outbox/outbox.service";
import { DomainLogger } from "../common/logging/domain-logger.service";
import { ApiHttpException } from "../common/http/api-response";
import { CredentialCryptoService } from "../integrations/credential-crypto.service";
import { FeatureFlagsService } from "../common/flags/feature-flags.service";
import { TelephonySenderResolver } from "./telephony-sender.resolver";
import { assertValidProvisioningTransition } from "./telephony-provisioning-state.machine";
import {
  TwilioProvisioningClient,
  type BundleFacts,
  type ComplianceInput,
  type NumberWebhooks,
  type OwnedNumber,
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

/**
 * A bundle/address pair this run may purchase against without drafting anything, plus where
 * it came from. Two provenances:
 *  - "prior-number": derived from an earlier `TelephonyPhoneNumber` of this tenant;
 *  - "operator-supplied": handed in at `startRun` by a tenant whose OWN Twilio account has
 *    already been through the AU regulatory journey (BYO only).
 * `numberType` is the regulation class the pair may be used for – load-bearing, because a
 * bundle approved for mobile cannot purchase a local number and vice versa. For
 * "prior-number" it is the class the reuse query matched on; for "operator-supplied" it is
 * the class Twilio itself reported for the bundle, unless `classVerified` says otherwise.
 */
type StoredReuse = {
  bundleSid: string;
  addressSid: string;
  /** Only set for "prior-number" – the row the pair was copied from. */
  sourceNumberId?: string;
  source?: "prior-number" | "operator-supplied";
  numberType?: "mobile" | "local";
  /**
   * Was `numberType` read from TWILIO (the bundle's own regulation), or is it only what the
   * run asked for? False/absent means unverified – Twilio could not tell us the class – and
   * the purchase is the first place a mismatch would show. Recorded rather than assumed so
   * the stored provenance never overstates what is actually known.
   */
  classVerified?: boolean;
};

/** complianceInput JSON = ComplianceInput + service-owned reuse bookkeeping. */
type StoredComplianceInput = ComplianceInput & {
  reuse?: StoredReuse;
};

/**
 * Twilio resource SIDs are prefixed and fixed-length (2-letter prefix + 32 hex). Validated
 * here rather than passed through, because a malformed SID is only discovered at the
 * purchase call – after the run has already skipped its compliance review.
 */
const BUNDLE_SID_RE = /^BU[0-9a-fA-F]{32}$/;
const ADDRESS_SID_RE = /^AD[0-9a-fA-F]{32}$/;
/** Twilio home regions are two letters + a digit ("au1", "us1", "ie1"). */
const TWILIO_REGION_RE = /^[a-z]{2}[0-9]$/;
/** Twilio edges are lowercase place names ("sydney", "sao-paulo", "ashburn"). */
const TWILIO_EDGE_RE = /^[a-z][a-z-]{2,19}$/;

export type StartRunInput = {
  tenantId: string;
  campaignId?: string | null;
  mode: "SUBACCOUNT" | "BYO";
  byoAccountSid?: string;
  byoAuthToken?: string;
  /**
   * An ALREADY-APPROVED regulatory bundle and its registered address on the BYO account
   * (`BU…` / `AD…`). Supplying them takes the run straight to purchase: no bundle drafted,
   * no documents uploaded, no second trip through Twilio's human review. Both or neither –
   * a bundle without its address cannot buy a number.
   */
  byoBundleSid?: string;
  byoAddressSid?: string;
  /** Twilio home region / edge of the BYO account, e.g. "au1" / "sydney". */
  byoRegion?: string;
  byoEdge?: string;
  friendlyName?: string;
  /** "mobile" (SMS, historical default) or "local" (voice caller-id capable). */
  numberType?: "mobile" | "local";
  /**
   * Chain a run for the complementary class when this one completes (default true) –
   * an organisation needs a mobile to text and a local to call. Pass false to request a
   * single class deliberately: an existing tenant that only wants SMS, or a test run.
   */
  chainComplementary?: boolean;
  complianceInput: ComplianceInput;
  requestedById?: string | null;
};

/**
 * Adopting a number the tenant's BYO account ALREADY owns. No purchase, no bundle, no
 * regulatory review and no provisioning run – there is nothing to provision, so forcing this
 * through the FSM would invent states (COMPLIANCE_APPROVED, NUMBER_PURCHASED) that never
 * happened.
 */
export type AdoptNumberInput = {
  /** The tenant's `TelephonyAccount` the number will be registered under. */
  accountId: string;
  phoneNumberSid: string;
  nickname?: string | null;
  /**
   * Explicit opt-in to TAKE OVER a hook that is already configured. Absent/false means the
   * existing configuration wins and is reported back untouched – see `claimAdoptionHook`.
   */
  claimSmsHook?: boolean;
  claimVoiceHook?: boolean;
  /** Set for non-super-admin callers: the tenant the request is bound to. */
  scopeTenantId?: string;
};

/**
 * The regulation class of an adopted number, and what Twilio says it can do.
 *
 * There is no "which signal won" field because there is no contest: the AU numbering plan
 * (the E.164 prefix) is the ONLY thing that may set the class – see `classifyOwnedNumber`.
 * The capabilities travel with it so a caller can see what was checked.
 */
export type AdoptionClassification = {
  numberType: "mobile" | "local";
  capabilities: { voice: boolean; sms: boolean; mms: boolean };
};

/** Why uprise will not adopt a number at all – a property of the number, not of the request. */
export type AdoptionBlockedReason =
  | "ALREADY_ADOPTED"
  | "ADOPTED_BY_ANOTHER_TENANT"
  | "NUMBER_NOT_USABLE"
  | "NUMBER_NOT_AUSTRALIAN";

/** The refusals `classifyOwnedNumber` can return, i.e. the ones about the number itself. */
type UnusableNumberReason = Extract<AdoptionBlockedReason, "NUMBER_NOT_USABLE" | "NUMBER_NOT_AUSTRALIAN">;

/** Everything on one inbound hook that Twilio routes on and adoption would overwrite. */
export type HookConfiguration = {
  url: string | null;
  applicationSid: string | null;
  fallbackUrl: string | null;
  /** Voice only – a SIP-trunk binding overrides the URL. Always null for the SMS hook. */
  trunkSid: string | null;
};

/** What adoption did – or deliberately did NOT do – to the number's inbound hook. */
export type AdoptionHookReport = {
  hook: "sms" | "voice";
  action: "claimed" | "taken-over" | "left-in-place";
  /** The configuration found on that hook BEFORE adoption (all null ⇒ it was free). */
  existing: HookConfiguration;
};

/** A number on the account, annotated with whether uprise can actually adopt it. */
export type AdoptableNumber = OwnedNumber & {
  classification: AdoptionClassification | null;
  /**
   * Why this number cannot be adopted, or null when it can. Never names the other
   * organisation – the caller owns the Twilio account, not the other tenant's data.
   */
  blockedReason: AdoptionBlockedReason | null;
  /**
   * The hook adoption would write, and what is sitting on it right now. `action:
   * "left-in-place"` on the SMS hook is not merely informational: adoption REFUSES a
   * messaging number whose SMS hook belongs to someone else unless `claimSmsHook` is set,
   * because uprise would otherwise send from a number whose STOP replies it never sees.
   */
  hook: AdoptionHookReport;
};

/**
 * Twilio's own demo placeholders. A brand-new number is handed these by Twilio, not by the
 * organisation, so treating them as a real configuration would make every untouched number
 * look like a conflict and force a needless opt-in.
 */
const TWILIO_DEMO_HOOKS = [
  "https://demo.twilio.com/welcome/sms/reply",
  "https://demo.twilio.com/welcome/voice",
];

/**
 * The one and only chain edge, and the reason the chain terminates.
 *
 * A mobile run (SMS) pulls a local run (voice) behind it; a local run has NO successor,
 * so the chain is a single directed edge that cannot cycle even if every other guard were
 * removed. Do NOT rewrite this as a symmetric "the other class" lookup – that would let a
 * completing local run start a mobile run, and the two would chase each other forever.
 */
const CHAIN_SUCCESSOR: Readonly<Record<"mobile" | "local", "local" | null>> = {
  mobile: "local",
  local: null,
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
 * An ABN/ACN as Twilio wants it: digits only. Australians write these grouped ("43 687 271 227")
 * and the value arrives from a free-text admin field, so it can carry grouping spaces or stray
 * leading whitespace. It is submitted verbatim into a regulatory bundle that a human at Twilio
 * reviews, and a mismatch there fails days later with nothing useful to read.
 */
export function normaliseBusinessNumber(raw: string | null | undefined): string | undefined {
  const digits = (raw ?? "").replace(/\D/g, "");
  return digits || undefined;
}

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
    private readonly images: ImageUploadService,
    private readonly flags: FeatureFlagsService,
  ) {}

  /**
   * Gate on the start of a provisioning run (NOT retry/resubmit — a mid-flight run whose
   * data was complete at start must not strand on later edits): the tenant's plan must
   * include dedicated telephony, and the org identification the AU regulatory bundle is
   * built from must be complete. 422 carries machine-readable `missing[]` for the UI.
   */
  private async assertProvisioningAllowed(tenantId: string): Promise<void> {
    if (!(await this.planAllowsTelephony(tenantId))) {
      throw new ApiHttpException(
        "PLAN_UPGRADE_REQUIRED",
        "Your plan does not include a dedicated phone number",
        403,
      );
    }
    const profile = await this.prisma.orgProfile.findFirst({
      where: { tenantId },
      select: {
        name: true,
        bio: true,
        logoBlockUrl: true,
        logoLandscapeUrl: true,
        primaryColour: true,
        secondaryColour: true,
        heroImageUrl: true,
        credential: {
          select: {
            legalTradingName: true,
            australianBusinessNumber: true,
            australianCompanyNumber: true,
            entityType: true,
          },
        },
        contacts: {
          select: {
            firstName: true,
            lastName: true,
            email: true,
            isPrimaryContact: true,
            isAuthorisedSignatory: true,
          },
        },
        addresses: {
          select: { line1: true, suburb: true, city: true, state: true, postcode: true },
        },
      },
    });
    const result = evaluateOrgSetup({
      profile: profile
        ? {
            name: profile.name,
            bio: profile.bio,
            logoBlockUrl: profile.logoBlockUrl,
            logoLandscapeUrl: profile.logoLandscapeUrl,
            primaryColour: profile.primaryColour,
            secondaryColour: profile.secondaryColour,
            heroImageUrl: profile.heroImageUrl,
          }
        : null,
      credential: profile?.credential ?? null,
      contacts: profile?.contacts ?? [],
      addresses: profile?.addresses ?? [],
    });
    if (!result.provisionReady) {
      throw new ApiHttpException(
        "SETUP_INCOMPLETE",
        "Complete your organisation's business, contact and address details first",
        422,
        { missing: result.missing },
      );
    }
  }

  /**
   * The plan half of the gate on its own – the only half that can lapse WHILE a run is in
   * flight, so it is what the complementary chain re-checks days later (see
   * `maybeChainComplementaryRun`). One definition, so the flag key cannot drift apart.
   */
  private async planAllowsTelephony(tenantId: string): Promise<boolean> {
    return this.flags.isEnabled("FEATURE_TENANT_TELEPHONY_ENABLED", { tenantId });
  }

  // ── URLs ────────────────────────────────────────────────────────────
  private apiBaseUrl(): string {
    return this.config.get<string>("API_BASE_URL", "").trim().replace(/\/+$/, "");
  }

  private inboundHookUrl(): string {
    return `${this.apiBaseUrl()}/api/v1/inbound-text-message-hook`;
  }

  /**
   * The TwiML endpoint an inbound call to a local (calls) number lands on.
   *
   * Read this before changing it: uprise has NO purpose-built inbound-call handler. The
   * voice surface is outbound (`/voice-outbound` is the softphone TwiML app's handler,
   * `/autodialer/ivr/*` needs a campaign/session context, the rest are status callbacks).
   * `/voice-outbound` is nonetheless the right target today: it is public-allowlisted,
   * validates the subaccount's X-Twilio-Signature, and an inbound PSTN call – whose `From`
   * is a phone number, not a `client:….t<tenant>` identity – takes its guard branch and is
   * answered with a spoken apology, writing nothing. The alternative is leaving voiceUrl
   * unset, which has Twilio play a generic application error to anyone ringing the number
   * the organisation publishes. A real inbound handler (greeting / ring the org's
   * softphone users) is an open follow-up, not part of this fix.
   */
  private inboundVoiceUrl(): string {
    return `${this.apiBaseUrl()}/api/v1/voice-outbound`;
  }

  /**
   * The inbound webhook a number of this class can actually serve. An AU local number
   * cannot receive SMS and an AU mobile is never a voice caller ID, so a single smsUrl for
   * both configured a hook that can never fire on the local number while leaving its
   * inbound calls unanswered. Built here (not in the client) so the class → webhook rule is
   * one tested decision.
   */
  private numberWebhooks(type: "mobile" | "local"): NumberWebhooks {
    return type === "local"
      ? { voiceUrl: this.inboundVoiceUrl(), voiceMethod: "POST" }
      : { smsUrl: this.inboundHookUrl(), smsMethod: "POST" };
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
      // Null on every account that is not regional (the platform's subaccounts, and every
      // row that predates the column) – the client then builds itself exactly as before.
      region: account.region,
      edge: account.edge,
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
  /** The number type a run purchases ("mobile" unless explicitly "local"). */
  private runNumberType(run: { numberType?: string | null }): "mobile" | "local" {
    return run.numberType === "local" ? "local" : "mobile";
  }

  /**
   * Match a number's regulation class. `numberType` decides it, full stop.
   *
   * An earlier form ORed the "+614" prefix in as a "fallback for legacy rows". That was
   * wrong twice over: the column is NOT NULL with a default and the migration back-fills
   * every pre-existing row from that same prefix, so no row can lack a class – and where
   * the two ever disagreed the OR matched BOTH arms, which is the exact opposite of
   * treating the stored class as authoritative. A number explicitly recorded as local must
   * never satisfy a mobile reuse query, or a mobile run inherits a local bundle and buys a
   * number it cannot text from.
   */
  private numberClassMatch(type: "mobile" | "local"): Prisma.TelephonyPhoneNumberWhereInput[] {
    return [{ numberType: type }];
  }

  /** Org KYC → a best-effort ComplianceInput prefill (empty strings where unknown). */
  async compliancePrefill(tenantId: string): Promise<ComplianceInput> {
    const profile = await this.prisma.orgProfile.findFirst({
      where: { tenantId },
      include: { contacts: true, addresses: true, credential: true },
    });
    const contact =
      profile?.contacts.find((c) => c.isPrimaryContact) ?? profile?.contacts[0] ?? null;
    // The REGISTERED address, not merely the first one. A tenant can hold several (billing,
    // postal, registered), and Twilio's regulatory bundle is matched against the address
    // registered to the ABN — submitting a billing address gets the bundle rejected by a
    // human reviewer days later, with no useful error.
    const address =
      profile?.addresses.find((a) => a.addressType?.toLowerCase() === "registered") ??
      profile?.addresses[0] ??
      null;
    return {
      legalName: profile?.credential?.legalTradingName || profile?.name || "",
      contactFirstName: contact?.firstName || "",
      contactLastName: contact?.lastName || "",
      email: contact?.email || "",
      businessNumber: normaliseBusinessNumber(
        profile?.credential?.australianBusinessNumber ||
          profile?.credential?.australianCompanyNumber,
      ),
      address: {
        street: [address?.line1, address?.line2].filter(Boolean).join(", "),
        city: address?.suburb || address?.city || "",
        region: address?.state || "",
        postalCode: address?.postcode || "",
      },
    };
  }

  /**
   * Validate the four BYO-account-shaped extras before anything is written.
   *
   * These exist for a tenant that arrives with an established Twilio account: Common Threads
   * already holds an APPROVED AU bundle and a registered address, and their account runs in
   * a region. Every branch here refuses rather than guesses, because both failure modes are
   * silent and late – a wrong SID fails at the purchase call after the run has already
   * skipped compliance review, and a wrong region routes calls to the wrong Twilio edge.
   *
   * All four are meaningless outside BYO: a subaccount created under the platform master
   * cannot use a bundle that lives under someone else's account, and it inherits the
   * master's region. Supplying them on a SUBACCOUNT run is therefore REJECTED, not ignored –
   * ignoring it would leave the operator believing a days-long human review had been skipped
   * until the run visibly drafted its own bundle anyway.
   */
  private byoExtras(input: StartRunInput): {
    reuse: { bundleSid: string; addressSid: string } | null;
    region: string | null;
    edge: string | null;
  } {
    const bundleSid = input.byoBundleSid?.trim() || undefined;
    const addressSid = input.byoAddressSid?.trim() || undefined;
    const region = input.byoRegion?.trim().toLowerCase() || undefined;
    const edge = input.byoEdge?.trim().toLowerCase() || undefined;
    if (!bundleSid && !addressSid && !region && !edge) {
      return { reuse: null, region: null, edge: null };
    }
    if (input.mode !== "BYO") {
      throw new ApiHttpException(
        "BYO_ONLY_FIELD",
        "An existing bundle, address, region or edge only applies to a BYO Twilio account",
      );
    }
    // Half a pair is a mistake, not a partial optimisation: Twilio requires BOTH on the
    // number purchase, so a bundle without its address buys nothing.
    if (Boolean(bundleSid) !== Boolean(addressSid)) {
      throw new ApiHttpException(
        "BUNDLE_REUSE_PAIR_REQUIRED",
        "Supply both the regulatory bundle SID and its address SID, or neither",
      );
    }
    if (bundleSid && !BUNDLE_SID_RE.test(bundleSid)) {
      throw new ApiHttpException("INVALID_TWILIO_SID", "The bundle SID must look like BU… (34 characters)");
    }
    if (addressSid && !ADDRESS_SID_RE.test(addressSid)) {
      throw new ApiHttpException("INVALID_TWILIO_SID", "The address SID must look like AD… (34 characters)");
    }
    const { region: checkedRegion, edge: checkedEdge } = this.normaliseRegionEdge(region, edge);
    return {
      reuse: bundleSid && addressSid ? { bundleSid, addressSid } : null,
      region: checkedRegion,
      edge: checkedEdge,
    };
  }

  /**
   * Validate and normalise a Twilio home region/edge pair. Shared by the provisioning path and
   * by connectByoAccount, so the two can never drift on what a valid region looks like.
   */
  private normaliseRegionEdge(
    rawRegion?: string,
    rawEdge?: string,
  ): { region: string | null; edge: string | null } {
    const region = rawRegion?.trim().toLowerCase() || undefined;
    const edge = rawEdge?.trim().toLowerCase() || undefined;
    // An edge without its region would have the SDK log a deprecation warning and route on
    // a half-specified host; make the operator state the region they mean.
    if (edge && !region) {
      throw new ApiHttpException("TWILIO_REGION_REQUIRED", "An edge needs its region (for example au1 with sydney)");
    }
    if (region && !TWILIO_REGION_RE.test(region)) {
      throw new ApiHttpException("INVALID_TWILIO_REGION", "The region must look like au1");
    }
    if (edge && !TWILIO_EDGE_RE.test(edge)) {
      throw new ApiHttpException("INVALID_TWILIO_REGION", "The edge must look like sydney");
    }
    return { region: region ?? null, edge: edge ?? null };
  }

  /**
   * Ask Twilio what a supplied bundle/address actually ARE, before any run row exists.
   *
   * The operator hand-pastes two SIDs off another system. Every way that can be wrong – a
   * typo, a bundle belonging to a different account, one still in review, one approved for
   * the OTHER regulation class – is otherwise discovered at the purchase call, days of
   * skipped review later, where the run parks FAILED at a step `retry` can only re-attempt
   * with the same bad SIDs. Asking here turns all of it into an immediate 422 on the
   * operator's own screen.
   *
   * It is also the ONLY thing that establishes the bundle's class INDEPENDENTLY of what the
   * operator claimed: the class comes from the bundle's own regulation at Twilio, never from
   * the `numberType` the run was started with. Returns the verified class, or undefined when
   * Twilio could not tell us (unknown ⇒ never treated as a match).
   */
  private async verifySuppliedPair(
    creds: TwilioCreds,
    reuse: { bundleSid: string; addressSid: string },
    wantType: "mobile" | "local",
  ): Promise<"mobile" | "local" | undefined> {
    let facts: BundleFacts;
    try {
      facts = await this.twilio.fetchBundleFacts(creds, reuse.bundleSid);
    } catch (err) {
      this.logger.warn("telephony", "Supplied regulatory bundle could not be read", {
        error: String(err instanceof Error ? err.message : err),
      });
      throw new ApiHttpException(
        "SUPPLIED_BUNDLE_UNREADABLE",
        "That regulatory bundle could not be read on this Twilio account – check the SID and that the bundle belongs to the account you supplied",
        422,
      );
    }
    if (facts.status !== "twilio-approved") {
      throw new ApiHttpException(
        "SUPPLIED_BUNDLE_NOT_APPROVED",
        `That regulatory bundle is "${facts.status || "unknown"}", not approved by Twilio – only an already-approved bundle can skip compliance review`,
        422,
      );
    }
    if (facts.isoCountry && facts.isoCountry.toUpperCase() !== "AU") {
      throw new ApiHttpException(
        "SUPPLIED_BUNDLE_WRONG_COUNTRY",
        `That regulatory bundle is for ${facts.isoCountry}, and uprise buys Australian numbers`,
        422,
      );
    }
    // The expensive mistake this whole check exists for: a mobile-approved bundle cannot
    // buy a local number, and Twilio is the only thing that knows which it is.
    if (facts.numberType && facts.numberType !== wantType) {
      throw new ApiHttpException(
        "SUPPLIED_BUNDLE_WRONG_CLASS",
        `That regulatory bundle is approved for ${facts.numberType} numbers, but this run is provisioning a ${wantType} number`,
        422,
      );
    }
    let addressCountry: string | null;
    try {
      addressCountry = await this.twilio.fetchAddressCountry(creds, reuse.addressSid);
    } catch (err) {
      this.logger.warn("telephony", "Supplied address could not be read", {
        error: String(err instanceof Error ? err.message : err),
      });
      throw new ApiHttpException(
        "SUPPLIED_ADDRESS_UNREADABLE",
        "That address could not be read on this Twilio account – check the SID and that the address belongs to the account you supplied",
        422,
      );
    }
    if (addressCountry && addressCountry.toUpperCase() !== "AU") {
      throw new ApiHttpException(
        "SUPPLIED_ADDRESS_WRONG_COUNTRY",
        `That address is registered in ${addressCountry}, and an Australian number needs an Australian address`,
        422,
      );
    }
    return facts.numberType === "mobile" || facts.numberType === "local" ? facts.numberType : undefined;
  }

  async startRun(input: StartRunInput) {
    // Read-only gate BEFORE the transaction (no external calls in tx): plan + org KYC.
    await this.assertProvisioningAllowed(input.tenantId);
    const extras = this.byoExtras(input);
    const friendlyName = input.friendlyName?.trim() || `uprise ${input.tenantId}`;
    const numberType = input.numberType === "local" ? "local" : "mobile";
    const byoAccountSid = input.byoAccountSid;
    const byoAuthToken = input.byoAuthToken;

    // The supplied pair is stored as the run's reuse bookkeeping – the same slot the
    // prior-number fast-path uses, so ONE code path in stepDraftCompliance and
    // stepPurchaseNumber serves both provenances – stamped with the class Twilio says the
    // bundle is approved for, and with whether that class is known at all. The verification
    // is an external call, so it happens HERE, before the transaction is opened.
    let complianceInput: StoredComplianceInput = input.complianceInput;
    if (extras.reuse) {
      if (!byoAccountSid || !byoAuthToken) {
        throw new ApiHttpException("BYO_CREDENTIALS_REQUIRED", "BYO mode needs an account SID and auth token");
      }
      const verifiedType = await this.verifySuppliedPair(
        { accountSid: byoAccountSid, authToken: byoAuthToken, region: extras.region, edge: extras.edge },
        extras.reuse,
        numberType,
      );
      complianceInput = {
        ...input.complianceInput,
        reuse: {
          ...extras.reuse,
          source: "operator-supplied",
          // Equal by construction – `verifySuppliedPair` refuses any bundle Twilio says is
          // a different class, so the only way to get here is agreement (or Twilio not
          // knowing, which `classVerified` is what records).
          numberType,
          classVerified: Boolean(verifiedType),
        },
      };
    }
    return this.prisma.$transaction(async (tx) => {
      let accountId: string | null = null;
      if (input.mode === "BYO") {
        if (!byoAccountSid || !byoAuthToken) {
          throw new ApiHttpException("BYO_CREDENTIALS_REQUIRED", "BYO mode needs an account SID and auth token");
        }
        const account = await tx.telephonyAccount.upsert({
          where: { accountSid: byoAccountSid },
          create: {
            tenantId: input.tenantId,
            mode: TelephonyAccountMode.BYO,
            accountSid: byoAccountSid,
            encryptedAuthToken: this.crypto.encrypt(byoAuthToken),
            friendlyName,
            region: extras.region,
            edge: extras.edge,
          },
          update: {
            encryptedAuthToken: this.crypto.encrypt(byoAuthToken),
            // Region and edge move as ONE pair, or not at all. An omitted region means
            // "unchanged", never "clear what the account has"; but a STATED region replaces
            // both halves (edge := stated-or-null). Writing them independently let a re-run
            // that named only a new region keep the previous region's edge, leaving the row
            // as e.g. us1/sydney – a host that does not exist.
            ...(extras.region ? { region: extras.region, edge: extras.edge } : {}),
          },
        });
        accountId = account.id;
      }
      const run = await tx.telephonyProvisioningRun.create({
        data: {
          tenantId: input.tenantId,
          campaignId: input.campaignId ?? null,
          accountId,
          status: S.REQUESTED,
          numberType,
          chainComplementary: input.chainComplementary !== false,
          complianceInput: complianceInput as unknown as Prisma.InputJsonValue,
          requestedById: input.requestedById ?? null,
        },
      });
      await tx.telephonyProvisioningStep.create({
        data: {
          runId: run.id,
          tenantId: input.tenantId,
          step: "run.requested",
          status: TelephonyStepStatus.SUCCEEDED,
          detail: {
            mode: input.mode,
            campaignId: input.campaignId ?? null,
            // Visible in the timeline: this run is about to skip a human review, and an
            // operator reading the timeline should see WHY it never drafted a bundle.
            suppliedBundle: Boolean(extras.reuse),
            regional: Boolean(extras.region),
          } as Prisma.InputJsonValue,
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
    if (!this.images.enabled) {
      throw new ApiHttpException("DOCUMENT_STORAGE_NOT_CONFIGURED", "Document storage is not configured");
    }
    const ext = this.images.extFrom(file.originalname, "pdf");
    // Namespaced (was not, previously — dev docs leaked to the store root).
    const { url, key } = await this.images.put(file.buffer, {
      key: `telephony-compliance/${runId}/${Date.now()}-${Math.random().toString(36).slice(2)}.${ext}`,
      contentType: file.mimetype,
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

      const wantType = this.runNumberType(run);

      // Reuse, provenance 1: a bundle+address the OPERATOR supplied at start, already
      // approved on their own (BYO) Twilio account. Nothing is drafted, nothing is uploaded
      // and no human at Twilio reviews anything a second time – the run walks straight to
      // APPROVED and buys the number.
      //
      // The class check that MATTERS happens at `startRun`, against Twilio's own record of
      // what the bundle is approved for (`verifySuppliedPair`) – a mobile bundle cannot buy
      // a local number, and only Twilio knows which it is. The comparison below is not that
      // check: `startRun` writes the run's class and the stamp together, so they agree by
      // construction. It is a cheap consistency assertion on the stored JSON, which is
      // hand-editable and long-lived (a run can sit for days), and it fails SAFE – falling
      // through to a fresh draft rather than buying against the wrong regulation. Note the
      // chained complementary run never sees any of this – `maybeChainComplementaryRun`
      // strips `reuse` – so the local half of a chain drafts its own local bundle, as it must.
      const supplied = input.reuse?.source === "operator-supplied" ? input.reuse : null;
      if (supplied && run.status === S.SUBACCOUNT_CREATED) {
        if (supplied.numberType && supplied.numberType !== wantType) {
          this.logger.warn("telephony", "Supplied bundle is for another regulation class – drafting a fresh one", {
            runId,
            approvedFor: supplied.numberType,
            wanted: wantType,
          });
        } else {
          await this.advance(runId, {
            hops: [
              { to: S.COMPLIANCE_DRAFT, step: "compliance.draft", stepStatus: TelephonyStepStatus.SKIPPED, detail: { reusedBundleSid: supplied.bundleSid, source: "operator-supplied" } },
              { to: S.COMPLIANCE_SUBMITTED, step: "compliance.submit", stepStatus: TelephonyStepStatus.SKIPPED },
              { to: S.COMPLIANCE_APPROVED, step: "compliance.review", stepStatus: TelephonyStepStatus.SKIPPED, detail: { reused: true, source: "operator-supplied" } },
            ],
            // `bundleSid` is deliberately NOT written to the run: it is unique per run
            // (applyBundleStatus looks a run up by it) and the supplied bundle is not this
            // run's to own. stepPurchaseNumber reads it back out of `reuse`.
            data: { addressSid: supplied.addressSid },
            event: {
              tenantId: run.tenantId,
              eventType: "telephony.provisioning.compliance-approved",
              aggregateId: runId,
              payload: { runId, tenantId: run.tenantId, bundleSid: supplied.bundleSid },
            },
          });
          return;
        }
      }

      // Reuse, provenance 2: a prior number of this tenant with an approved bundle – but only
      // of the SAME regulation class (a mobile bundle cannot purchase a local number).
      const prior = await this.prisma.telephonyPhoneNumber.findFirst({
        where: {
          tenantId: run.tenantId,
          accountId: run.accountId,
          bundleSid: { not: null },
          addressSid: { not: null },
          OR: this.numberClassMatch(wantType),
        },
        orderBy: { createdAt: "desc" },
      });
      if (prior?.bundleSid && prior.addressSid && run.status === S.SUBACCOUNT_CREATED) {
        const stored: StoredComplianceInput = {
          ...input,
          reuse: {
            bundleSid: prior.bundleSid,
            addressSid: prior.addressSid,
            sourceNumberId: prior.id,
            source: "prior-number",
            // The class the prior number (and so its bundle) was approved under; the query
            // above already matched on it, recorded here so provenance is self-describing.
            numberType: wantType,
          },
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

      const bundleSid = await this.twilio.createBundle(creds, `uprise ${run.tenantId}`, input.email, this.bundleCallbackUrl(), this.runNumberType(run));
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

  /**
   * COMPLIANCE_REJECTED: update details and re-run the draft step (new bundle).
   *
   * ALSO the escape hatch for the one FAILED state `retry` cannot fix: a run carrying an
   * operator-supplied bundle that fell over at the purchase step. `retry` re-enters at
   * `resumeStatus` – COMPLIANCE_APPROVED – and re-attempts the purchase with the SAME two
   * SIDs, forever; and such a run can never reach COMPLIANCE_REJECTED, because its supplied
   * bundle is deliberately not written to the run row, so no webhook or poll can resolve to
   * it. Without this branch the operator's only remedy is abandoning the run. Here the
   * supplied pair is DISCARDED and the run walks back to SUBACCOUNT_CREATED to draft a
   * bundle of its own – the slow path, but a self-service one.
   */
  async resubmit(runId: string, complianceInput?: ComplianceInput) {
    const run = await this.getRunOrThrow(runId);
    const stored = this.complianceInputOf(run);
    const stuckOnSuppliedBundle =
      run.status === S.FAILED &&
      run.resumeStatus === S.COMPLIANCE_APPROVED &&
      stored.reuse?.source === "operator-supplied";
    if (run.status !== S.COMPLIANCE_REJECTED && !stuckOnSuppliedBundle) {
      throw new ApiHttpException(
        "NOT_REJECTED",
        "Only a rejected run – or one that failed on a supplied regulatory bundle – can be resubmitted",
        409,
      );
    }
    if (stuckOnSuppliedBundle) {
      // Strip `reuse` as well as the SIDs: leaving it would have stepDraftCompliance take
      // the supplied fast-path straight back to the same failing purchase.
      const { reuse: _discarded, ...withoutReuse } = complianceInput
        ? ({ ...complianceInput } as StoredComplianceInput)
        : stored;
      await this.advance(runId, {
        hops: [
          {
            to: S.SUBACCOUNT_CREATED,
            step: "compliance.redraft",
            detail: { discardedSuppliedBundle: true, lastError: run.lastError },
          },
        ],
        data: {
          complianceInput: withoutReuse as unknown as Prisma.InputJsonValue,
          bundleSid: null,
          addressSid: null,
        },
      });
      await this.stepDraftCompliance(runId);
      return this.getRunOrThrow(runId);
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

  /** COMPLIANCE_APPROVED → NUMBER_PURCHASED: buy an AU number (mobile or local) into the account. */
  async stepPurchaseNumber(runId: string): Promise<void> {
    await this.guarded(runId, "number.purchase", [S.COMPLIANCE_APPROVED], async () => {
      const run = await this.getRunOrThrow(runId);
      // The gate on the MONEY event, not just on starting a run. Every other check happens
      // before a run spends days parked in COMPLIANCE_SUBMITTED waiting on a human at
      // Twilio; entitlement can lapse in that window, and it is this step that buys a
      // recurring number we cannot claw back. `guarded` turns the throw into a parked
      // FAILED run with resumeStatus COMPLIANCE_APPROVED – nothing is bought, the approved
      // bundle is kept, and retry re-enters here (and so re-checks) once the plan is back.
      // That also closes retry(), which is deliberately ungated at its own entry point.
      if (!(await this.planAllowsTelephony(run.tenantId))) {
        throw new ApiHttpException(
          "PLAN_UPGRADE_REQUIRED",
          "Your plan no longer includes a dedicated phone number",
          402,
        );
      }
      if (!run.accountId) throw new Error("Run has no account");
      const creds = await this.accountCreds(run.accountId);
      const input = this.complianceInputOf(run);
      const bundleSid = run.bundleSid ?? input.reuse?.bundleSid;
      const addressSid = run.addressSid ?? input.reuse?.addressSid;
      if (!bundleSid || !addressSid) throw new Error("Run has no approved bundle/address to purchase with");

      const numberType = this.runNumberType(run);
      const candidate = await this.twilio.findAvailableAuNumber(creds, numberType);
      const purchased = await this.twilio.purchaseNumber(creds, {
        phoneNumber: candidate,
        bundleSid,
        addressSid,
        // Voice on a local number, SMS on a mobile – the number gets the hook for the job
        // it exists to do.
        webhooks: this.numberWebhooks(numberType),
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
              // The regulation class this bundle was approved under, recorded rather than
              // re-guessed from the prefix later – it is what future bundle reuse matches on.
              numberType,
              // Local numbers are the voice caller-id ("voice"); mobiles stay SMS ("marketing").
              // SendPurpose values are all MESSAGING purposes. A local number is voice-only
              // in Australia, so labelling it "transactional" made it the tenant's SMS sender
              // and every transactional text would have failed at Twilio. "voice" matches no
              // SendPurpose, so the resolver can never select it for a send.
              purpose: numberType === "local" ? "voice" : "marketing",
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

  /** NUMBER_PURCHASED → WEBHOOKS_CONFIGURED: (re)assert the class-appropriate inbound hook. */
  async stepConfigureWebhooks(runId: string): Promise<void> {
    await this.guarded(runId, "webhooks.configure", [S.NUMBER_PURCHASED], async () => {
      const run = await this.getRunOrThrow(runId);
      if (!run.accountId || !run.phoneNumberId) throw new Error("Run has no purchased number");
      const number = await this.prisma.telephonyPhoneNumber.findUnique({ where: { id: run.phoneNumberId } });
      if (!number) throw new Error("Purchased number row missing");
      const creds = await this.accountCreds(run.accountId);
      // The class recorded on the NUMBER row, which is the class the bundle was approved
      // under and the number was actually bought as.
      const webhooks = this.numberWebhooks(this.runNumberType(number));
      await this.twilio.configureNumberWebhook(creds, number.phoneNumberSid, webhooks);
      await this.advance(runId, {
        hops: [{ to: S.WEBHOOKS_CONFIGURED, step: "webhooks.configure", detail: { ...webhooks } }],
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

  /**
   * Terminal success (ACTIVE) → start the run for the complementary class, so ONE
   * provisioning process yields both of an organisation's numbers: a mobile to text
   * from and a local to call from. Driven by the `activated` reaction, not a loop, so
   * the second run walks the same guarded FSM and shows up in the same timelines.
   *
   * Guards, in order – any one of them stops the chain:
   *  1. the source run is not ACTIVE (a stale or replayed event);
   *  2. its class has no successor (`CHAIN_SUCCESSOR.local === null` – this is what
   *     terminates the chain: a completing local run starts nothing);
   *  3. the run opted out (`chainComplementary === false`, which every chained run is);
   *  4. the tenant's plan no longer includes dedicated telephony (it can lapse during the
   *     days the first bundle spends in review – see the comment at the check);
   *  5. the tenant already holds a live number of the target class;
   *  6. a run of the target class already exists for this tenant – in flight, finished
   *     or failed. A failed one is retried explicitly, never silently re-chained.
   *
   * The whole body is caught, never thrown: by this point the first number is ACTIVE and
   * usable, and SMS – the primary capability – must not be held hostage to the voice half.
   */
  async maybeChainComplementaryRun(
    runId: string,
  ): Promise<{ chained: boolean; reason: string; runId?: string }> {
    try {
      const source = await this.prisma.telephonyProvisioningRun.findUnique({ where: { id: runId } });
      if (!source) return { chained: false, reason: "run-missing" };
      if (source.status !== S.ACTIVE) return { chained: false, reason: "not-terminal" };

      const nextType = CHAIN_SUCCESSOR[this.runNumberType(source)];
      if (!nextType) return { chained: false, reason: "chain-terminates" };
      if (source.chainComplementary === false) return { chained: false, reason: "opted-out" };

      const tenantId = source.tenantId;
      // Re-check the PLAN, and ONLY the plan. The source run parks in COMPLIANCE_SUBMITTED
      // for however long a human at Twilio takes, so entitlement can lapse between the
      // start gate and here – and a second number is a real recurring cost we cannot claw
      // back. The org-KYC half of `assertProvisioningAllowed` is deliberately NOT re-run:
      // those details were complete when the operator started, the chained run submits that
      // same complianceInput, and an admin tidying a profile field mid-flight must not
      // strand the voice half (the reason retry/resubmit are ungated too).
      if (!(await this.planAllowsTelephony(tenantId))) {
        // SOFT refusal: the mobile number is ACTIVE and must stay usable, so this logs and
        // skips rather than throwing into the reaction. The operator starts the local run
        // explicitly once the plan is restored.
        this.logger.warn("telephony", "Complementary chain skipped – telephony plan not enabled", {
          sourceRunId: runId,
          tenantId,
          numberType: nextType,
        });
        return { chained: false, reason: "plan-disabled" };
      }

      const held = await this.prisma.telephonyPhoneNumber.findFirst({
        where: {
          tenantId,
          status: { not: TelephonyNumberStatus.RELEASED },
          OR: this.numberClassMatch(nextType),
        },
      });
      if (held) return { chained: false, reason: "number-exists" };

      // Compliance details the operator already supplied, minus the source run's own
      // bundle-reuse bookkeeping – the chained run reuses a bundle only of its own class.
      const { reuse: _sourceReuse, ...complianceInput } = this.complianceInputOf(source);

      // The supporting documents the operator uploaded, inherited SID and all. A Twilio
      // SupportingDocument is an ACCOUNT-scoped resource, not a bundle-scoped one: it is
      // created by POSTing to /v2/RegulatoryCompliance/SupportingDocuments under the
      // subaccount's own credentials (see `createSupportingDocument`), and a bundle only
      // ever REFERENCES it afterwards through an ItemAssignment (`assignBundleItem`). So
      // the same SID can be assigned to the local bundle as well as the mobile one, and no
      // re-upload is needed – the chained run inherits `source.accountId`, so it is the
      // same account the documents live under. Without this the second bundle went to
      // Twilio's human reviewer with zero supporting documents and was rejected days later.
      const documents = this.documentsOf(source).map(({ supportingDocumentSid, ...doc }) => ({
        ...doc,
        // Defensive: a SID from another account would be rejected on assignment. Drop it and
        // let stepDraftCompliance re-upload the blob (it skips only documents that HAVE a SID).
        ...(source.accountId && supportingDocumentSid ? { supportingDocumentSid } : {}),
      }));

      const created = await this.prisma.$transaction(async (tx) => {
        // Lock the source run so two deliveries of the same terminal event serialise
        // here; the re-read below is what makes the second one a no-op.
        await tx.$queryRaw`SELECT "id" FROM "telephony"."TelephonyProvisioningRun" WHERE "id" = ${runId} FOR UPDATE`;
        const existingRun = await tx.telephonyProvisioningRun.findFirst({
          where: { tenantId, numberType: nextType },
        });
        if (existingRun) return null;

        const run = await tx.telephonyProvisioningRun.create({
          data: {
            tenantId,
            campaignId: source.campaignId,
            // The subaccount the first run created; stepCreateSubaccount reuses it.
            accountId: source.accountId,
            status: S.REQUESTED,
            numberType: nextType,
            // Belt to the CHAIN_SUCCESSOR braces: a chained run never chains again.
            chainComplementary: false,
            complianceInput: complianceInput as unknown as Prisma.InputJsonValue,
            documents: documents as unknown as Prisma.InputJsonValue,
            requestedById: source.requestedById,
          },
        });
        await tx.telephonyProvisioningStep.create({
          data: {
            runId: run.id,
            tenantId,
            step: "run.requested",
            status: TelephonyStepStatus.SUCCEEDED,
            detail: {
              mode: "SUBACCOUNT",
              campaignId: source.campaignId,
              numberType: nextType,
              chainedFromRunId: runId,
              // Visible in the timeline: a bundle drafted with no documents is the failure
              // mode this chain had, and it fails days later at a human reviewer.
              inheritedDocuments: documents.length,
            } as Prisma.InputJsonValue,
          },
        });
        // The SOURCE run's timeline says why a second run appeared, so it does not read
        // as an operator double-click.
        await tx.telephonyProvisioningStep.create({
          data: {
            runId,
            tenantId,
            step: "chain.complementary",
            status: TelephonyStepStatus.SUCCEEDED,
            detail: { chainedRunId: run.id, numberType: nextType } as Prisma.InputJsonValue,
          },
        });
        await this.outbox.append(tx, {
          tenantId,
          eventType: "telephony.provisioning.chained",
          aggregateId: run.id,
          payload: {
            runId: run.id,
            tenantId,
            sourceRunId: runId,
            numberType: nextType,
            sourceNumberType: this.runNumberType(source),
          },
        });
        await this.outbox.append(tx, {
          tenantId,
          eventType: "telephony.provisioning.requested",
          aggregateId: run.id,
          payload: { runId: run.id, tenantId, campaignId: source.campaignId, mode: "SUBACCOUNT" },
        });
        return run;
      });
      if (!created) return { chained: false, reason: "run-exists" };

      this.logger.log("telephony", "Chained complementary provisioning run", {
        sourceRunId: runId,
        runId: created.id,
        numberType: nextType,
      });
      return { chained: true, reason: "chained", runId: created.id };
    } catch (err) {
      // Isolated by design: the first number is live regardless of what happened here.
      this.logger.error("telephony", "Complementary provisioning chain failed", undefined, {
        runId,
        error: String(err instanceof Error ? err.message : err),
      });
      return { chained: false, reason: "error" };
    }
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

  /** Rename a provisioned number. `scopeTenantId` (set for non-super-admin callers)
   *  guards against relabelling another tenant's number. Empty ⇒ clears the nickname. */
  async setNickname(
    numberId: string,
    nickname: string | undefined,
    scopeTenantId?: string,
    purpose?: "transactional" | "marketing" | "whatsapp",
  ) {
    const number = await this.prisma.telephonyPhoneNumber.findUnique({ where: { id: numberId } });
    if (!number) throw new NotFoundException("Number not found");
    if (scopeTenantId && number.tenantId !== scopeTenantId) {
      throw new ForbiddenException("You can only rename your own organisation's numbers");
    }
    // An AU mobile can never serve as the calls number — refuse the repurpose
    // rather than silently letting the voice resolver skip it later.
    if (purpose === "transactional" && number.phoneNumberE164.startsWith("+614")) {
      throw new ApiHttpException(
        "VOICE_NUMBER_REQUIRED",
        "Mobile numbers can't place outbound calls — only a local number can be the calls number.",
        422,
      );
    }
    const trimmed = nickname?.trim();
    return this.prisma.telephonyPhoneNumber.update({
      where: { id: numberId },
      data: {
        ...(nickname !== undefined ? { nickname: trimmed ? trimmed : null } : {}),
        ...(purpose ? { purpose } : {}),
      },
    });
  }

  // ── adoption: numbers the tenant's own Twilio account already owns ──────────
  //
  // A BYO tenant arrives with Australian numbers it has already bought and already had
  // regulated. Before this, the only way one of them entered uprise was to buy ANOTHER –
  // real money on inventory the organisation holds, plus (for a regulated AU number) a fresh
  // bundle and days of human review at Twilio for no reason. Adoption registers what is
  // already there.

  /**
   * Register a tenant's own Twilio account WITHOUT provisioning anything.
   *
   * Adoption needs an accountId, but until now the only thing that created a BYO
   * TelephonyAccount was `startRun` – a full provisioning run that BUYS a number. So an
   * organisation that already owned numbers had to purchase one it did not need before it
   * could adopt the ones it did, which defeats the point of adopting.
   *
   * The credentials are verified against Twilio BEFORE they are stored. A token that does not
   * work is the single most likely thing to be wrong here, and finding out at connect time
   * beats finding out later inside an adopt call, where the failure would read as a problem
   * with the number rather than with the account. Verification uses the same listing the
   * adoptable-numbers view uses, so a successful connect also proves the account is readable.
   *
   * Idempotent on accountSid: re-connecting rotates the stored token in place rather than
   * failing, which is what an operator does after rotating credentials at Twilio.
   */
  async connectByoAccount(input: {
    tenantId: string;
    accountSid: string;
    authToken: string;
    region?: string;
    edge?: string;
    friendlyName?: string;
    scopeTenantId?: string;
  }) {
    if (input.scopeTenantId && input.scopeTenantId !== input.tenantId) {
      throw new ForbiddenException("You can only manage your own organisation's telephony");
    }
    const accountSid = input.accountSid.trim();
    const authToken = input.authToken.trim();
    if (!/^AC[0-9a-fA-F]{32}$/.test(accountSid)) {
      throw new ApiHttpException(
        "INVALID_TWILIO_SID",
        "An account SID must look like AC followed by 32 hex characters",
        400,
      );
    }
    if (!authToken) {
      throw new ApiHttpException("BYO_CREDENTIALS_REQUIRED", "An auth token is required", 400);
    }
    const extras = this.normaliseRegionEdge(input.region, input.edge);

    // A different tenant already holds this Twilio account. Refuse rather than move it: the
    // other organisation's numbers and sends resolve through it.
    const existing = await this.prisma.telephonyAccount.findUnique({ where: { accountSid } });
    if (existing && existing.tenantId !== input.tenantId) {
      throw new ApiHttpException(
        "ACCOUNT_HELD_BY_ANOTHER_TENANT",
        "That Twilio account is already connected to another organisation",
        409,
      );
    }

    // Prove the credentials work before persisting them. Anything other than a clean read is
    // surfaced as a credential problem, because that is what it almost always is.
    try {
      await this.twilio.listOwnedNumbers({
        accountSid,
        authToken,
        region: extras.region,
        edge: extras.edge,
      });
    } catch {
      throw new ApiHttpException(
        "TWILIO_CREDENTIALS_REJECTED",
        "Twilio rejected those credentials. Check the account SID and auth token, and that the token has not been rotated",
        422,
      );
    }

    const account = await this.prisma.telephonyAccount.upsert({
      where: { accountSid },
      create: {
        tenantId: input.tenantId,
        mode: TelephonyAccountMode.BYO,
        accountSid,
        encryptedAuthToken: this.crypto.encrypt(authToken),
        friendlyName: input.friendlyName?.trim() || `uprise ${input.tenantId}`,
        region: extras.region,
        edge: extras.edge,
        // Nothing to provision – the account exists and we have just read from it.
        status: TelephonyAccountStatus.ACTIVE,
      },
      update: {
        encryptedAuthToken: this.crypto.encrypt(authToken),
        // Region and edge move as ONE pair, matching startRun: a stated region replaces both
        // halves, an omitted one leaves the account as it was.
        ...(extras.region ? { region: extras.region, edge: extras.edge } : {}),
      },
    });
    this.senderResolver.invalidate(input.tenantId);
    return {
      accountId: account.id,
      accountSid: account.accountSid,
      tenantId: account.tenantId,
      status: account.status,
      region: account.region,
      edge: account.edge,
    };
  }

  /**
   * The private telephony pool, read from env. Absent (or half-filled) ⇒ null, and the sync
   * below becomes a no-op: this is an opt-in escape hatch for an organisation that arrives
   * holding its own Twilio account and its own numbers, not a path every tenant takes.
   */
  private privatePoolConfig(): {
    tenantSlug: string;
    accountSid: string;
    authToken: string;
    region?: string;
    edge?: string;
  } | null {
    const read = (key: string) => (this.config.get<string>(key) ?? "").trim();
    const tenantSlug = read("PRIVATE_TELEPHONY_TENANT_SLUG");
    const accountSid = read("PRIVATE_TELEPHONY_ACCOUNT_SID");
    const authToken = read("PRIVATE_TELEPHONY_AUTH_TOKEN");
    if (!tenantSlug || !accountSid || !authToken) return null;
    return {
      tenantSlug,
      accountSid,
      authToken,
      region: read("PRIVATE_TELEPHONY_REGION") || undefined,
      edge: read("PRIVATE_TELEPHONY_EDGE") || undefined,
    };
  }

  /**
   * Register an organisation's OWN Twilio account and every number on it as one
   * interchangeable pool, from env rather than from a provisioning run.
   *
   * This exists for the organisation that already has an account and a block of numbers it
   * uses elsewhere. Nothing is bought, nothing goes to Twilio's compliance review, and no
   * number is singled out – every usable one is registered, so sender resolution can pick any
   * of them and they stay interchangeable.
   *
   * Two things it deliberately does NOT do. It never claims a VOICE hook: the numbers on such
   * an account are usually carrying live traffic for the organisation's own systems, and
   * taking their voice configuration would break a running service. And it skips rather than
   * fails on a number it cannot use, because a pool is a set – one member uprise has no use
   * for is not a reason to register none of the others.
   */
  async syncPrivatePool(): Promise<
    | { configured: false }
    | {
        configured: true;
        tenantId: string;
        accountId: string;
        adopted: string[];
        alreadyHeld: string[];
        skipped: { phoneNumberE164: string; reason: string }[];
      }
  > {
    const cfg = this.privatePoolConfig();
    if (!cfg) return { configured: false };

    const tenant = await this.prisma.tenant.findUnique({ where: { slug: cfg.tenantSlug } });
    if (!tenant) {
      throw new ApiHttpException(
        "PRIVATE_POOL_TENANT_NOT_FOUND",
        `No tenant with slug "${cfg.tenantSlug}" – check PRIVATE_TELEPHONY_TENANT_SLUG`,
        404,
      );
    }

    const account = await this.connectByoAccount({
      tenantId: tenant.id,
      accountSid: cfg.accountSid,
      authToken: cfg.authToken,
      region: cfg.region,
      edge: cfg.edge,
      friendlyName: `${tenant.name} (private pool)`,
    });

    const candidates = await this.listAdoptableNumbers(account.accountId);
    const adopted: string[] = [];
    const alreadyHeld: string[] = [];
    const skipped: { phoneNumberE164: string; reason: string }[] = [];

    for (const candidate of candidates) {
      if (candidate.blockedReason === "ALREADY_ADOPTED") {
        alreadyHeld.push(candidate.phoneNumberE164);
        continue;
      }
      if (candidate.blockedReason) {
        skipped.push({ phoneNumberE164: candidate.phoneNumberE164, reason: candidate.blockedReason });
        continue;
      }
      try {
        await this.adoptNumber({
          accountId: account.accountId,
          phoneNumberSid: candidate.phoneNumberSid,
          // The pool is interchangeable, so a per-number nickname would be noise; the class
          // is what distinguishes them and it is already stored.
          claimSmsHook: true,
          claimVoiceHook: false,
        });
        adopted.push(candidate.phoneNumberE164);
      } catch (error) {
        // One number refusing adoption must not abandon the rest of the pool.
        skipped.push({
          phoneNumberE164: candidate.phoneNumberE164,
          reason: this.adoptionFailureReason(error),
        });
      }
    }

    return { configured: true, tenantId: tenant.id, accountId: account.accountId, adopted, alreadyHeld, skipped };
  }

  /** The machine-readable code behind a failed pool adoption, for the skipped-list. */
  private adoptionFailureReason(error: unknown): string {
    const response = (error as { response?: { error?: { code?: unknown } } })?.response;
    const code = response?.error?.code;
    return typeof code === "string" ? code : "ADOPTION_FAILED";
  }

  /**
   * The account an adoption call may act on, bound to the caller's tenant.
   *
   * Two guards beyond the tenant binding, both about what adoption MEANS. It only makes sense
   * for a BYO account – the numbers on a uprise-managed subaccount were bought by uprise and
   * already have their rows, so "adopting" one would be registering our own inventory a second
   * time. And a SUSPENDED or CLOSED account is deliberately not in service: adoption ends by
   * putting an account into ACTIVE, so allowing it here would make an adopt call a back door
   * that reinstates sending on an account somebody switched off.
   */
  private async accountForAdoption(accountId: string, scopeTenantId?: string) {
    const account = await this.prisma.telephonyAccount.findUnique({ where: { id: accountId } });
    if (!account) throw new NotFoundException("Telephony account not found");
    // A non-super-admin caller carries a scope; anything outside it is not theirs to see.
    // Phrased as a 403 rather than a 404 only because the id came from their own listing.
    if (scopeTenantId && account.tenantId !== scopeTenantId) {
      throw new ForbiddenException("You can only manage your own organisation's telephony");
    }
    if (account.mode !== TelephonyAccountMode.BYO) {
      throw new ApiHttpException(
        "ACCOUNT_NOT_BYO",
        "Numbers can only be adopted onto your own (bring-your-own) Twilio account – a uprise-managed account provisions its numbers instead",
        422,
      );
    }
    if (
      account.status !== TelephonyAccountStatus.ACTIVE &&
      account.status !== TelephonyAccountStatus.PROVISIONING
    ) {
      throw new ApiHttpException(
        "ACCOUNT_NOT_USABLE",
        "That telephony account isn't in service, so numbers can't be adopted onto it",
        422,
      );
    }
    return account;
  }

  /**
   * The regulation class of a number uprise did not buy – or the reason it cannot have one.
   *
   * The E.164 prefix is the ONLY thing that sets the class, and that is a hard rule rather
   * than a preference. The rest of uprise decides what a number may do from its prefix:
   * `isVoiceCapable` in `phone-capabilities.ts` refuses any +614 as a caller ID, and the voice
   * resolver, the dialler and the browser-call TwiML all enforce that by prefix. Only
   * `numberType` is consulted the other way round, by the sender resolver. So a row whose
   * `numberType` disagreed with its prefix would be one no path can use AND one the resolver
   * still hands out – e.g. a +614 written "local" joins the tenant's voice pool, can displace
   * their real +612, and then every call is refused downstream by prefix. The purchase path
   * could never produce that pairing; adoption must not either.
   *
   * Twilio's `capabilities` is therefore a VETO, not a second opinion on the class: a number
   * that cannot do the job its class implies is refused outright, because uprise has no other
   * job to give it. (In the real account every number reports both voice and SMS – an AU
   * mobile can carry both, since "local" is about geographic caller ID, not capability – so
   * the veto is the rare path, not the normal one.)
   */
  private classifyOwnedNumber(number: OwnedNumber): AdoptionClassification | UnusableNumberReason {
    const e164 = number.phoneNumberE164.trim();
    const numberType = /^\+614/.test(e164) ? "mobile" : /^\+61[2378]/.test(e164) ? "local" : null;
    // uprise's telephony is AU-regulated end to end (AU bundles, AU addresses, the +61
    // capability rules above). A number outside the plan has no class here, so it is refused
    // rather than guessed into the tenant's sending pool.
    if (!numberType) return "NUMBER_NOT_AUSTRALIAN";
    const { sms, voice } = number.capabilities;
    if (numberType === "mobile" ? !sms : !voice) return "NUMBER_NOT_USABLE";
    return { numberType, capabilities: number.capabilities };
  }

  /** The refusal for a number uprise can find no use for, worded for the operator. */
  private unusableNumber(reason: UnusableNumberReason): ApiHttpException {
    return new ApiHttpException(
      reason,
      reason === "NUMBER_NOT_AUSTRALIAN"
        ? "uprise can only use Australian numbers, so that one can't be adopted"
        : "Twilio reports that number can't do the job its number type implies, so uprise can't use it",
      422,
    );
  }

  /**
   * Is this hook already doing someone's work?
   *
   * Every field Twilio actually routes on counts, not just the primary URL: an application SID
   * overrides the URL, a SIP-trunk binding overrides voice routing entirely, and a fallback URL
   * takes the traffic whenever the primary errors. Twilio's own demo placeholder does not count
   * (Twilio put it there, not the organisation), nor does a URL that is already ours –
   * re-adopting a number uprise previously configured is not a conflict.
   */
  private hookOccupied(current: HookConfiguration): boolean {
    if (current.applicationSid || current.trunkSid) return true;
    return [current.url, current.fallbackUrl].some((url) => this.foreignHookUrl(url));
  }

  /** A URL on a hook that belongs to somebody other than uprise. */
  private foreignHookUrl(url: string | null): boolean {
    if (!url) return false;
    if (TWILIO_DEMO_HOOKS.some((demo) => url.startsWith(demo))) return false;
    const ours = this.apiBaseUrl();
    return !(ours && url.startsWith(ours));
  }

  private hookFor(number: OwnedNumber, hook: "sms" | "voice"): HookConfiguration {
    return hook === "voice"
      ? {
          url: number.voiceUrl,
          applicationSid: number.voiceApplicationSid,
          fallbackUrl: number.voiceFallbackUrl,
          trunkSid: number.trunkSid,
        }
      : {
          url: number.smsUrl,
          applicationSid: number.smsApplicationSid,
          fallbackUrl: number.smsFallbackUrl,
          // A trunk binds voice only, so it can never occupy the messaging hook.
          trunkSid: null,
        };
  }

  /**
   * The hook adoption would write for a number of this class, and what is on it now.
   *
   * The asymmetry the real account forces, encoded deliberately: adoption only ever touches
   * the hook for the class it is adopting the number AS. A +614 mobile is adopted for
   * messaging, so only its SMS hook is in play and the organisation's existing VOICE
   * configuration – an external autodialer URL and TwiML application SIDs, a running
   * production system – is never a candidate for overwrite, not even by mistake. In that
   * account messaging is unconfigured on every number (the console offers "Set up" against a
   * blank messaging hook), so the SMS hook is free and adoption simply claims it, while a
   * voice hook is occupied and needs an operator to say so explicitly.
   */
  private plannedHook(number: OwnedNumber, numberType: "mobile" | "local"): AdoptionHookReport {
    const hook = numberType === "local" ? "voice" : "sms";
    const existing = this.hookFor(number, hook);
    return { hook, action: this.hookOccupied(existing) ? "left-in-place" : "claimed", existing };
  }

  /**
   * Claim the class's inbound hook, unless something is already on it and the caller has not
   * explicitly asked to take it over. Default is NEVER overwrite: silently replacing a
   * working configuration would break whatever the organisation is running today, and the
   * number would keep answering – just to us.
   *
   * The two classes part company when the hook is occupied and no opt-in was given, and the
   * asymmetry is deliberate. A LOCAL number is adopted to be an outbound caller ID; its
   * inbound hook is not load-bearing for uprise (all it would do is answer with a spoken
   * apology – see `inboundVoiceUrl`), so the organisation's own configuration simply wins and
   * adoption proceeds. A MOBILE is adopted to SEND MARKETING, and uprise's only opt-out
   * capture is the inbound SMS hook: STOP arrives there, `InboxService` records it, and every
   * blast is gated on that state. Adopting a messaging number whose inbound goes to somebody
   * else would make the tenant a live blast sender that can never see a STOP – an unsubscribe
   * failure under the Spam Act, not an inconvenience – so it is refused instead.
   */
  private async claimAdoptionHook(
    creds: TwilioCreds,
    number: OwnedNumber,
    numberType: "mobile" | "local",
    opts: { claimSmsHook?: boolean; claimVoiceHook?: boolean },
  ): Promise<AdoptionHookReport> {
    const planned = this.plannedHook(number, numberType);
    // Each hook has its OWN opt-in, and only the hook of the class being adopted is in play –
    // a voice opt-in can never authorise writing over somebody's messaging configuration.
    const optedIn = planned.hook === "voice" ? opts.claimVoiceHook === true : opts.claimSmsHook === true;
    if (planned.action === "left-in-place" && !optedIn) {
      if (planned.hook === "sms") {
        throw new ApiHttpException(
          "SMS_HOOK_OCCUPIED",
          "That number's inbound messaging already goes somewhere else, so uprise could never see a STOP reply from it. Clear the messaging webhook at Twilio, or re-send with claimSmsHook to point it at uprise.",
          422,
        );
      }
      return planned;
    }
    await this.twilio.configureNumberWebhook(creds, number.phoneNumberSid, this.adoptionWebhooks(numberType));
    return { ...planned, action: planned.action === "left-in-place" ? "taken-over" : "claimed" };
  }

  /**
   * The hook to write when adopting. Same URL as a provisioned number of this class, plus a
   * clear of everything else Twilio routes on ON THAT HOOK ONLY: an application SID overrides
   * the URL, a trunk overrides voice routing, and a surviving fallback URL would keep sending
   * the organisation traffic every time our endpoint errored. Writing the URL alone would
   * leave the callback going to the old destination and uprise would never receive it. The
   * other class's configuration is left untouched.
   */
  private adoptionWebhooks(numberType: "mobile" | "local"): NumberWebhooks {
    const base = this.numberWebhooks(numberType);
    return "voiceUrl" in base
      ? { ...base, voiceApplicationSid: "", voiceFallbackUrl: "", trunkSid: "" }
      : { ...base, smsApplicationSid: "", smsFallbackUrl: "" };
  }

  /**
   * Put a hook back exactly as it was. The compensating write for an adoption that touched
   * Twilio and then failed to land its row – without it the number is left pointing at uprise
   * (or, on a take-over, with the organisation's live configuration destroyed) and nothing in
   * the database says why. `""` is Twilio's unset, so a field that was empty stays empty.
   */
  private restoreWebhooks(report: AdoptionHookReport): NumberWebhooks {
    const { url, applicationSid, fallbackUrl, trunkSid } = report.existing;
    return report.hook === "voice"
      ? {
          voiceUrl: url ?? "",
          voiceMethod: "POST",
          voiceApplicationSid: applicationSid ?? "",
          voiceFallbackUrl: fallbackUrl ?? "",
          trunkSid: trunkSid ?? "",
        }
      : {
          smsUrl: url ?? "",
          smsMethod: "POST",
          smsApplicationSid: applicationSid ?? "",
          smsFallbackUrl: fallbackUrl ?? "",
        };
  }

  /**
   * Undo the Twilio write when the row could not be created. Best-effort by necessity – if
   * the restore itself fails there is nothing further to try – but it is logged so an operator
   * can repair it by hand. No Twilio identifiers go into the log line.
   */
  private async rollbackAdoptionHook(
    creds: TwilioCreds,
    number: OwnedNumber,
    report: AdoptionHookReport,
    accountId: string,
  ): Promise<void> {
    if (report.action === "left-in-place") return;
    try {
      await this.twilio.configureNumberWebhook(creds, number.phoneNumberSid, this.restoreWebhooks(report));
    } catch (error) {
      this.logger.error("telephony", "Could not restore an adopted number's inbound hook", undefined, {
        accountId,
        hook: report.hook,
        error: String(error),
      });
    }
  }

  /** The clean refusal for a number some `TelephonyPhoneNumber` row already holds. */
  private duplicateAdoption(existingTenantId: string, tenantId: string): ApiHttpException {
    return existingTenantId === tenantId
      ? new ApiHttpException(
          "NUMBER_ALREADY_ADOPTED",
          "That number is already registered to your organisation on uprise",
          409,
        )
      : new ApiHttpException(
          "NUMBER_ADOPTED_BY_ANOTHER_TENANT",
          "That number is already registered to another organisation on uprise",
          409,
        );
  }

  /**
   * What "uprise already holds this number" MEANS – one definition, used by both the listing
   * and the adopt call. Either unique column counts: a row that carries the SID under a
   * different E.164 (a number reassigned at Twilio) is still that number's row, and matching
   * on only one column would let the listing offer something the adopt call then rejects.
   */
  private heldNumberFilter(numbers: Array<{ phoneNumberE164: string; phoneNumberSid: string }>) {
    return {
      OR: [
        { phoneNumberE164: { in: numbers.map((n) => n.phoneNumberE164) } },
        { phoneNumberSid: { in: numbers.map((n) => n.phoneNumberSid) } },
      ],
    };
  }

  /** Any `TelephonyPhoneNumber` row holding this number, by either unique column. */
  private async existingRowFor(number: { phoneNumberE164: string; phoneNumberSid: string }) {
    return this.prisma.telephonyPhoneNumber.findFirst({ where: this.heldNumberFilter([number]) });
  }

  /**
   * Everything the account already owns, annotated with whether uprise can adopt it, how it
   * would be classed, and what is already on the hook adoption would write. Read-only – it
   * changes nothing at Twilio.
   */
  async listAdoptableNumbers(accountId: string, scopeTenantId?: string): Promise<AdoptableNumber[]> {
    const account = await this.accountForAdoption(accountId, scopeTenantId);
    const creds = await this.accountCreds(account.id);
    const owned = await this.twilio.listOwnedNumbers(creds);
    if (owned.length === 0) return [];

    const existing = await this.prisma.telephonyPhoneNumber.findMany({
      where: this.heldNumberFilter(owned),
    });

    return owned.map((number) => {
      const classified = this.classifyOwnedNumber(number);
      const classification = typeof classified === "string" ? null : classified;
      // A number uprise can find no use for is listed but not offered – the operator should
      // see that it is there, and see why it is not a candidate.
      let blockedReason: AdoptionBlockedReason | null = typeof classified === "string" ? classified : null;
      const taken = existing.find(
        (row) =>
          row.phoneNumberE164 === number.phoneNumberE164 || row.phoneNumberSid === number.phoneNumberSid,
      );
      if (taken) {
        blockedReason = taken.tenantId === account.tenantId ? "ALREADY_ADOPTED" : "ADOPTED_BY_ANOTHER_TENANT";
      }
      return {
        ...number,
        classification,
        blockedReason,
        hook: this.plannedHook(number, classification?.numberType ?? "mobile"),
      };
    });
  }

  /**
   * Register a number the account already owns against the tenant.
   *
   * Ownership is verified against Twilio under the ACCOUNT's own credentials rather than
   * taken from the request, so a caller cannot attach a SID belonging to someone else. The
   * row lands ACTIVE: unlike a purchase there is nothing to wait for – the number exists and
   * works – and it can only get that far once uprise holds the inbound hook that matters for
   * its class, which is the same invariant `stepActivate` enforces on the purchase path.
   *
   * The row and the account flip are one transaction, and a Twilio write that has already
   * happened is rolled back if that transaction fails: an adoption either lands completely or
   * leaves the number as it found it.
   */
  async adoptNumber(input: AdoptNumberInput) {
    const account = await this.accountForAdoption(input.accountId, input.scopeTenantId);
    const tenantId = account.tenantId;
    const creds = await this.accountCreds(account.id);

    const owned = await this.twilio.fetchOwnedNumber(creds, input.phoneNumberSid);
    if (!owned) {
      throw new ApiHttpException(
        "NUMBER_NOT_ON_ACCOUNT",
        "That number isn't on this Twilio account, so it can't be adopted",
        422,
      );
    }
    const classified = this.classifyOwnedNumber(owned);
    if (typeof classified === "string") throw this.unusableNumber(classified);
    const classification = classified;

    // Checked BEFORE anything is written to Twilio, so a duplicate cannot reconfigure a hook
    // on the way to failing. `phoneNumberE164` is UNIQUE across all tenants, so this is the
    // cross-tenant case too – and it fails with a code, never a raw Prisma constraint error.
    const clash = await this.existingRowFor(owned);
    if (clash) throw this.duplicateAdoption(clash.tenantId, tenantId);

    const hook = await this.claimAdoptionHook(creds, owned, classification.numberType, input);

    const nickname = input.nickname?.trim();
    let number;
    try {
      // One transaction, matching the purchase path: `stepPurchaseNumber`/`stepActivate` write
      // the row and the account flip together. Split apart, a crash between them leaves an
      // ACTIVE number under a PROVISIONING account – which the sender resolver cannot resolve,
      // and which nothing would ever retry.
      number = await this.prisma.$transaction(async (tx) => {
        const created = await tx.telephonyPhoneNumber.create({
          data: {
            tenantId,
            accountId: account.id,
            phoneNumberE164: owned.phoneNumberE164,
            phoneNumberSid: owned.phoneNumberSid,
            // No bundle and no address: the organisation regulated this number on its own
            // account, and uprise holds no compliance artefacts for it. Left null rather than
            // guessed – bundle reuse matches on a bundle uprise actually knows.
            bundleSid: null,
            addressSid: null,
            nickname: nickname ? nickname : null,
            numberType: classification.numberType,
            // Same rule as a purchase: a local number is the voice caller ID and "voice"
            // matches no SendPurpose, so the sender resolver can never pick it for a text.
            purpose: classification.numberType === "local" ? "voice" : "marketing",
            status: TelephonyNumberStatus.ACTIVE,
          },
        });
        // A BYO account still waiting on its first number is in use the moment it holds one,
        // and the sender resolver only resolves through an ACTIVE account. Narrowed to exactly
        // that transition: SUSPENDED/CLOSED are refused upstream in `accountForAdoption`
        // rather than quietly reinstated here.
        if (account.status === TelephonyAccountStatus.PROVISIONING) {
          await tx.telephonyAccount.update({
            where: { id: account.id },
            data: { status: TelephonyAccountStatus.ACTIVE },
          });
        }
        return created;
      });
    } catch (error) {
      // Nothing landed, so the hook we repointed at uprise has to go back – otherwise the
      // number answers to uprise with no row to explain it (and, after a take-over, the
      // organisation's own configuration is gone with nothing recording that it ever existed).
      await this.rollbackAdoptionHook(creds, owned, hook, account.id);
      // A concurrent adoption of the same number lands here on the UNIQUE index. Re-read to
      // report the same clean codes rather than leaking P2002 to the client.
      if ((error as { code?: string }).code === "P2002") {
        const raced = await this.existingRowFor(owned);
        throw this.duplicateAdoption(raced?.tenantId ?? tenantId, tenantId);
      }
      throw error;
    }

    this.senderResolver.invalidate(tenantId);
    return { number, classification, hook };
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
