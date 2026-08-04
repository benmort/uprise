import { MessageChannel } from "@uprise/db";
import { normalizePhoneE164 } from "../common/utils/phone.utils";

/**
 * The channels a conversation can happen on. MessageChannel also carries VOICE
 * (consent bookkeeping for the autodialer), which is not a messaging channel —
 * narrowing here keeps every send path statically unable to receive it.
 */
export type ConversationChannel = Extract<MessageChannel, "SMS" | "WHATSAPP">;

/**
 * Split a Twilio address into its channel and bare E.164 number. WhatsApp
 * addresses arrive prefixed `whatsapp:+E164`; SMS arrives as plain `+E164`.
 */
export function parseChannelAddress(raw: string): {
  channel: ConversationChannel;
  phoneE164: string;
} {
  const value = String(raw || "").trim();
  if (value.toLowerCase().startsWith("whatsapp:")) {
    return {
      channel: MessageChannel.WHATSAPP,
      phoneE164: normalizePhoneE164(value.slice("whatsapp:".length)),
    };
  }
  return { channel: MessageChannel.SMS, phoneE164: normalizePhoneE164(value) };
}

/** Coerce an arbitrary string into a conversation channel (defaults to SMS). */
export function coerceChannel(value: unknown): ConversationChannel {
  return String(value).toUpperCase() === MessageChannel.WHATSAPP
    ? MessageChannel.WHATSAPP
    : MessageChannel.SMS;
}
