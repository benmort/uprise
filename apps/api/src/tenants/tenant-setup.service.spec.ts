import { AppUserRole } from "@uprise/db";
import { TenantSetupService } from "./tenant-setup.service";
import type { AuthUser } from "../auth/auth-user";

const OWNER: AuthUser = { id: "u1", role: AppUserRole.OWNER, tenantId: "t1", roles: ["owner"], isSuperAdmin: false };
const ORGANISER: AuthUser = { id: "u1", role: AppUserRole.ORGANISER, tenantId: "t1", roles: ["organiser"], isSuperAdmin: false };
const SUPER: AuthUser = { id: "u1", role: AppUserRole.ORGANISER, tenantId: "t1", roles: [], isSuperAdmin: true };

function completeOrgProfile() {
  return {
    name: "Acme",
    logoBlockUrl: "https://cdn/logo.png",
    logoLandscapeUrl: null,
    primaryColour: "#465fff",
    secondaryColour: "#123456",
    heroImageUrl: "https://cdn/hero.jpg",
    credential: {
      legalTradingName: "Acme Incorporated",
      australianBusinessNumber: "12345678901",
      australianCompanyNumber: null,
      entityType: "incorporated_association",
    },
    contacts: [
      { firstName: "Pat", lastName: "Chair", email: "pat@acme.org", isPrimaryContact: true, isAuthorisedSignatory: true },
    ],
    addresses: [{ line1: "1 Main St", suburb: "Newtown", city: null, state: "NSW", postcode: "2042" }],
  };
}

function setup(over: {
  user?: Record<string, unknown> | null;
  profile?: Record<string, unknown> | null;
  orgProfile?: Record<string, unknown> | null;
  telRun?: Record<string, unknown> | null;
  telNumber?: Record<string, unknown> | null;
  emailIdentity?: Record<string, unknown> | null;
  emailRun?: Record<string, unknown> | null;
  emailRequest?: Record<string, unknown> | null;
  onboarding?: Record<string, unknown> | null;
  flags?: Record<string, boolean>;
} = {}) {
  const prisma: any = {
    user: {
      findUnique: jest.fn(async () =>
        over.user === null
          ? null
          : { emailVerified: true, mobileVerified: false, twofaEnabled: false, displayName: "Alex", ...over.user },
      ),
    },
    userProfile: {
      findUnique: jest.fn(async () =>
        over.profile === undefined ? { displayName: "Alex", avatarUrl: "https://cdn/a.png" } : over.profile,
      ),
    },
    orgProfile: {
      findFirst: jest.fn(async () => (over.orgProfile === undefined ? completeOrgProfile() : over.orgProfile)),
    },
    telephonyProvisioningRun: { findFirst: jest.fn(async () => over.telRun ?? null) },
    telephonyPhoneNumber: { findFirst: jest.fn(async () => over.telNumber ?? null) },
    emailSenderIdentity: { findFirst: jest.fn(async () => over.emailIdentity ?? null) },
    emailProvisioningRun: { findFirst: jest.fn(async () => over.emailRun ?? null) },
    emailProvisioningRequest: { findFirst: jest.fn(async () => over.emailRequest ?? null) },
    tenant: { findUnique: jest.fn(async () => ({ onboarding: over.onboarding ?? null })) },
  };
  const flags: any = {
    resolveAll: jest.fn(async () => ({
      FEATURE_TENANT_TELEPHONY_ENABLED: true,
      FEATURE_TENANT_EMAIL_ENABLED: true,
      ...over.flags,
    })),
  };
  return { service: new TenantSetupService(prisma, flags), prisma, flags };
}

const stepOf = (steps: Array<{ key: string }>, key: string) => steps.find((s) => s.key === key) as any;

describe("TenantSetupService", () => {
  describe("identity + account flows", () => {
    it("identity requires BOTH verified email and mobile", async () => {
      const { service } = setup({ user: { emailVerified: true, mobileVerified: false, twofaEnabled: false } });
      const state = await service.getSetupState("t1", OWNER);
      expect(stepOf(state.flows.identity.steps, "verifyEmail").status).toBe("done");
      expect(stepOf(state.flows.identity.steps, "confirmMobile").status).toBe("todo");
      expect(state.flows.identity.complete).toBe(false);
      // Account polish stays recommended and non-blocking.
      expect(stepOf(state.flows.account.steps, "enableTwofa").status).toBe("recommended");
      expect(stepOf(state.flows.account.steps, "completeProfile").status).toBe("done");
    });

    it("identity completes with email + mobile; account tracks 2FA + profile", async () => {
      const { service } = setup({ user: { emailVerified: true, mobileVerified: true, twofaEnabled: true } });
      const state = await service.getSetupState("t1", ORGANISER);
      expect(state.flows.identity.complete).toBe(true);
      expect(state.flows.account.complete).toBe(true);
    });

    it("branding is an owner-only account step, recommended until done", async () => {
      const owner = await setup({ orgProfile: { ...completeOrgProfile(), heroImageUrl: null } })
        .service.getSetupState("t1", OWNER);
      expect(stepOf(owner.flows.account.steps, "branding").status).toBe("recommended");

      const organiser = await setup().service.getSetupState("t1", ORGANISER);
      expect(stepOf(organiser.flows.account.steps, "branding")).toBeUndefined();
    });
  });

  describe("role layering", () => {
    it("organiser: organisation + channels flows are not applicable", async () => {
      const { service } = setup();
      const state = await service.getSetupState("t1", ORGANISER);
      expect(state.flows.organisation.applicable).toBe(false);
      expect(state.flows.channels.applicable).toBe(false);
    });

    it("owner and super-admin see organisation + channels", async () => {
      const { service } = setup();
      for (const actor of [OWNER, SUPER]) {
        const state = await service.getSetupState("t1", actor);
        expect(state.flows.organisation.applicable).toBe(true);
        expect(state.flows.channels.applicable).toBe(true);
      }
    });
  });

  describe("organisation flow", () => {
    it("a fresh tenant (no org profile) has every required step todo and the gate closed", async () => {
      const { service } = setup({ orgProfile: null });
      const state = await service.getSetupState("t1", OWNER);
      for (const key of ["orgIdentity", "businessLegal", "contacts", "address"]) {
        expect(stepOf(state.flows.organisation.steps, key).status).toBe("todo");
      }
      expect(state.flows.organisation.complete).toBe(false);
      expect(state.gates.canProvisionTelephony).toMatchObject({
        allowed: false,
        reason: "SETUP_INCOMPLETE",
      });
      expect(state.gates.canProvisionTelephony.missing!.length).toBeGreaterThan(0);
    });

    it("a complete org profile completes the flow and opens the gate; branding lives under account", async () => {
      const { service } = setup();
      const state = await service.getSetupState("t1", OWNER);
      expect(state.flows.organisation.complete).toBe(true);
      expect(stepOf(state.flows.organisation.steps, "branding")).toBeUndefined();
      expect(stepOf(state.flows.account.steps, "branding").status).toBe("done");
      expect(state.gates.canProvisionTelephony).toEqual({ allowed: true });
    });
  });

  describe("channel states", () => {
    it("ACTIVE number → active/done", async () => {
      const { service } = setup({ telNumber: { id: "n1" } });
      const state = await service.getSetupState("t1", OWNER);
      const step = stepOf(state.flows.channels.steps, "phoneNumber");
      expect(step.state).toBe("active");
      expect(step.status).toBe("done");
    });

    it("COMPLIANCE_REJECTED run → action_required with a reason", async () => {
      const { service } = setup({ telRun: { status: "COMPLIANCE_REJECTED", lastError: "ABN mismatch" } });
      const state = await service.getSetupState("t1", OWNER);
      const step = stepOf(state.flows.channels.steps, "phoneNumber");
      expect(step.state).toBe("action_required");
      expect(step.reason).toBe("ABN mismatch");
    });

    it("FAILED run → failed; non-terminal run → in_progress", async () => {
      const failed = await setup({ telRun: { status: "FAILED", lastError: null } })
        .service.getSetupState("t1", OWNER);
      expect(stepOf(failed.flows.channels.steps, "phoneNumber").state).toBe("failed");

      const inflight = await setup({ telRun: { status: "COMPLIANCE_SUBMITTED", lastError: null } })
        .service.getSetupState("t1", OWNER);
      expect(stepOf(inflight.flows.channels.steps, "phoneNumber").state).toBe("in_progress");
    });

    it("email: OPEN request → requested; ACTIVE identity beats everything", async () => {
      const requested = await setup({ emailRequest: { id: "req1" } }).service.getSetupState("t1", OWNER);
      expect(stepOf(requested.flows.channels.steps, "emailIdentity").state).toBe("requested");

      const active = await setup({ emailIdentity: { id: "id1" }, emailRequest: { id: "req1" } })
        .service.getSetupState("t1", OWNER);
      expect(stepOf(active.flows.channels.steps, "emailIdentity").state).toBe("active");
    });

    it("channels complete when every non-plan-locked step is active", async () => {
      const { service } = setup({
        telNumber: { id: "n1" },
        flags: { FEATURE_TENANT_EMAIL_ENABLED: false },
      });
      const state = await service.getSetupState("t1", OWNER);
      expect(stepOf(state.flows.channels.steps, "emailIdentity").planLocked).toBe(true);
      expect(state.flows.channels.complete).toBe(true); // email is plan-locked, phone active
    });
  });

  describe("plan gating", () => {
    it("grassroots (flags off): steps plan-locked, gates PLAN_UPGRADE_REQUIRED", async () => {
      const { service } = setup({
        flags: { FEATURE_TENANT_TELEPHONY_ENABLED: false, FEATURE_TENANT_EMAIL_ENABLED: false },
      });
      const state = await service.getSetupState("t1", OWNER);
      expect(stepOf(state.flows.channels.steps, "phoneNumber").planLocked).toBe(true);
      expect(state.gates.canProvisionTelephony).toMatchObject({ allowed: false, reason: "PLAN_UPGRADE_REQUIRED" });
      expect(state.gates.canRequestEmail).toMatchObject({ allowed: false, reason: "PLAN_UPGRADE_REQUIRED" });
    });

    it("an open email request closes the request gate with OPEN_REQUEST", async () => {
      const { service } = setup({ emailRequest: { id: "req1" } });
      const state = await service.getSetupState("t1", OWNER);
      expect(state.gates.canRequestEmail).toMatchObject({ allowed: false, reason: "OPEN_REQUEST" });
    });
  });

  it("reads dismissed/updatedAt from the legacy onboarding JSON", async () => {
    const { service } = setup({ onboarding: { dismissed: true, updatedAt: "2026-07-01T00:00:00Z" } });
    const state = await service.getSetupState("t1", OWNER);
    expect(state.dismissed).toBe(true);
    expect(state.updatedAt).toBe("2026-07-01T00:00:00Z");
  });
});
