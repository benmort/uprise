import { EmailProvisioningRequestStatus as R } from "@uprise/db";
import { ApiHttpException } from "../common/http/api-response";
import { assertValidEmailSetupRequestTransition } from "./email-setup-request-state.machine";

/** ApiHttpException carries its code inside the wrapped response object. */
function codeOf(fn: () => void): string | null {
  try {
    fn();
    return null;
  } catch (e) {
    const res = (e as ApiHttpException).getResponse() as { error?: { code?: string } };
    return res?.error?.code ?? null;
  }
}

describe("email setup-request FSM", () => {
  it("allows OPEN → each resolution", () => {
    for (const to of [R.FULFILLED, R.DECLINED, R.WITHDRAWN]) {
      expect(() => assertValidEmailSetupRequestTransition(R.OPEN, to)).not.toThrow();
    }
  });

  it("every resolution is terminal (409 INVALID_REQUEST_TRANSITION)", () => {
    for (const from of [R.FULFILLED, R.DECLINED, R.WITHDRAWN]) {
      for (const to of [R.OPEN, R.FULFILLED, R.DECLINED, R.WITHDRAWN]) {
        expect(codeOf(() => assertValidEmailSetupRequestTransition(from, to))).toBe(
          "INVALID_REQUEST_TRANSITION",
        );
      }
    }
  });

  it("OPEN → OPEN is invalid", () => {
    expect(codeOf(() => assertValidEmailSetupRequestTransition(R.OPEN, R.OPEN))).toBe(
      "INVALID_REQUEST_TRANSITION",
    );
  });
});
