import { MessageChannel } from "../../src/generated/prisma";
import { normalizePhoneE164 } from "../common/utils/phone.utils";

/**
 * Split a Twilio address into its channel and bare E.164 number. WhatsApp
 * addresses arrive prefixed `whatsapp:+E164`; SMS arrives as plain `+E164`.
 */
export function parseChannelAddress(raw: string): {
  channel: MessageChannel;
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

/** Coerce an arbitrary string into a known MessageChannel (defaults to SMS). */
export function coerceChannel(value: unknown): MessageChannel {
  return String(value).toUpperCase() === MessageChannel.WHATSAPP
    ? MessageChannel.WHATSAPP
    : MessageChannel.SMS;
}
