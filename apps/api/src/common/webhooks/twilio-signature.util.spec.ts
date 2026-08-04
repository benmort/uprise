import { UnauthorizedException } from "@nestjs/common";
import Twilio from "twilio";
import { validateTwilioWebhookSignature } from "./twilio-signature.util";

const TOKEN = "test-auth-token";

function makeReq(overrides: {
  headers?: Record<string, string>;
  originalUrl?: string;
  protocol?: string;
  host?: string;
}) {
  const headers = overrides.headers ?? {};
  return {
    headers,
    protocol: overrides.protocol ?? "https",
    originalUrl: overrides.originalUrl ?? "/api/v1/autodialer/ivr/answer?campaignId=dc1",
    get: (name: string) => (name.toLowerCase() === "host" ? (overrides.host ?? "api.test") : undefined),
  } as never;
}

function signedReq(body: Record<string, string>, url = "https://api.test/api/v1/autodialer/ivr/answer?campaignId=dc1") {
  const signature = Twilio.getExpectedTwilioSignature(TOKEN, url, body);
  return makeReq({
    headers: { "x-twilio-signature": signature },
    originalUrl: url.replace("https://api.test", ""),
    host: "api.test",
  });
}

describe("validateTwilioWebhookSignature", () => {
  const body = { AccountSid: "ACxxx", CallSid: "CAxxx", Digits: "1" };

  it("accepts a correctly signed request", () => {
    expect(() => validateTwilioWebhookSignature(signedReq(body), body, TOKEN)).not.toThrow();
  });

  it("fails closed with no token", () => {
    expect(() => validateTwilioWebhookSignature(signedReq(body), body, undefined)).toThrow(
      UnauthorizedException,
    );
  });

  it("fails closed with no signature header", () => {
    const req = makeReq({ headers: {} });
    expect(() => validateTwilioWebhookSignature(req, body, TOKEN)).toThrow(UnauthorizedException);
  });

  it("rejects a signature computed with a different token", () => {
    const url = "https://api.test/api/v1/autodialer/ivr/answer?campaignId=dc1";
    const forged = Twilio.getExpectedTwilioSignature("wrong-token", url, body);
    const req = makeReq({
      headers: { "x-twilio-signature": forged },
      originalUrl: url.replace("https://api.test", ""),
      host: "api.test",
    });
    expect(() => validateTwilioWebhookSignature(req, body, TOKEN)).toThrow(UnauthorizedException);
  });

  it("rejects when the signed body was tampered with", () => {
    const req = signedReq(body);
    expect(() => validateTwilioWebhookSignature(req, { ...body, Digits: "9" }, TOKEN)).toThrow(
      UnauthorizedException,
    );
  });

  it("reconstructs the URL from forwarded headers (proxy topology)", () => {
    const url = "https://public.example/api/v1/webhooks/twilio/voice";
    const signature = Twilio.getExpectedTwilioSignature(TOKEN, url, body);
    const req = makeReq({
      headers: {
        "x-twilio-signature": signature,
        "x-forwarded-proto": "https",
        "x-forwarded-host": "public.example",
      },
      originalUrl: "/api/v1/webhooks/twilio/voice",
      protocol: "http",
      host: "internal:3000",
    });
    expect(() => validateTwilioWebhookSignature(req, body, TOKEN)).not.toThrow();
  });
});
