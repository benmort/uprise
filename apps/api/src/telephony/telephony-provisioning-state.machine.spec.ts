import { TelephonyProvisioningStatus as S } from "@uprise/db";
import {
  assertValidProvisioningTransition,
  canTransitionProvisioning,
} from "./telephony-provisioning-state.machine";

describe("telephony provisioning FSM", () => {
  it("allows the linear happy path", () => {
    const path = [
      S.REQUESTED,
      S.SUBACCOUNT_CREATED,
      S.COMPLIANCE_DRAFT,
      S.COMPLIANCE_SUBMITTED,
      S.COMPLIANCE_APPROVED,
      S.NUMBER_PURCHASED,
      S.WEBHOOKS_CONFIGURED,
      S.ACTIVE,
    ];
    for (let i = 0; i < path.length - 1; i++) {
      expect(() => assertValidProvisioningTransition(path[i], path[i + 1])).not.toThrow();
    }
  });

  it("allows the rejected → redraft → resubmit loop", () => {
    expect(canTransitionProvisioning(S.COMPLIANCE_SUBMITTED, S.COMPLIANCE_REJECTED)).toBe(true);
    expect(canTransitionProvisioning(S.COMPLIANCE_REJECTED, S.COMPLIANCE_DRAFT)).toBe(true);
    expect(canTransitionProvisioning(S.COMPLIANCE_DRAFT, S.COMPLIANCE_SUBMITTED)).toBe(true);
  });

  it("every in-flight state can FAIL; ACTIVE is terminal", () => {
    for (const from of [
      S.REQUESTED,
      S.SUBACCOUNT_CREATED,
      S.COMPLIANCE_DRAFT,
      S.COMPLIANCE_SUBMITTED,
      S.COMPLIANCE_APPROVED,
      S.COMPLIANCE_REJECTED,
      S.NUMBER_PURCHASED,
      S.WEBHOOKS_CONFIGURED,
    ]) {
      expect(canTransitionProvisioning(from, S.FAILED)).toBe(true);
    }
    expect(canTransitionProvisioning(S.ACTIVE, S.FAILED)).toBe(false);
    expect(canTransitionProvisioning(S.ACTIVE, S.REQUESTED)).toBe(false);
  });

  it("FAILED re-enters any resumable state (service guards it to resumeStatus)", () => {
    expect(canTransitionProvisioning(S.FAILED, S.SUBACCOUNT_CREATED)).toBe(true);
    expect(canTransitionProvisioning(S.FAILED, S.COMPLIANCE_APPROVED)).toBe(true);
  });

  it("rejects skipping states", () => {
    expect(() => assertValidProvisioningTransition(S.REQUESTED, S.NUMBER_PURCHASED)).toThrow();
    expect(canTransitionProvisioning(S.REQUESTED, S.NUMBER_PURCHASED)).toBe(false);
    expect(canTransitionProvisioning(S.SUBACCOUNT_CREATED, S.COMPLIANCE_APPROVED)).toBe(false);
  });
});
