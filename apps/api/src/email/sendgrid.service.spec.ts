import { createSign, generateKeyPairSync } from "crypto";
import { ConfigService } from "@nestjs/config";
import { SendGridService } from "./sendgrid.service";

/** Verifies the SendGrid signed-event-webhook ECDSA check with a real P-256 keypair. */
describe("SendGridService.verifyEventWebhookSignature", () => {
  const { publicKey, privateKey } = generateKeyPairSync("ec", { namedCurve: "prime256v1" });
  const verificationKey = publicKey.export({ format: "der", type: "spki" }).toString("base64");

  function svcWithKey(key: string | null) {
    const config = {
      get: (k: string, fb?: string) =>
        k === "SENDGRID_WEBHOOK_VERIFICATION_KEY" ? (key ?? "") : fb ?? "",
    } as unknown as ConfigService;
    return new SendGridService(config);
  }

  function sign(payload: string, timestamp: string): string {
    const s = createSign("sha256");
    s.update(timestamp + payload);
    s.end();
    return s.sign(privateKey).toString("base64");
  }

  it("accepts a correctly signed payload", () => {
    const svc = svcWithKey(verificationKey);
    const payload = '[{"event":"delivered"}]';
    const ts = "1700000000";
    expect(svc.verifyEventWebhookSignature(payload, sign(payload, ts), ts)).toBe(true);
  });

  it("rejects a tampered payload", () => {
    const svc = svcWithKey(verificationKey);
    const ts = "1700000000";
    const sig = sign('[{"event":"delivered"}]', ts);
    expect(svc.verifyEventWebhookSignature('[{"event":"bounce"}]', sig, ts)).toBe(false);
  });

  it("rejects when the verification key is not configured", () => {
    const svc = svcWithKey(null);
    expect(svc.isWebhookVerificationConfigured()).toBe(false);
    expect(svc.verifyEventWebhookSignature("x", "sig", "1700000000")).toBe(false);
  });
});
