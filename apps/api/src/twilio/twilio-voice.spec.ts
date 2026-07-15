import { TwilioService } from "./twilio.service";

// No twilio module mock here: mintVoiceToken + buildDialTwiml are offline (JWT
// signing + TwiML generation), so they exercise the real SDK.
const ENV: Record<string, string> = {
  TWILIO_ACCOUNT_SID: "AC" + "p".repeat(32),
  TWILIO_AUTH_TOKEN: "platform-token",
};
const config = { get: jest.fn((k: string, fb?: string) => ENV[k] ?? fb) } as any;

describe("TwilioService browser voice (real SDK)", () => {
  const svc = new TwilioService(config);

  it("mintVoiceToken returns a signed JWT carrying the identity + a voice grant", () => {
    const jwt = svc.mintVoiceToken({
      accountSid: "AC" + "p".repeat(32),
      apiKeySid: "SK" + "1".repeat(32),
      apiKeySecret: "secret",
      twimlAppSid: "AP" + "1".repeat(32),
      identity: "uu1.tt1",
    });
    expect(typeof jwt).toBe("string");
    const parts = jwt.split(".");
    expect(parts).toHaveLength(3);
    const payload = JSON.parse(Buffer.from(parts[1], "base64").toString("utf8"));
    expect(payload.grants.identity).toBe("uu1.tt1");
    expect(payload.grants.voice).toBeDefined();
    expect(payload.grants.voice.outgoing.application_sid).toBe("AP" + "1".repeat(32));
  });

  it("buildDialTwiml bridges to the callee with recording, caller id and a threaded callId", () => {
    const xml = svc.buildDialTwiml({
      to: "+61400000999",
      callerId: "+61400000111",
      callId: "call1",
      statusCallbackBase: "https://api.test/api/v1/voice-status-callback",
      recordingCallbackBase: "https://api.test/api/v1/voice-recording-callback",
    });
    expect(xml).toContain("<Dial");
    expect(xml).toContain('callerId="+61400000111"');
    expect(xml).toContain("+61400000999");
    expect(xml).toContain("callId=call1");
    expect(xml).toContain("record");
  });
});
