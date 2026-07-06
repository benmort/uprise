import { beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("@uprise/api-client", () => ({
  orgProfile: { get: vi.fn() },
  tenants: { listMembers: vi.fn(), listInvitations: vi.fn() },
}));
vi.mock("@/lib/api", () => ({
  getRecentBlasts: vi.fn(),
  listAudiences: vi.fn(),
}));

import { orgProfile, tenants } from "@uprise/api-client";
import { getRecentBlasts, listAudiences } from "@/lib/api";
import { deriveOnboardingSteps, newlyCompleted, ONBOARDING_STEPS } from "./onboarding";

const ok = <T,>(data: T) => ({ ok: true as const, data });
const fail = () => ({ ok: false as const, error: "nope" });

const mocks = {
  get: vi.mocked(orgProfile.get),
  listMembers: vi.mocked(tenants.listMembers),
  listInvitations: vi.mocked(tenants.listInvitations),
  getRecentBlasts: vi.mocked(getRecentBlasts),
  listAudiences: vi.mocked(listAudiences),
};

/** Point every signal at "complete" so a test can flip one at a time. */
function allComplete() {
  mocks.get.mockResolvedValue(
    ok({ name: "Org", logoBlockUrl: "u", logoLandscapeUrl: null, primaryColour: "#123" }) as any,
  );
  mocks.listMembers.mockResolvedValue(ok([{ id: "a" }, { id: "b" }]) as any);
  mocks.listInvitations.mockResolvedValue(ok([]) as any);
  mocks.listAudiences.mockResolvedValue(ok({ total: 3 }) as any);
  mocks.getRecentBlasts.mockResolvedValue(ok([{ id: "b1" }]) as any);
}

beforeEach(() => vi.clearAllMocks());

describe("ONBOARDING_STEPS", () => {
  it("declares the five steps in display order with unique keys", () => {
    expect(ONBOARDING_STEPS.map((s) => s.key)).toEqual([
      "verifyEmail",
      "orgProfile",
      "inviteTeammate",
      "connectAudience",
      "firstCampaign",
    ]);
    for (const step of ONBOARDING_STEPS) {
      expect(step.title).toBeTruthy();
      expect(step.href).toMatch(/^\//);
      expect(step.cta).toBeTruthy();
    }
  });
});

describe("deriveOnboardingSteps", () => {
  it("marks every step done when all signals are complete and email is verified", async () => {
    allComplete();
    const steps = await deriveOnboardingSteps("t1", { emailVerified: true });
    expect(steps).toEqual({
      verifyEmail: true,
      orgProfile: true,
      inviteTeammate: true,
      connectAudience: true,
      firstCampaign: true,
    });
    expect(mocks.listMembers).toHaveBeenCalledWith("t1");
  });

  it("treats failed / forbidden calls (and unverified email) as not-done", async () => {
    mocks.get.mockResolvedValue(fail() as any);
    mocks.listMembers.mockRejectedValue(new Error("403"));
    mocks.listInvitations.mockRejectedValue(new Error("403"));
    mocks.listAudiences.mockResolvedValue(fail() as any);
    mocks.getRecentBlasts.mockResolvedValue(fail() as any);

    const steps = await deriveOnboardingSteps("t1", { emailVerified: false });
    expect(steps).toEqual({
      verifyEmail: false,
      orgProfile: false,
      inviteTeammate: false,
      connectAudience: false,
      firstCampaign: false,
    });
  });

  it("verifyEmail follows the session principal, not any API call", async () => {
    allComplete();
    expect((await deriveOnboardingSteps("t1", null)).verifyEmail).toBe(false);
    expect((await deriveOnboardingSteps("t1", { emailVerified: true })).verifyEmail).toBe(true);
  });

  it("orgProfile requires a name, a logo AND a primary colour", async () => {
    allComplete();
    mocks.get.mockResolvedValue(
      ok({ name: "Org", logoBlockUrl: null, logoLandscapeUrl: null, primaryColour: "#123" }) as any,
    );
    expect((await deriveOnboardingSteps("t1", null)).orgProfile).toBe(false);
  });

  it("inviteTeammate is met by a pending invitation even with a solo membership", async () => {
    allComplete();
    mocks.listMembers.mockResolvedValue(ok([{ id: "solo" }]) as any); // length 1 → not enough alone
    mocks.listInvitations.mockResolvedValue(ok([{ id: "inv1" }]) as any);
    expect((await deriveOnboardingSteps("t1", null)).inviteTeammate).toBe(true);
  });

  it("connectAudience needs a positive audience total", async () => {
    allComplete();
    mocks.listAudiences.mockResolvedValue(ok({ total: 0 }) as any);
    expect((await deriveOnboardingSteps("t1", null)).connectAudience).toBe(false);
  });
});

describe("newlyCompleted", () => {
  const persisted = {
    verifyEmail: true,
    orgProfile: false,
    inviteTeammate: false,
    connectAudience: false,
    firstCampaign: false,
  };

  it("returns only the keys newly true in derived and not yet persisted", () => {
    const derived = { ...persisted, orgProfile: true, firstCampaign: true };
    expect(newlyCompleted(derived, persisted)).toEqual(["orgProfile", "firstCampaign"]);
  });

  it("is empty when derived adds nothing over persisted", () => {
    expect(newlyCompleted(persisted, persisted)).toEqual([]);
  });
});
