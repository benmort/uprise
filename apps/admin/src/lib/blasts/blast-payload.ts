import type { MessageChannel } from "@/lib/api";

/**
 * The composer's PATCH/POST body, extracted so it can be tested.
 *
 * Two bugs lived in the inline version, both invisible because the header still said
 * "Autosave: Saved at HH:MM":
 *
 * 1. Every optional field was sent as `value || undefined`, and `JSON.stringify` drops an
 *    undefined key. The API distinguishes the two —
 *    `...(dto.fromNumberId !== undefined ? { fromNumberId: dto.fromNumberId || null } : {})`
 *    — so CLEARING a value was unrepresentable. Picking "Default number (auto)" or unlinking a
 *    text bank saved nothing and the blast still sent from the number the organiser removed.
 * 2. The autosave dep array omitted `p2p` and `campaignId`, so ticking the P2P box never issued
 *    a PATCH at all. That flag is what makes `dispatchDueScheduled` skip auto-batching, so a
 *    blast meant for volunteers to press-send sent itself.
 *
 * `null` clears, `undefined` leaves alone. Keeping that distinction here — rather than in JSX —
 * is what makes it assertable.
 */
export type BlastPayloadInput = {
  campaignName: string;
  audienceId: string;
  template: string;
  channel: MessageChannel;
  /** `null` is the composer's own "Default number (auto)" state, so it is accepted here. */
  fromNumberId: string | null;
  linkedCampaignId: string;
  p2p: boolean;
  contentSid: string;
  contentVariableMap: Record<string, string>;
};

export type BlastPayload = {
  title: string;
  audienceId?: string;
  bodyTemplate: string;
  channel: MessageChannel;
  fromNumberId: string | null;
  campaignId: string | null;
  p2p: boolean;
  contentSid?: string;
  contentVariableMap?: Record<string, string>;
};

export function buildBlastPayload(input: BlastPayloadInput): BlastPayload {
  return {
    title: input.campaignName,
    // An audience is never "cleared" from the composer — it is switched — so absent stays absent.
    audienceId: input.audienceId || undefined,
    bodyTemplate: input.template,
    channel: input.channel,
    // `null`, not `undefined`: an empty selection is a deliberate clear the API must receive.
    fromNumberId: input.fromNumberId || null,
    campaignId: input.linkedCampaignId || null,
    p2p: input.p2p,
    // WhatsApp-only fields; sending them on an SMS blast would overwrite an unrelated template.
    ...(input.channel === "WHATSAPP"
      ? { contentSid: input.contentSid || undefined, contentVariableMap: input.contentVariableMap }
      : {}),
  };
}

/**
 * Every field `buildBlastPayload` can emit. The autosave effect's dep array must cover all of
 * them, or editing one shows "Saved" while nothing persists — which is exactly how the P2P flag
 * went missing. Exported so a test can hold the two in lockstep.
 */
export const BLAST_PAYLOAD_FIELDS = [
  "campaignName",
  "audienceId",
  "template",
  "channel",
  "fromNumberId",
  "linkedCampaignId",
  "p2p",
  "contentSid",
  "contentVariableMap",
] as const satisfies ReadonlyArray<keyof BlastPayloadInput>;
