import type { EventEnvelope, Reaction } from "@uprise/events";
import type { CrmPushService, PushStream } from "./crm-push.service";
import type { DomainLogger } from "../common/logging/domain-logger.service";

/**
 * CRM write-back reactions — the THIN half of the push pipeline. Each does exactly one
 * thing: hand the event to `CrmPushService.recordEventForPush`, which records a delivery
 * ledger row and enqueues. Never call the CRM inline here: `ReactionRegistry.dispatch`
 * swallows reaction errors with no retry, so anything fallible in a reaction is lost
 * work — the ledger + queue + sweep own reliability instead.
 *
 * Every reaction declares `emits: []` — loop safety by construction. The one genuine
 * loop (a tag imported FROM NationBuilder echoing back to it) is broken inside
 * `recordEventForPush` by the `source === "nation_builder"` filter.
 *
 * PR 6 wires the disposition + tag streams; the remaining streams (opt-out, text reply,
 * survey, RSVP) register here as they land so the trigger list is always this file.
 */
export function buildCrmPushReactions(deps: {
  crmPush: CrmPushService;
  logger: DomainLogger;
}): Reaction[] {
  const { crmPush, logger } = deps;

  const record = (stream: PushStream) => async (event: EventEnvelope) => {
    try {
      await crmPush.recordEventForPush(event, stream);
    } catch (error) {
      // The registry would swallow this anyway — log with enough to find the event in
      // the outbox for a manual replay (the documented residual-loss recovery).
      logger.warn("integrations", "crm-push reaction failed to record", {
        eventId: event.id,
        eventType: event.eventType,
        stream,
        error: String(error).slice(0, 300),
      });
    }
  };

  return [
    { trigger: "canvass.disposition.set", emits: [], handle: record("disposition") },
    { trigger: "contacts.tag.added", emits: [], handle: record("tag") },
    { trigger: "canvass.survey.answered", emits: [], handle: record("survey") },
    // Opt-outs from both directions a supporter can say stop: the dialler's DNC and a
    // messaging STOP/consent transition. Always-on with push (compliance duty).
    { trigger: "autodialer.contact.opted-out", emits: [], handle: record("opt_out") },
    { trigger: "messaging.consent.changed", emits: [], handle: record("opt_out") },
    { trigger: "messaging.inbound.received", emits: [], handle: record("text_reply") },
    { trigger: "events.rsvp.created", emits: [], handle: record("rsvp") },
    { trigger: "events.rsvp.cancelled", emits: [], handle: record("rsvp") },
    { trigger: "events.rsvp.attended", emits: [], handle: record("rsvp") },
  ];
}
