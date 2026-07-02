import { EmailProvisioningStatus as S } from "@uprise/db";
import {
  assertValidEmailProvisioningTransition,
  canTransitionEmailProvisioning,
} from "./email-provisioning-state.machine";

describe("email provisioning FSM", () => {
  it("allows the linear happy path", () => {
    const path = [
      S.REQUESTED,
      S.SUBUSER_CREATED,
      S.DOMAIN_AUTH_CREATED,
      S.DNS_CONFIGURED,
      S.DOMAIN_VERIFIED,
      S.WEBHOOKS_CONFIGURED,
      S.ACTIVE,
    ];
    for (let i = 0; i < path.length - 1; i++) {
      expect(() => assertValidEmailProvisioningTransition(path[i], path[i + 1])).not.toThrow();
    }
  });

  it("allows the validation-failed re-check loop", () => {
    expect(canTransitionEmailProvisioning(S.DNS_CONFIGURED, S.VALIDATION_FAILED)).toBe(true);
    expect(canTransitionEmailProvisioning(S.VALIDATION_FAILED, S.DOMAIN_VERIFIED)).toBe(true);
    expect(canTransitionEmailProvisioning(S.VALIDATION_FAILED, S.DNS_CONFIGURED)).toBe(true);
  });

  it("allows the SINGLE_ADDRESS fast-path hop", () => {
    expect(canTransitionEmailProvisioning(S.SUBUSER_CREATED, S.DOMAIN_VERIFIED)).toBe(true);
  });

  it("every in-flight state can FAIL; ACTIVE is terminal", () => {
    for (const from of [
      S.REQUESTED,
      S.SUBUSER_CREATED,
      S.DOMAIN_AUTH_CREATED,
      S.DNS_CONFIGURED,
      S.VALIDATION_FAILED,
      S.DOMAIN_VERIFIED,
      S.WEBHOOKS_CONFIGURED,
    ]) {
      expect(canTransitionEmailProvisioning(from, S.FAILED)).toBe(true);
    }
    expect(canTransitionEmailProvisioning(S.ACTIVE, S.FAILED)).toBe(false);
    expect(canTransitionEmailProvisioning(S.ACTIVE, S.REQUESTED)).toBe(false);
  });

  it("FAILED re-enters resumable states (service guards it to resumeStatus)", () => {
    expect(canTransitionEmailProvisioning(S.FAILED, S.DNS_CONFIGURED)).toBe(true);
    expect(canTransitionEmailProvisioning(S.FAILED, S.DOMAIN_VERIFIED)).toBe(true);
    expect(canTransitionEmailProvisioning(S.FAILED, S.ACTIVE)).toBe(false);
  });

  it("rejects skipping states", () => {
    expect(() => assertValidEmailProvisioningTransition(S.REQUESTED, S.DOMAIN_VERIFIED)).toThrow();
    expect(canTransitionEmailProvisioning(S.DOMAIN_AUTH_CREATED, S.DOMAIN_VERIFIED)).toBe(false);
  });
});
