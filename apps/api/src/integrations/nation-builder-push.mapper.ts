import type { DataSyncSettings } from "./data-sync-settings";

/**
 * Pure uprise → NationBuilder mapping for the push worker. No I/O, no Prisma — the
 * worker re-reads the authoritative rows and hands their fields here; this decides
 * exactly what leaves uprise (data minimisation: codes and structured values, never
 * free text unless a setting explicitly opts a stream in).
 */

export type NbWriteOp =
  | { kind: "addTags"; tags: string[] }
  | {
      kind: "logContact";
      method: string;
      statusCode?: string;
      note?: string;
      senderId?: number;
    }
  | { kind: "updatePersonFields"; fields: Record<string, unknown> };

/** uprise SupportLevel → NationBuilder's native 1–5 scale (1 = strong support). */
export const NB_SUPPORT_LEVEL: Record<string, number> = {
  STRONG_SUPPORT: 1,
  LEAN_SUPPORT: 2,
  UNDECIDED: 3,
  LEAN_OPPOSE: 4,
  STRONG_OPPOSE: 5,
};

/** uprise engagement channel → NB contact-log method. Platform-fixed slugs, enumerable at
 *  GET /api/v1/settings/contact_methods — note SMS is "text", NOT "text_message" (verified
 *  against the People API docs; an invalid slug is rejected, not coerced). */
export const NB_CONTACT_METHOD: Record<string, string> = {
  DOOR: "door_knock",
  SMS: "text",
  PHONE: "phone_call",
  BOTH: "other",
};

export type DispositionPushInput = {
  code: string;
  channel: string;
  supportLevel: string | null;
  /** Row-level consent stamp — the APP 3 gate for the support level. */
  consentAt: Date | string | null;
  notes?: string | null;
};

/**
 * A recorded disposition → an NB contact log, plus — only when the connection's toggle
 * is on AND the row carries affirmative consent — a person-field update setting the
 * support level. Two operations because NB's contact resource has NO support_level
 * field (verified against the People API docs — it would be silently dropped): the
 * level lives on the person, set via `PUT /people/:id`. Without both gates the contact
 * log still goes (attempt history is not sensitive) and the ledger records the
 * withholding honestly.
 */
export function mapDispositionToOps(
  input: DispositionPushInput,
  settings: DataSyncSettings,
): { ops: NbWriteOp[]; withheld: string[] } {
  const withheld: string[] = [];
  const method = NB_CONTACT_METHOD[input.channel] ?? "other";
  const level = input.supportLevel ? NB_SUPPORT_LEVEL[input.supportLevel] : undefined;
  const consented = Boolean(input.consentAt);
  const includeLevel =
    level != null && settings.push.supportLevelsEnabled && (!settings.push.supportLevelRequiresConsent || consented);
  if (level != null && !includeLevel) withheld.push("support_level");
  return {
    ops: [
      {
        kind: "logContact",
        method,
        statusCode: input.code,
        ...(settings.push.nbSenderId != null ? { senderId: settings.push.nbSenderId } : {}),
      },
      ...(includeLevel
        ? [{ kind: "updatePersonFields" as const, fields: { support_level: level } }]
        : []),
    ],
    withheld,
  };
}

/** A tag applied in uprise → the same tag on the NB person (optionally prefixed). */
export function mapTagToOps(tagKey: string, settings: DataSyncSettings): { ops: NbWriteOp[]; withheld: string[] } {
  const key = String(tagKey ?? "").trim();
  if (!key) return { ops: [], withheld: [] };
  const prefix = settings.push.tagPrefix.trim();
  return { ops: [{ kind: "addTags", tags: [prefix ? `${prefix}${key}` : key] }], withheld: [] };
}

/**
 * A survey answer → a contact-log note ("Survey: <question> – <answer>"). Structured
 * values only — the question prompt and the chosen option label / recorded value.
 * A real NB survey_responses mapping (per-survey NB ids) is phase-3 work.
 */
export function mapSurveyToOps(
  input: { questionPrompt: string; answer: string; channel: string },
  settings: DataSyncSettings,
): { ops: NbWriteOp[]; withheld: string[] } {
  const answer = String(input.answer ?? "").trim();
  if (!answer) return { ops: [], withheld: [] };
  const prompt = String(input.questionPrompt ?? "").trim().slice(0, 200);
  return {
    ops: [
      {
        kind: "logContact",
        method: NB_CONTACT_METHOD[input.channel] ?? "other",
        note: `Survey: ${prompt} – ${answer.slice(0, 500)}`,
        ...(settings.push.nbSenderId != null ? { senderId: settings.push.nbSenderId } : {}),
      },
    ],
    withheld: [],
  };
}

/**
 * An uprise opt-out → NB do-not-contact flags. One-way tighten only (uprise never
 * pushes an opt-IN), and not gated by any stream toggle — propagating a STOP to the
 * org's CRM is a compliance duty, on whenever push is on.
 */
export function mapOptOutToOps(input: { channel: string }): { ops: NbWriteOp[]; withheld: string[] } {
  const fields: Record<string, unknown> =
    input.channel === "VOICE" ? { do_not_call: true } : { mobile_opt_in: false };
  return { ops: [{ kind: "updatePersonFields", fields }], withheld: [] };
}

/** An inbound text reply → a contact-log note carrying the body. The stream is OFF by
 *  default (message bodies into a CRM is a privacy opt-in); by the time this runs the
 *  toggle has been checked twice, so the mapper just formats. */
export function mapTextReplyToOps(
  input: { body: string },
  settings: DataSyncSettings,
): { ops: NbWriteOp[]; withheld: string[] } {
  const body = String(input.body ?? "").trim();
  if (!body) return { ops: [], withheld: [] };
  return {
    ops: [
      {
        kind: "logContact",
        // NB's fixed method slug for SMS is "text" (NOT "text_message").
        method: "text",
        note: `Text reply: ${body.slice(0, 500)}`,
        ...(settings.push.nbSenderId != null ? { senderId: settings.push.nbSenderId } : {}),
      },
    ],
    withheld: [],
  };
}

/** An event RSVP → a stable per-event tag + a note naming the event. Real NB RSVP
 *  objects (per-event NB page mapping) are phase-3. */
export function mapRsvpToOps(
  input: { eventId: string; eventTitle: string; kind: "created" | "cancelled" | "attended" },
  settings: DataSyncSettings,
): { ops: NbWriteOp[]; withheld: string[] } {
  const prefix = settings.push.tagPrefix.trim();
  const shortId = input.eventId.slice(-8);
  const verb = input.kind === "created" ? "RSVP" : input.kind === "attended" ? "Attended" : "RSVP cancelled";
  const tag = `${prefix}uprise-${input.kind === "attended" ? "attended" : "rsvp"}-${shortId}`;
  return {
    ops: [
      // A cancellation logs the note but never tags (NB tag removal is phase-3 work).
      ...(input.kind === "cancelled" ? [] : [{ kind: "addTags" as const, tags: [tag] }]),
      {
        kind: "logContact",
        method: "other",
        note: `${verb}: ${String(input.eventTitle ?? "").trim().slice(0, 200)}`,
        ...(settings.push.nbSenderId != null ? { senderId: settings.push.nbSenderId } : {}),
      },
    ],
    withheld: [],
  };
}
