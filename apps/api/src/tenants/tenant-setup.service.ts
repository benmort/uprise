import { Injectable } from "@nestjs/common";
import {
  EmailProvisioningRequestStatus,
  EmailProvisioningStatus,
  TelephonyNumberStatus,
  TelephonyProvisioningStatus,
} from "@uprise/db";
import {
  evaluateOrgSetup,
  type ChannelSetupState,
  type ChannelSetupStep,
  type SetupGate,
  type SetupStep,
  type SetupStepStatus,
  type TenantSetupState,
} from "@uprise/contracts";
import { PrismaService } from "../prisma/prisma.service";
import { FeatureFlagsService } from "../common/flags/feature-flags.service";
import type { AuthUser } from "../auth/auth-user";

/**
 * Server-computed, role-aware setup state — the successor to the flat onboarding
 * checklist. Pure derivation over the org profile, provisioning runs, channel rows
 * and the caller's own account; the only persisted piece it reads is the legacy
 * Tenant.onboarding JSON (for `dismissed`). One call, one bounded Promise.all.
 */
@Injectable()
export class TenantSetupService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly flags: FeatureFlagsService,
  ) {}

  async getSetupState(tenantId: string, actor: AuthUser): Promise<TenantSetupState> {
    const ownerView = actor.role === "OWNER" || actor.isSuperAdmin === true;

    const [user, profile, orgProfile, telRun, telNumber, emailIdentity, emailRun, emailRequest, tenant, flags] =
      await Promise.all([
        this.prisma.user.findUnique({
          where: { id: actor.id },
          select: { emailVerified: true, mobileVerified: true, twofaEnabled: true, displayName: true },
        }),
        this.prisma.userProfile.findUnique({
          where: { userId: actor.id },
          select: { displayName: true, avatarUrl: true },
        }),
        this.prisma.orgProfile.findFirst({
          where: { tenantId },
          select: {
            name: true,
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
            addresses: { select: { line1: true, suburb: true, city: true, state: true, postcode: true } },
          },
        }),
        this.prisma.telephonyProvisioningRun.findFirst({
          where: { tenantId },
          orderBy: { createdAt: "desc" },
          select: { status: true, lastError: true },
        }),
        this.prisma.telephonyPhoneNumber.findFirst({
          where: { tenantId, status: TelephonyNumberStatus.ACTIVE },
          select: { id: true },
        }),
        this.prisma.emailSenderIdentity.findFirst({
          where: { tenantId, status: "ACTIVE" },
          select: { id: true },
        }),
        this.prisma.emailProvisioningRun.findFirst({
          where: { tenantId },
          orderBy: { createdAt: "desc" },
          select: { status: true },
        }),
        this.prisma.emailProvisioningRequest.findFirst({
          where: { tenantId, status: EmailProvisioningRequestStatus.OPEN },
          select: { id: true },
        }),
        this.prisma.tenant.findUnique({ where: { id: tenantId }, select: { onboarding: true } }),
        this.flags.resolveAll({ tenantId }),
      ]);

    // ── Identity setup (every admin role; REQUIRED — who you sign in as) ──────
    const identitySteps: SetupStep[] = [
      { key: "verifyEmail", status: user?.emailVerified ? "done" : "todo" },
      { key: "confirmMobile", status: user?.mobileVerified ? "done" : "todo" },
    ];
    const identityComplete = Boolean(user?.emailVerified && user?.mobileVerified);

    // ── Organisation setup (owner view only) ──────────────────────────────────
    const org = evaluateOrgSetup({
      profile: orgProfile
        ? {
            name: orgProfile.name,
            logoBlockUrl: orgProfile.logoBlockUrl,
            logoLandscapeUrl: orgProfile.logoLandscapeUrl,
            primaryColour: orgProfile.primaryColour,
            secondaryColour: orgProfile.secondaryColour,
            heroImageUrl: orgProfile.heroImageUrl,
          }
        : null,
      credential: orgProfile?.credential ?? null,
      contacts: orgProfile?.contacts ?? [],
      addresses: orgProfile?.addresses ?? [],
    });
    const required = (done: boolean): SetupStepStatus => (done ? "done" : "todo");
    const orgSteps: SetupStep[] = [
      { key: "orgIdentity", status: required(org.steps.orgIdentity) },
      { key: "businessLegal", status: required(org.steps.businessLegal) },
      { key: "contacts", status: required(org.steps.contacts) },
      { key: "address", status: required(org.steps.address) },
    ];
    const orgComplete =
      org.steps.orgIdentity && org.steps.businessLegal && org.steps.contacts && org.steps.address;

    // ── Account setup (recommended polish — never blocks completion) ──────────
    // branding lives here rather than under Organisation: it's an extra, and the
    // settings route is owner-only, so organisers don't get the step at all.
    const displayName = profile?.displayName?.trim() || user?.displayName?.trim() || "";
    const profileDone = Boolean(displayName && profile?.avatarUrl?.trim());
    const recommended = (done: boolean): SetupStepStatus => (done ? "done" : "recommended");
    const accountSteps: SetupStep[] = [
      { key: "enableTwofa", status: recommended(Boolean(user?.twofaEnabled)) },
      { key: "completeProfile", status: recommended(profileDone) },
      ...(ownerView ? [{ key: "branding", status: recommended(org.steps.branding) } as SetupStep] : []),
    ];
    const accountComplete = accountSteps.every((s) => s.status === "done");

    // ── Channels (owner view; per-step plan locks) ────────────────────────────
    const telFlagOn = Boolean(flags.FEATURE_TENANT_TELEPHONY_ENABLED);
    const emailFlagOn = Boolean(flags.FEATURE_TENANT_EMAIL_ENABLED);
    // The own-channels setup UX (Channels flow + the unlock tile) is its own plan-driven
    // toggle: growth/scale ON by default, grassroots/starter OFF, tenant-overridable.
    const ownChannelsOn = Boolean(flags.FEATURE_OWN_CHANNELS_SETUP);

    let phoneState: ChannelSetupState = "none";
    let phoneReason: string | null = null;
    if (telNumber) {
      phoneState = "active";
    } else if (telRun?.status === TelephonyProvisioningStatus.COMPLIANCE_REJECTED) {
      phoneState = "action_required";
      phoneReason =
        telRun.lastError?.trim() ||
        "Compliance was rejected — update your business details and resubmit.";
    } else if (telRun?.status === TelephonyProvisioningStatus.FAILED) {
      phoneState = "failed";
    } else if (telRun && telRun.status !== TelephonyProvisioningStatus.ACTIVE) {
      phoneState = "in_progress";
    }

    let emailState: ChannelSetupState = "none";
    if (emailIdentity) {
      emailState = "active";
    } else if (emailRun?.status === EmailProvisioningStatus.FAILED) {
      emailState = "failed";
    } else if (emailRun && emailRun.status !== EmailProvisioningStatus.ACTIVE) {
      emailState = "in_progress";
    } else if (emailRequest) {
      emailState = "requested";
    }

    const channelStatus = (state: ChannelSetupState): SetupStepStatus =>
      state === "active" ? "done" : "todo";
    const channelSteps: ChannelSetupStep[] = [
      {
        key: "phoneNumber",
        status: channelStatus(phoneState),
        state: phoneState,
        planLocked: !telFlagOn,
        reason: phoneReason,
      },
      {
        key: "emailIdentity",
        status: channelStatus(emailState),
        state: emailState,
        planLocked: !emailFlagOn,
        reason: null,
      },
    ];
    const channelsComplete = channelSteps.filter((s) => !s.planLocked).every((s) => s.state === "active");

    // ── Gates (server truth; the UI mirrors these on the locked controls) ─────
    const canProvisionTelephony: SetupGate = !telFlagOn
      ? { allowed: false, reason: "PLAN_UPGRADE_REQUIRED" }
      : !org.provisionReady
        ? { allowed: false, reason: "SETUP_INCOMPLETE", missing: org.missing }
        : { allowed: true };
    const canRequestEmail: SetupGate = !emailFlagOn
      ? { allowed: false, reason: "PLAN_UPGRADE_REQUIRED" }
      : emailRequest
        ? { allowed: false, reason: "OPEN_REQUEST" }
        : { allowed: true };

    // Legacy advisory JSON carries only dismissed/updatedAt for the new surface.
    const onboarding = (tenant?.onboarding ?? null) as { dismissed?: boolean; updatedAt?: string } | null;

    return {
      flows: {
        identity: { steps: identitySteps, complete: identityComplete },
        account: { steps: accountSteps, complete: accountComplete },
        organisation: { applicable: ownerView, steps: orgSteps, complete: orgComplete },
        channels: { applicable: ownerView && ownChannelsOn, steps: channelSteps, complete: channelsComplete },
      },
      gates: { canProvisionTelephony, canRequestEmail },
      dismissed: Boolean(onboarding?.dismissed),
      updatedAt: onboarding?.updatedAt ?? null,
    };
  }
}
