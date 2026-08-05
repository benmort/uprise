import { VoiceAccountResolver } from "./voice-account.resolver";

const BASE_ENV: Record<string, string> = {
  TWILIO_ACCOUNT_SID: "AC_platform",
  TWILIO_AUTH_TOKEN: "platform-token",
  TWILIO_VOICE_FROM: "+61255501111",
  API_BASE_URL: "https://api.test",
};
// Explicit platform voice env (operator-provisioned); omit to exercise the lazy path.
const ENV_VOICE: Record<string, string> = {
  TWILIO_API_KEY_SID: "SK_platform",
  TWILIO_API_KEY_SECRET: "platform-secret",
  TWILIO_TWIML_APP_SID: "AP_platform",
};

function setup(
  senderValue?: unknown,
  opts: {
    accountRow?: unknown;
    platformRow?: unknown;
    envVoice?: boolean;
    envExtra?: Record<string, string>;
  } = {},
) {
  const env = { ...BASE_ENV, ...(opts.envVoice ? ENV_VOICE : {}), ...(opts.envExtra ?? {}) };
  const prisma: any = {
    telephonyAccount: {
      findFirst: jest.fn(async () => opts.accountRow ?? null),
      update: jest.fn(async () => ({})),
    },
    platformVoiceApp: {
      findUnique: jest.fn(async () => opts.platformRow ?? null),
      upsert: jest.fn(async () => ({})),
    },
  };
  const config = { get: jest.fn((k: string, fb?: string) => env[k] ?? fb) } as any;
  const crypto = {
    encrypt: jest.fn((s: string) => `enc(${s})`),
    decrypt: jest.fn((s: string) => s.replace(/^enc\(|\)$/g, "")),
  } as any;
  const twilio = {
    createVoiceApp: jest.fn(async (s: { accountSid: string }) => ({
      apiKeySid: s.accountSid === "AC_platform" ? "SK_platform_new" : "SK_sub",
      apiKeySecret: s.accountSid === "AC_platform" ? "platform-new-secret" : "sub-secret",
      twimlAppSid: s.accountSid === "AC_platform" ? "AP_platform_new" : "AP_sub",
    })),
  } as any;
  const senders = { resolve: jest.fn(async () => senderValue) } as any;
  const resolver = new VoiceAccountResolver(prisma, config, crypto, twilio, senders);
  return { resolver, prisma, crypto, twilio, senders };
}

const SUBACCOUNT_SENDER = { accountSid: "AC_sub", authToken: "tok", from: "+61255052501" };

describe("VoiceAccountResolver", () => {
  it("uses explicit platform voice env when it is set (operator-provisioned)", async () => {
    const { resolver, twilio } = setup(undefined, { envVoice: true });
    expect(await resolver.resolveForTenant("t1")).toEqual({
      mode: "platform",
      accountSid: "AC_platform",
      callerId: "+61255501111",
      apiKeySid: "SK_platform",
      apiKeySecret: "platform-secret",
      twimlAppSid: "AP_platform",
    });
    expect(twilio.createVoiceApp).not.toHaveBeenCalled();
  });

  it("auto-provisions the platform voice app from the SMS credentials when env is unset", async () => {
    const { resolver, twilio, prisma, crypto } = setup(undefined, {}); // no envVoice, no platformRow
    const acc = await resolver.resolveForTenant("t1");
    expect(twilio.createVoiceApp).toHaveBeenCalledWith(
      { accountSid: "AC_platform", authToken: "platform-token" },
      "https://api.test/api/v1/voice-outbound",
    );
    expect(crypto.encrypt).toHaveBeenCalledWith("platform-new-secret");
    expect(prisma.platformVoiceApp.upsert).toHaveBeenCalledWith(
      expect.objectContaining({ where: { accountSid: "AC_platform" } }),
    );
    expect(acc).toEqual({
      mode: "platform",
      accountSid: "AC_platform",
      callerId: "+61255501111",
      apiKeySid: "SK_platform_new",
      apiKeySecret: "platform-new-secret",
      twimlAppSid: "AP_platform_new",
    });
  });

  it("reuses the cached platform voice app on subsequent calls (no re-create)", async () => {
    const platformRow = {
      accountSid: "AC_platform",
      apiKeySid: "SK_cached_plat",
      encryptedApiKeySecret: "enc(cached-plat-secret)",
      twimlAppSid: "AP_cached_plat",
    };
    const { resolver, twilio, prisma } = setup(undefined, { platformRow });
    const acc = await resolver.resolveForTenant("t1");
    expect(twilio.createVoiceApp).not.toHaveBeenCalled();
    expect(prisma.platformVoiceApp.upsert).not.toHaveBeenCalled();
    expect(acc.apiKeySid).toBe("SK_cached_plat");
    expect(acc.apiKeySecret).toBe("cached-plat-secret");
    expect(acc.twimlAppSid).toBe("AP_cached_plat");
  });

  it("uses the subaccount + cached voice app when settings already hold it", async () => {
    const accountRow = {
      id: "acc1",
      accountSid: "AC_sub",
      status: "ACTIVE",
      settings: {
        voiceApiKeySid: "SK_cached",
        voiceApiKeySecret: "enc(cached-secret)",
        voiceTwimlAppSid: "AP_cached",
      },
    };
    const { resolver, twilio, prisma } = setup(SUBACCOUNT_SENDER, { accountRow });
    const acc = await resolver.resolveForTenant("t1");
    expect(twilio.createVoiceApp).not.toHaveBeenCalled();
    expect(prisma.telephonyAccount.update).not.toHaveBeenCalled();
    expect(acc).toEqual({
      mode: "subaccount",
      accountSid: "AC_sub",
      callerId: "+61255052501",
      apiKeySid: "SK_cached",
      apiKeySecret: "cached-secret",
      twimlAppSid: "AP_cached",
    });
  });

  it("lazily creates + caches a subaccount voice app (encrypting the secret) on first use", async () => {
    const accountRow = { id: "acc1", accountSid: "AC_sub", status: "ACTIVE", settings: {} };
    const { resolver, twilio, prisma, crypto } = setup(SUBACCOUNT_SENDER, { accountRow });
    const acc = await resolver.resolveForTenant("t1");
    expect(twilio.createVoiceApp).toHaveBeenCalledWith(
      expect.objectContaining({ accountSid: "AC_sub" }),
      "https://api.test/api/v1/voice-outbound",
    );
    expect(crypto.encrypt).toHaveBeenCalledWith("sub-secret");
    expect(prisma.telephonyAccount.update).toHaveBeenCalledWith(
      expect.objectContaining({
        where: { id: "acc1" },
        data: expect.objectContaining({
          settings: expect.objectContaining({
            voiceApiKeySid: "SK_sub",
            voiceApiKeySecret: "enc(sub-secret)",
            voiceTwimlAppSid: "AP_sub",
          }),
        }),
      }),
    );
    expect(acc.mode).toBe("subaccount");
    expect(acc.apiKeySecret).toBe("sub-secret");
    expect(acc.callerId).toBe("+61255052501");
  });

  it("callerIdForAccount returns the tenant number for the matching account, else platform (no lazy create)", async () => {
    const { resolver, twilio } = setup(SUBACCOUNT_SENDER);
    expect(await resolver.callerIdForAccount("t1", "AC_sub")).toBe("+61255052501");
    expect(await resolver.callerIdForAccount("t1", "AC_other")).toBe("+61255501111");
    expect(twilio.createVoiceApp).not.toHaveBeenCalled();
  });

  it("skips a +614 (SMS-only) tenant sender and falls back to the platform account", async () => {
    const mobileSender = { accountSid: "AC_sub", authToken: "tok", from: "+61485052501" };
    const { resolver, twilio } = setup(mobileSender, { envVoice: true });
    const acc = await resolver.resolveForTenant("t1");
    expect(acc.mode).toBe("platform");
    expect(acc.callerId).toBe("+61255501111");
    // The subaccount voice app is never touched — the mobile can't dial.
    expect(twilio.createVoiceApp).not.toHaveBeenCalled();
  });

  it("returns an empty callerId marker when every platform number is a +614 mobile", async () => {
    const { resolver } = setup(undefined, { envVoice: true });
    // Override the platform voice-from to mobiles only.
    (resolver as any).config = {
      get: jest.fn((k: string, fb?: string) =>
        k === "TWILIO_VOICE_FROM"
          ? "+61400000111"
          : k === "TWILIO_PHONE_NUMBER"
            ? "+61485052501"
            : ({ TWILIO_ACCOUNT_SID: "AC_platform", TWILIO_API_KEY_SID: "SK_platform", TWILIO_API_KEY_SECRET: "platform-secret", TWILIO_TWIML_APP_SID: "AP_platform", API_BASE_URL: "https://api.test" } as Record<string, string>)[k] ?? fb,
      ),
    };
    const acc = await resolver.resolveForTenant("t1");
    expect(acc.mode).toBe("platform");
    expect(acc.callerId).toBe("");
  });

  it("callerIdForAccount refuses a +614 tenant number and yields the platform caller id", async () => {
    const mobileSender = { accountSid: "AC_sub", authToken: "tok", from: "+61485052501" };
    const { resolver } = setup(mobileSender);
    expect(await resolver.callerIdForAccount("t1", "AC_sub")).toBe("+61255501111");
  });
});

describe("VoiceAccountResolver.resolveDialerForTenant", () => {
  it("an env-pinned dialler app wins on the platform account", async () => {
    const { resolver, twilio } = setup(undefined, {
      envVoice: true,
      envExtra: { TWILIO_DIALER_TWIML_APP_SID: "AP_dialer_env" },
    });
    twilio.createTwimlApp = jest.fn();
    const account = await resolver.resolveDialerForTenant("t1");
    expect(account.twimlAppSid).toBe("AP_dialer_env");
    expect(account.apiKeySid).toBe("SK_platform");
    expect(twilio.createTwimlApp).not.toHaveBeenCalled();
  });

  it("grows the dialler app lazily on the PlatformVoiceApp row, pointed at the session-answer IVR", async () => {
    const platformRow = {
      accountSid: "AC_platform",
      apiKeySid: "SK_p",
      encryptedApiKeySecret: "enc(sec)",
      twimlAppSid: "AP_p",
      dialerTwimlAppSid: null,
    };
    const { resolver, prisma, twilio } = setup(undefined, { platformRow });
    twilio.createTwimlApp = jest.fn(async () => "AP_dialer_new");
    prisma.platformVoiceApp.update = jest.fn(async () => ({}));
    const account = await resolver.resolveDialerForTenant("t1");
    expect(twilio.createTwimlApp).toHaveBeenCalledWith(
      { accountSid: "AC_platform", authToken: "platform-token" },
      "https://api.test/api/v1/autodialer/ivr/session-answer",
      "uprise-dialer",
      // Without the status callback, the widget's caller-leg Call row would
      // stick at IN_PROGRESS forever (live-smoke finding).
      "https://api.test/api/v1/voice-status-callback",
    );
    expect(prisma.platformVoiceApp.update).toHaveBeenCalledWith({
      where: { accountSid: "AC_platform" },
      data: { dialerTwimlAppSid: "AP_dialer_new" },
    });
    // The token signs with the account's existing key but the DIALLER app.
    expect(account.twimlAppSid).toBe("AP_dialer_new");
    expect(account.apiKeySid).toBe("SK_p");
  });

  it("reuses a persisted platform dialler app without touching Twilio", async () => {
    const platformRow = {
      accountSid: "AC_platform",
      apiKeySid: "SK_p",
      encryptedApiKeySecret: "enc(sec)",
      twimlAppSid: "AP_p",
      dialerTwimlAppSid: "AP_dialer",
    };
    const { resolver, twilio } = setup(undefined, { platformRow });
    twilio.createTwimlApp = jest.fn();
    const account = await resolver.resolveDialerForTenant("t1");
    expect(account.twimlAppSid).toBe("AP_dialer");
    expect(twilio.createTwimlApp).not.toHaveBeenCalled();
  });

  it("a provisioned tenant rides its subaccount with the cached dialler app", async () => {
    const accountRow = {
      id: "ta1",
      settings: {
        voiceApiKeySid: "SK_sub",
        voiceApiKeySecret: "enc(sub-secret)",
        voiceTwimlAppSid: "AP_sub",
        voiceDialerTwimlAppSid: "AP_sub_dialer",
      },
    };
    const { resolver, twilio } = setup(SUBACCOUNT_SENDER, { accountRow });
    twilio.createTwimlApp = jest.fn();
    const account = await resolver.resolveDialerForTenant("t1");
    expect(account).toMatchObject({
      mode: "subaccount",
      accountSid: "AC_sub",
      twimlAppSid: "AP_sub_dialer",
      apiKeySid: "SK_sub",
    });
    expect(twilio.createTwimlApp).not.toHaveBeenCalled();
  });

  it("creates the subaccount dialler app once and caches it in settings", async () => {
    const accountRow = {
      id: "ta1",
      settings: {
        voiceApiKeySid: "SK_sub",
        voiceApiKeySecret: "enc(sub-secret)",
        voiceTwimlAppSid: "AP_sub",
      },
    };
    const { resolver, prisma, twilio } = setup(SUBACCOUNT_SENDER, { accountRow });
    twilio.createTwimlApp = jest.fn(async () => "AP_sub_dialer_new");
    const account = await resolver.resolveDialerForTenant("t1");
    expect(account.twimlAppSid).toBe("AP_sub_dialer_new");
    expect(prisma.telephonyAccount.update).toHaveBeenCalledWith(
      expect.objectContaining({
        data: { settings: expect.objectContaining({ voiceDialerTwimlAppSid: "AP_sub_dialer_new" }) },
      }),
    );
  });
});
