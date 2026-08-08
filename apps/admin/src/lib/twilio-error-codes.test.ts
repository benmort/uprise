import { describe, expect, it } from "vitest";
import { getTwilioErrorCodeDescription } from "./twilio-error-codes";

/**
 * The blast detail page builds a recipient's failure reason as
 * `Category: … | Code: 30003 (Unreachable destination handset) | …`. The parenthetical is the only
 * part an organiser can actually read, so what matters here is: a known code resolves to real prose,
 * an unknown one degrades to a bare code rather than to "undefined"/"null" on screen, and the
 * normalisation is forgiving enough for what the Twilio status callback actually stores.
 * See getRecipientReason in src/app/(main)/blasts/[id]/page.tsx.
 */

describe("getTwilioErrorCodeDescription", () => {
  it("resolves a known code to its description", () => {
    expect(getTwilioErrorCodeDescription("30003")).toBe("Unreachable destination handset");
    expect(getTwilioErrorCodeDescription("21610")).toBe("Attempt to send to unsubscribed recipient");
  });

  /**
   * Twilio ships new codes faster than this table is regenerated, so an unrecognised code is the
   * normal case, not an exceptional one. Returning null is what keeps the reason string as
   * "Code: 39999" instead of "Code: 39999 (undefined)".
   */
  it("returns null for a code it has never heard of", () => {
    expect(getTwilioErrorCodeDescription("39999")).toBeNull();
    expect(getTwilioErrorCodeDescription("99999999")).toBeNull();
  });

  // Not every failure carries a provider code – an internal skip has none at all.
  it("returns null when there is no code", () => {
    expect(getTwilioErrorCodeDescription(null)).toBeNull();
    expect(getTwilioErrorCodeDescription(undefined)).toBeNull();
    expect(getTwilioErrorCodeDescription("")).toBeNull();
  });

  // A callback that posted errorCode=" " must read as "no code", not as a lookup miss on a blank key.
  it("treats a whitespace-only code as no code", () => {
    expect(getTwilioErrorCodeDescription("   ")).toBeNull();
    expect(getTwilioErrorCodeDescription("\n\t")).toBeNull();
  });

  /**
   * applyTwilioStatusCallback stores `String(payload.errorCode).trim()`, but the same reason string
   * is also built from codes scraped out of free-text error messages upstream, where the padding
   * survives. Trimming here is what stops an otherwise well-known code rendering bare.
   */
  it("trims the code before looking it up", () => {
    expect(getTwilioErrorCodeDescription("  30007  ")).toBe("Message filtered");
    expect(getTwilioErrorCodeDescription("\t21211\n")).toBe("Invalid 'To' Phone Number");
  });

  /**
   * The table is keyed by the exact Twilio code. Zero-padding or a "30003-ish" near miss is a
   * different code, and inventing a description for it would tell an organiser the wrong story
   * about why the message failed – silence is safer.
   */
  it("does not match a code that only looks like a known one", () => {
    expect(getTwilioErrorCodeDescription("030003")).toBeNull();
    expect(getTwilioErrorCodeDescription("300030")).toBeNull();
    expect(getTwilioErrorCodeDescription("3000")).toBeNull();
  });

  // errorCode is a free-text column, so non-numeric junk reaches this function; it must not resolve.
  it("returns null for a non-numeric code", () => {
    expect(getTwilioErrorCodeDescription("SMS_FAILED")).toBeNull();
    expect(getTwilioErrorCodeDescription("ETIMEDOUT")).toBeNull();
  });

  /**
   * The declared parameter type is `string`, but the value originates in webhook JSON where Twilio
   * has been known to send the code as a number. The String() coercion is the reason a numeric code
   * still explains itself rather than silently falling back to a bare digit.
   */
  it("copes with a code that arrived as a number", () => {
    expect(getTwilioErrorCodeDescription(30003 as unknown as string)).toBe(
      "Unreachable destination handset",
    );
  });
});

/**
 * These are the codes apps/api/src/blasts/twilio-failure-scope.ts classifies by hand
 * (EXTERNAL_CODE_CATEGORY) plus the carrier 30xxx band it buckets by range. They are the codes an
 * organiser is most likely to see on a failed blast, and each is paired on screen with a category
 * label – a missing description there leaves the category unexplained. A spot check of these beats
 * asserting all ~2 800 generated rows.
 */
describe("the codes the blast failure surface actually shows", () => {
  const classifiedByTheApi: Array<[string, string]> = [
    ["21211", "Invalid 'To' Phone Number"],
    ["21214", "'To' phone number cannot be reached"],
    ["21217", "Phone number does not appear to be valid"],
    ["21265", "'To' number cannot be a Short Code"],
    ["21408", "Message blocked: permissions disabled for the destination region"],
    ["21610", "Attempt to send to unsubscribed recipient"],
    ["21614", "'To' number is not a valid mobile number"],
    ["30003", "Unreachable destination handset"],
    ["30004", "Message blocked"],
    ["30005", "Unknown destination handset"],
    ["30006", "Landline or unreachable carrier"],
    ["30007", "Message filtered"],
    ["30008", "Unknown error"],
    ["30034", "US A2P 10DLC - Message from an Unregistered Number"],
    ["63016", "Outside messaging window. For WhatsApp, use a Message Template instead"],
    ["63033", "Recipient opted out to receive message"],
    ["63051", "WhatsApp Sender or Account is Locked"],
  ];

  it.each(classifiedByTheApi)("explains %s", (code, description) => {
    expect(getTwilioErrorCodeDescription(code)).toBe(description);
  });

  /**
   * The opt-out codes are the ones an organiser must be able to act on – they mean "stop contacting
   * this person", not "retry later". Whichever of the two Twilio sends, the reason string has to say
   * so in words.
   */
  it("names the opt-out codes in words an organiser can act on", () => {
    expect(getTwilioErrorCodeDescription("21610")).toMatch(/unsubscribed/i);
    expect(getTwilioErrorCodeDescription("63033")).toMatch(/opted out/i);
  });

  // A code that resolved to "" would render as "Code: 30003 ()" – worse than no parenthetical at all.
  it("never resolves a known code to an empty or whitespace description", () => {
    for (const [code] of classifiedByTheApi) {
      expect(getTwilioErrorCodeDescription(code)?.trim()).toBeTruthy();
    }
  });
});
