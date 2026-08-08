import { describe, expect, it } from "vitest";
import { BLAST_PAYLOAD_FIELDS, buildBlastPayload, type BlastPayloadInput } from "./blast-payload";

const input = (over: Partial<BlastPayloadInput> = {}): BlastPayloadInput => ({
  campaignName: "Rally reminder",
  audienceId: "aud1",
  template: "Hi {{name}}",
  channel: "SMS",
  fromNumberId: "num1",
  linkedCampaignId: "camp1",
  p2p: false,
  contentSid: "",
  contentVariableMap: {},
  ...over,
});

describe("buildBlastPayload", () => {
  it("carries the edited fields", () => {
    expect(buildBlastPayload(input())).toMatchObject({
      title: "Rally reminder",
      audienceId: "aud1",
      bodyTemplate: "Hi {{name}}",
      channel: "SMS",
      fromNumberId: "num1",
      campaignId: "camp1",
      p2p: false,
    });
  });

  /**
   * THE regression. `value || undefined` made a clear unrepresentable: JSON.stringify drops an
   * undefined key, and the API only acts on a field that is `!== undefined`. So picking "Default
   * number (auto)" saved nothing while the header read "Saved at HH:MM", and the blast still sent
   * from the number the organiser had just removed.
   */
  it("sends null to CLEAR the pinned number, not undefined", () => {
    const payload = buildBlastPayload(input({ fromNumberId: "" }));
    expect(payload.fromNumberId).toBeNull();
    // Survives serialisation — an undefined would vanish here.
    expect(JSON.parse(JSON.stringify(payload))).toHaveProperty("fromNumberId", null);
  });

  it("sends null to UNLINK the campaign / text bank", () => {
    const payload = buildBlastPayload(input({ linkedCampaignId: "" }));
    expect(payload.campaignId).toBeNull();
    expect(JSON.parse(JSON.stringify(payload))).toHaveProperty("campaignId", null);
  });

  it("keeps the P2P flag, including when false", () => {
    expect(buildBlastPayload(input({ p2p: true })).p2p).toBe(true);
    expect(JSON.parse(JSON.stringify(buildBlastPayload(input({ p2p: false }))))).toHaveProperty("p2p", false);
  });

  // Sending WhatsApp template fields on an SMS blast would overwrite an unrelated template.
  it("only includes the WhatsApp template fields on a WhatsApp blast", () => {
    const sms = buildBlastPayload(input({ channel: "SMS", contentSid: "HX123" }));
    expect(sms).not.toHaveProperty("contentSid");
    expect(sms).not.toHaveProperty("contentVariableMap");

    const wa = buildBlastPayload(
      input({ channel: "WHATSAPP", contentSid: "HX123", contentVariableMap: { "1": "name" } }),
    );
    expect(wa.contentSid).toBe("HX123");
    expect(wa.contentVariableMap).toEqual({ "1": "name" });
  });

  it("omits an unset audience rather than clearing it", () => {
    // The composer switches audiences, it never clears one — absent must stay absent.
    expect(buildBlastPayload(input({ audienceId: "" })).audienceId).toBeUndefined();
  });
});

describe("BLAST_PAYLOAD_FIELDS", () => {
  /**
   * The autosave dep array must cover every field the payload can carry. `p2p` and
   * `linkedCampaignId` were missing from it, so ticking the P2P box issued no PATCH at all —
   * and that flag is the only thing stopping `dispatchDueScheduled` auto-batching a blast the
   * volunteers were meant to press-send themselves.
   */
  it("names every input the payload reads", () => {
    const sample = input();
    for (const field of BLAST_PAYLOAD_FIELDS) {
      expect(sample).toHaveProperty(field);
    }
    expect(new Set(BLAST_PAYLOAD_FIELDS).size).toBe(BLAST_PAYLOAD_FIELDS.length);
    expect(BLAST_PAYLOAD_FIELDS).toContain("p2p");
    expect(BLAST_PAYLOAD_FIELDS).toContain("linkedCampaignId");
  });
});
