import { TwilioProvisioningClient } from "./twilio-provisioning.client";

/**
 * The whole surface under test here is HOW the client is constructed and which host the one
 * hand-rolled request targets – so the Twilio SDK is mocked down to a recording factory.
 */
const bundleFetch = jest.fn();
const regulationFetch = jest.fn();
const addressFetch = jest.fn();
const addressCreate = jest.fn(async () => ({ sid: "AD" + "1".repeat(32) }));

const twilioFactory = jest.fn(() => {
  // `addresses` is both a list resource (`.create`) and a context accessor (`(sid).fetch`).
  const addresses = ((_sid: string) => ({ fetch: addressFetch })) as unknown as {
    (sid: string): { fetch: jest.Mock };
    create: jest.Mock;
  };
  addresses.create = addressCreate;
  return {
    addresses,
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
