import { TwilioProvisioningClient, twilioBusinessType } from "./twilio-provisioning.client";

/**
 * uprise's entity-type vocabulary is not Twilio's. Anything unmapped must come back
 * undefined so `createEndUser` omits the attribute — sending a value Twilio doesn't
 * accept risks a bundle a human rejects days later, which is worse than omitting it.
 */
describe("twilioBusinessType", () => {
  it("maps the AU not-for-profit structures onto non_profit_corporation", () => {
    expect(twilioBusinessType("charity")).toBe("non_profit_corporation");
    expect(twilioBusinessType("incorporated_association")).toBe("non_profit_corporation");
    expect(twilioBusinessType("company_limited_by_guarantee")).toBe("non_profit_corporation");
    expect(twilioBusinessType("atsi_corporation")).toBe("non_profit_corporation");
  });

  it("maps the structures with a direct Twilio equivalent", () => {
    expect(twilioBusinessType("trust")).toBe("trust");
    expect(twilioBusinessType("cooperative")).toBe("co_operative");
  });

  it("is case- and whitespace-insensitive", () => {
    expect(twilioBusinessType("  Charity  ")).toBe("non_profit_corporation");
  });

  it("returns undefined for unmapped, empty and unknown values", () => {
    expect(twilioBusinessType("unincorporated_association")).toBeUndefined();
    expect(twilioBusinessType("political_party")).toBeUndefined();
    expect(twilioBusinessType("other")).toBeUndefined();
    expect(twilioBusinessType("")).toBeUndefined();
    expect(twilioBusinessType(undefined)).toBeUndefined();
  });
});

/**
 * The whole surface under test here is HOW the client is constructed and which host the one
 * hand-rolled request targets – so the Twilio SDK is mocked down to a recording factory.
 */
const bundleFetch = jest.fn();
const regulationFetch = jest.fn();
const addressFetch = jest.fn();
const addressCreate = jest.fn(async () => ({ sid: "AD" + "1".repeat(32) }));

const incomingList = jest.fn();
const incomingFetch = jest.fn();

const twilioFactory = jest.fn(() => {
  // `addresses` is both a list resource (`.create`) and a context accessor (`(sid).fetch`).
  const addresses = ((_sid: string) => ({ fetch: addressFetch })) as unknown as {
    (sid: string): { fetch: jest.Mock };
    create: jest.Mock;
  };
  addresses.create = addressCreate;
  // Same dual shape: `incomingPhoneNumbers.list()` and `incomingPhoneNumbers(sid).fetch()`.
  const incomingPhoneNumbers = ((_sid: string) => ({ fetch: incomingFetch })) as unknown as {
    (sid: string): { fetch: jest.Mock };
    list: jest.Mock;
  };
  incomingPhoneNumbers.list = incomingList;
  return {
    addresses,
    incomingPhoneNumbers,
    numbers: {
      v2: {
        regulatoryCompliance: {
          bundles: (_sid: string) => ({ fetch: bundleFetch }),
          regulations: (_sid: string) => ({ fetch: regulationFetch }),
        },
      },
    },
  };
});
jest.mock("twilio", () => ({
  __esModule: true,
  default: (...args: unknown[]) => (twilioFactory as unknown as (...a: unknown[]) => unknown)(...args),
}));

// Obviously-fake credentials. Never a real SID or token, here or anywhere.
const ACCOUNT_SID = "AC" + "1".repeat(32);
const CREDS = { accountSid: ACCOUNT_SID, authToken: "test-token" };

function setup() {
  const config = { get: jest.fn((_key: string, fallback?: string) => fallback ?? "") };
  return new TwilioProvisioningClient(config as never);
}

const COMPLIANCE = {
  legalName: "Legal Co",
  contactFirstName: "Ada",
  contactLastName: "Lovelace",
  email: "compliance@example.org",
  address: { street: "1 Test St", city: "Sydney", region: "NSW", postalCode: "2000" },
};

const REGULATION_SID = "RN" + "3".repeat(32);
const SUPPLIED_BUNDLE_SID = "BU" + "a".repeat(32);
const SUPPLIED_ADDRESS_SID = "AD" + "b".repeat(32);

beforeEach(() => {
  twilioFactory.mockClear();
  bundleFetch.mockReset().mockResolvedValue({ status: "twilio-approved", regulationSid: REGULATION_SID });
  regulationFetch.mockReset().mockResolvedValue({ numberType: "mobile", isoCountry: "AU" });
  addressFetch.mockReset().mockResolvedValue({ isoCountry: "AU" });
  addressCreate.mockClear();
  incomingList.mockReset().mockResolvedValue([]);
  incomingFetch.mockReset();
});

/**
 * Reading what the account ALREADY owns. This is the whole basis of adoption – without it
 * the only way a number enters uprise is by buying another one the organisation already has.
 */
describe("TwilioProvisioningClient owned numbers", () => {
  const OWNED_SID = "PN" + "c".repeat(32);
  const twilioNumber = (overrides: Record<string, unknown> = {}) => ({
    sid: OWNED_SID,
    phoneNumber: "+61400000001",
    friendlyName: "Campaign line",
    capabilities: { voice: true, sms: true, mms: true },
    // What the real BYO account looks like: a working voice configuration belonging to the
    // organisation's own autodialer, and messaging never configured at all.
    voiceUrl: "https://example-autodialer.test/voice",
    voiceApplicationSid: "AP" + "d".repeat(32),
    voiceFallbackUrl: "https://example-autodialer.test/voice-fallback",
    trunkSid: "",
    smsUrl: "",
    smsApplicationSid: "",
    smsFallbackUrl: "",
    ...overrides,
  });

  it("lists each owned number with its capabilities and CURRENT configuration", async () => {
    const client = setup();
    incomingList.mockResolvedValue([twilioNumber()]);

    await expect(client.listOwnedNumbers(CREDS)).resolves.toEqual([
      {
        phoneNumberE164: "+61400000001",
        phoneNumberSid: OWNED_SID,
        friendlyName: "Campaign line",
        capabilities: { voice: true, sms: true, mms: true },
        voiceUrl: "https://example-autodialer.test/voice",
        voiceApplicationSid: "AP" + "d".repeat(32),
        voiceFallbackUrl: "https://example-autodialer.test/voice-fallback",
        trunkSid: null,
        smsUrl: null,
        smsApplicationSid: null,
        smsFallbackUrl: null,
      },
    ]);
  });

  /**
   * Every field Twilio routes on is read, not just the two primary URLs. A trunk binding
   * overrides voice routing outright and a fallback URL takes traffic whenever the primary
   * errors – a reader that missed either would report an occupied hook as free, and adoption
   * decides whether it is safe to claim a hook from exactly this read.
   */
  it("reads the trunk binding and the fallback URLs, not just the primary hooks", async () => {
    const client = setup();
    const trunkSid = "TK" + "f".repeat(32);
    incomingList.mockResolvedValue([
      twilioNumber({ trunkSid, smsFallbackUrl: "https://example-crm.test/sms-fallback" }),
    ]);

    const [number] = await client.listOwnedNumbers(CREDS);

    expect(number).toMatchObject({
      trunkSid,
      voiceFallbackUrl: "https://example-autodialer.test/voice-fallback",
      smsFallbackUrl: "https://example-crm.test/sms-fallback",
    });
  });

  /**
   * The premise of adoption is an account holding piles of unused inventory, so a list that
   * silently stopped at a low page ceiling would show a missing number as one Twilio does not
   * report – indistinguishable, to the operator, from a number that is not there.
   */
  it("pages well past any real account rather than capping the candidate list at 100", async () => {
    const client = setup();
    await client.listOwnedNumbers(CREDS);

    expect(incomingList).toHaveBeenCalledWith({ limit: 1000 });
  });

  // Absent capabilities must read FALSE, never true: a number uprise cannot prove is
  // SMS-capable must never be adopted as an SMS sender.
  it("reads missing capabilities as false rather than assuming them", async () => {
    const client = setup();
    incomingList.mockResolvedValue([twilioNumber({ capabilities: null })]);

    const [number] = await client.listOwnedNumbers(CREDS);
    expect(number.capabilities).toEqual({ voice: false, sms: false, mms: false });
  });

  it("fetches one owned number by SID", async () => {
    const client = setup();
    incomingFetch.mockResolvedValue(twilioNumber());

    await expect(client.fetchOwnedNumber(CREDS, OWNED_SID)).resolves.toMatchObject({
      phoneNumberSid: OWNED_SID,
      phoneNumberE164: "+61400000001",
    });
  });

  // Null is the OWNERSHIP verdict – the fetch runs under the account's own credentials, so a
  // SID belonging to anyone else cannot resolve.
  it("returns null when the SID is not on this account, without retrying a settled answer", async () => {
    const client = setup();
    incomingFetch.mockRejectedValue(Object.assign(new Error("not found"), { status: 404, code: 20404 }));

    await expect(client.fetchOwnedNumber(CREDS, OWNED_SID)).resolves.toBeNull();
    expect(incomingFetch).toHaveBeenCalledTimes(1);
  });

  // "We could not ask" must never read as "not yours" – an auth failure or an outage has to
  // surface, or a credential problem would silently look like a number the tenant lost.
  it("throws (not null) when the lookup fails for any other reason", async () => {
    const client = setup();
    incomingFetch.mockRejectedValue(Object.assign(new Error("Authenticate"), { status: 401 }));

    await expect(client.fetchOwnedNumber(CREDS, OWNED_SID)).rejects.toThrow("Authenticate");
  });
});

/**
 * What an operator-supplied bundle actually IS. `startRun` refuses the compliance-skipping
 * fast-path on anything this reports as unapproved, foreign or the wrong class, so these are
 * the facts that decision rests on – and the class is NOT on the bundle resource, it is on
 * the regulation the bundle names.
 */
describe("TwilioProvisioningClient.fetchBundleFacts", () => {
  it("reports the bundle's status and the class from its regulation", async () => {
    const client = setup();
    regulationFetch.mockResolvedValue({ numberType: "local", isoCountry: "AU" });

    await expect(client.fetchBundleFacts(CREDS, SUPPLIED_BUNDLE_SID)).resolves.toEqual({
      status: "twilio-approved",
      numberType: "local",
      isoCountry: "AU",
    });
  });

  it("passes the bundle's own status through rather than assuming approval", async () => {
    const client = setup();
    bundleFetch.mockResolvedValue({ status: "pending-review", regulationSid: REGULATION_SID });

    await expect(client.fetchBundleFacts(CREDS, SUPPLIED_BUNDLE_SID)).resolves.toMatchObject({
      status: "pending-review",
    });
  });

  // Unknown is not "matches": an outage on the regulation lookup must leave the class null,
  // so the caller records it as unverified instead of taking it for a match.
  it("reports a null class when the regulation cannot be read, without failing the fetch", async () => {
    const client = setup();
    regulationFetch.mockRejectedValue(new Error("regulation lookup unavailable"));

    await expect(client.fetchBundleFacts(CREDS, SUPPLIED_BUNDLE_SID)).resolves.toEqual({
      status: "twilio-approved",
      numberType: null,
      isoCountry: null,
    });
  });

  it("reports a null class when the bundle names no regulation at all", async () => {
    const client = setup();
    bundleFetch.mockResolvedValue({ status: "twilio-approved" });

    await expect(client.fetchBundleFacts(CREDS, SUPPLIED_BUNDLE_SID)).resolves.toMatchObject({
      numberType: null,
    });
    expect(regulationFetch).not.toHaveBeenCalled();
  });

  // A SID that is not on this account is the likely paste error, and it has to THROW so the
  // caller can refuse the run rather than provision against a bundle that does not exist.
  it("throws when the bundle is not readable on the account", async () => {
    const client = setup();
    bundleFetch.mockRejectedValue(new Error("The requested resource was not found"));

    await expect(client.fetchBundleFacts(CREDS, SUPPLIED_BUNDLE_SID)).rejects.toThrow("not found");
  });

  it("reads the address country, and throws when the address is not on the account", async () => {
    const client = setup();
    addressFetch.mockResolvedValue({ isoCountry: "NZ" });
    await expect(client.fetchAddressCountry(CREDS, SUPPLIED_ADDRESS_SID)).resolves.toBe("NZ");

    addressFetch.mockRejectedValue(new Error("The requested resource was not found"));
    await expect(client.fetchAddressCountry(CREDS, SUPPLIED_ADDRESS_SID)).rejects.toThrow("not found");
  });
});

describe("TwilioProvisioningClient regional accounts", () => {

  it("drives a regional account's client with its region and edge", async () => {
    const client = setup();

    await client.createAddress({ ...CREDS, region: "au1", edge: "sydney" }, COMPLIANCE);

    expect(twilioFactory).toHaveBeenCalledWith(ACCOUNT_SID, "test-token", {
      region: "au1",
      edge: "sydney",
    });
  });

  // The bar for "nothing changes for existing accounts": the SDK is constructed with the
  // same TWO arguments it always was, not with an empty options object.
  it("constructs a non-regional account's client exactly as before (no options argument)", async () => {
    const client = setup();

    await client.createAddress(CREDS, COMPLIANCE);

    expect(twilioFactory).toHaveBeenCalledWith(ACCOUNT_SID, "test-token");
    expect(twilioFactory.mock.calls[0]).toHaveLength(2);
  });

  it("treats null/blank region and edge as not regional", async () => {
    const client = setup();

    await client.createAddress({ ...CREDS, region: null, edge: "   " }, COMPLIANCE);

    expect(twilioFactory.mock.calls[0]).toHaveLength(2);
  });

  // An edge names half a host (numbers.<edge>.<region>.twilio.com). Passing it alone had the
  // SDK route on that half while `regulatoryHost` ignored it and posted to the global host –
  // the two disagreeing about where the same account's requests go.
  it("ignores an edge with no region, as the document-upload host does", async () => {
    const client = setup();

    await client.createAddress({ ...CREDS, edge: "sydney" }, COMPLIANCE);

    expect(twilioFactory).toHaveBeenCalledWith(ACCOUNT_SID, "test-token");
    expect(twilioFactory.mock.calls[0]).toHaveLength(2);
  });

  // A lone region makes the SDK derive the edge from its own map and mutate itself on EVERY
  // request, logging a deprecation warning each time. Send the complete pair instead.
  it("fills the region's default edge when the account states only a region", async () => {
    const client = setup();

    await client.createAddress({ ...CREDS, region: "au1" }, COMPLIANCE);

    expect(twilioFactory).toHaveBeenCalledWith(ACCOUNT_SID, "test-token", {
      region: "au1",
      edge: "sydney",
    });
  });

  describe("supporting-document upload host", () => {
    const okResponse = () =>
      ({ ok: true, status: 200, json: async () => ({ sid: "RD" + "7".repeat(32) }) }) as unknown as Response;
    const doc = {
      fileName: "reg.pdf",
      contentType: "application/pdf",
      type: "business_registration",
      content: Buffer.from("pdf"),
    };
    let fetchSpy: jest.SpyInstance;

    beforeEach(() => {
      fetchSpy = jest.spyOn(globalThis, "fetch").mockResolvedValue(okResponse());
    });
    afterEach(() => fetchSpy.mockRestore());

    // This is the ONE call that bypasses the SDK (multipart), so it has to apply the SDK's
    // own `<product>.<edge>.<region>.twilio.com` rewrite by hand – otherwise an au1 account
    // uploads its documents into us1, where its bundle cannot see them.
    it("posts to the regional host for a regional account", async () => {
      const client = setup();

      await client.createSupportingDocument({ ...CREDS, region: "au1", edge: "sydney" }, doc);

      expect(fetchSpy.mock.calls[0][0]).toBe(
        "https://numbers.sydney.au1.twilio.com/v2/RegulatoryCompliance/SupportingDocuments",
      );
    });

    it("fills the region's default edge when only a region is known", async () => {
      const client = setup();

      await client.createSupportingDocument({ ...CREDS, region: "au1" }, doc);

      expect(fetchSpy.mock.calls[0][0]).toBe(
        "https://numbers.sydney.au1.twilio.com/v2/RegulatoryCompliance/SupportingDocuments",
      );
    });

    it("posts to the global host for a non-regional account (unchanged)", async () => {
      const client = setup();

      await client.createSupportingDocument(CREDS, doc);

      expect(fetchSpy.mock.calls[0][0]).toBe(
        "https://numbers.twilio.com/v2/RegulatoryCompliance/SupportingDocuments",
      );
    });
  });
});
