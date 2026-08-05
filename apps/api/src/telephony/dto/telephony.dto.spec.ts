import { ValidationPipe } from "@nestjs/common";
import { AdoptNumberDto, StartProvisioningRunDto } from "./telephony.dto";

/**
 * The global pipe from bootstrap.ts. The controller spec calls `controller.startRun(dto)`
 * directly and so never sees it – but it is the pipe, not the service, that decides what an
 * HTTP client can actually send, so the DTO's own rules have to be driven through a real one.
 */
const pipe = new ValidationPipe({ whitelist: true, transform: true, forbidNonWhitelisted: true });
const throughPipe = (body: Record<string, unknown>) =>
  pipe.transform(body, { type: "body", metatype: StartProvisioningRunDto });

// Obviously-fake, correctly-shaped Twilio SIDs. Never a real SID, here or anywhere.
const BUNDLE_SID = `BU${"a".repeat(32)}`;
const ADDRESS_SID = `AD${"b".repeat(32)}`;

const body = (extra: Record<string, unknown> = {}) => ({
  mode: "BYO",
  byoAccountSid: `AC${"1".repeat(32)}`,
  byoAuthToken: "test-token",
  complianceInput: {
    legalName: "Legal Co",
    contactFirstName: "Ada",
    contactLastName: "Lovelace",
    email: "compliance@example.org",
    address: { street: "1 Test St", city: "Sydney", region: "NSW", postalCode: "2000" },
  },
  ...extra,
});

describe("StartProvisioningRunDto BYO extras", () => {
  it("accepts a well-formed bundle, address, region and edge", async () => {
    await expect(
      throughPipe(body({ byoBundleSid: BUNDLE_SID, byoAddressSid: ADDRESS_SID, byoRegion: "au1", byoEdge: "sydney" })),
    ).resolves.toMatchObject({
      byoBundleSid: BUNDLE_SID,
      byoAddressSid: ADDRESS_SID,
      byoRegion: "au1",
      byoEdge: "sydney",
    });
  });

  // These four are hand-pasted from another Twilio console. A malformed SID reaches Twilio
  // as junk at the purchase call – days of skipped compliance review later – so the wire is
  // where it should be refused, with a message that names the field.
  it.each([
    ["byoBundleSid", "BUtooshort"],
    ["byoBundleSid", ADDRESS_SID], // right length, wrong prefix
    ["byoBundleSid", `BU${"z".repeat(32)}`], // not hex
    ["byoAddressSid", "ADtooshort"],
    ["byoAddressSid", BUNDLE_SID],
    ["byoRegion", "australia"],
    ["byoRegion", "au"],
    ["byoEdge", "sydney NSW"],
    ["byoEdge", "sy"],
  ])("rejects %s = %s", async (field, value) => {
    await expect(throughPipe(body({ [field]: value }))).rejects.toMatchObject({
      response: { message: [expect.stringContaining(field)] },
    });
  });

  // A copied SID arrives with the whitespace the copy picked up, and an operator reading
  // "AU1" off the Twilio console types "AU1". The service normalises both; the DTO used to
  // reject them first, which made that normalisation – and the test asserting it – unreachable.
  it("trims a pasted value and accepts a region/edge in any case", async () => {
    await expect(
      throughPipe(body({ byoBundleSid: `  ${BUNDLE_SID}  `, byoRegion: "AU1", byoEdge: "Sydney" })),
    ).resolves.toMatchObject({ byoBundleSid: BUNDLE_SID, byoRegion: "AU1", byoEdge: "Sydney" });
  });

  it("still accepts a run that supplies none of them", async () => {
    await expect(throughPipe(body())).resolves.toMatchObject({ mode: "BYO" });
  });

  it("rejects an undeclared property outright", async () => {
    await expect(throughPipe(body({ byoBundleSidTypo: BUNDLE_SID }))).rejects.toBeDefined();
  });
});

/**
 * AdoptNumberDto. The SID is pasted from the adoptable-numbers listing and is the only thing
 * that names WHICH number is adopted – a malformed one reaches Twilio as a lookup failure,
 * which is indistinguishable from "not your number", so it is refused at the wire.
 */
describe("AdoptNumberDto", () => {
  const adoptPipe = (b: Record<string, unknown>) =>
    pipe.transform(b, { type: "body", metatype: AdoptNumberDto });
  const PHONE_SID = `PN${"c".repeat(32)}`;

  it("accepts a well-formed phone number SID and trims a pasted one", async () => {
    await expect(adoptPipe({ phoneNumberSid: `  ${PHONE_SID}  ` })).resolves.toMatchObject({
      phoneNumberSid: PHONE_SID,
    });
  });

  it.each([
    ["PNtooshort"],
    [`BU${"a".repeat(32)}`], // right length, wrong prefix
    [`PN${"z".repeat(32)}`], // not hex
  ])("rejects %s", async (value) => {
    await expect(adoptPipe({ phoneNumberSid: value })).rejects.toMatchObject({
      response: { message: [expect.stringContaining("phoneNumberSid")] },
    });
  });

  it("requires a phone number SID at all", async () => {
    await expect(adoptPipe({})).rejects.toBeDefined();
  });

  // The claim flags are booleans, not truthy strings: "false" from a hand-rolled form must
  // not read as an opt-in to overwrite a live configuration.
  it("carries both hook opt-ins as booleans and rejects a string", async () => {
    await expect(
      adoptPipe({ phoneNumberSid: PHONE_SID, claimSmsHook: true, claimVoiceHook: false }),
    ).resolves.toMatchObject({ claimSmsHook: true, claimVoiceHook: false });

    await expect(adoptPipe({ phoneNumberSid: PHONE_SID, claimVoiceHook: "true" })).rejects.toBeDefined();
  });

  it("strips anything the DTO does not declare", async () => {
    await expect(
      adoptPipe({ phoneNumberSid: PHONE_SID, tenantId: "someone-elses-tenant" }),
    ).rejects.toBeDefined();
  });
});
