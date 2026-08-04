import type { CallWidgetScreen } from "@uprise/ui";

/**
 * The widget's screen state machine: SSE progress events (the source's Pusher
 * vocabulary, replayed over the durable ledger) fold into the CallWidget's
 * screen. Pure — the container owns transport (EventSource, Voice SDK) and
 * feeds events in; keeping this a reducer makes the taxonomy unit-testable.
 */

export type { ProgressEvent } from "./progress-events";
import type { ProgressEvent } from "./progress-events";

const str = (value: unknown): string | undefined => (typeof value === "string" ? value : undefined);

/** True for the screens a progress event may act on (a live call). */
function inFlight(screen: CallWidgetScreen): boolean {
  return screen.kind === "connecting" || screen.kind === "in-call";
}

export function reduceProgress(screen: CallWidgetScreen, event: ProgressEvent): CallWidgetScreen {
  const payload = event.payload ?? {};

  // Terminal events apply from any live state.
  if (event.name === "call_ended") {
    if (screen.kind === "ended" || screen.kind === "error") return screen;
    return { kind: "ended" };
  }
  if (event.name === "error") {
    return { kind: "error", message: str(payload.message) ?? "Something went wrong with the call.", canRetry: true };
  }

  if (!inFlight(screen)) return screen;

  switch (event.name) {
    case "call_started":
    case "call_connected":
      return { kind: "in-call", view: { kind: "waiting" } };
    case "call_electoral_postcode":
      return { kind: "in-call", view: { kind: "postcode" } };
    case "call_electoral_lookup": {
      const options = Array.isArray(payload.electorates)
        ? (payload.electorates as unknown[]).filter((o): o is string => typeof o === "string")
        : [];
      // A single electorate flows straight on to the connect events; only a
      // genuine ambiguity needs the on-screen menu.
      if (options.length > 1) return { kind: "in-call", view: { kind: "districts", options } };
      return { kind: "in-call", view: { kind: "waiting" } };
    }
    case "call_select_electorate":
      return { kind: "in-call", view: { kind: "waiting" } };
    case "call_electoral_target":
    case "call_redirecting":
      return { kind: "in-call", view: { kind: "redirecting", name: str(payload.name) ?? null } };
    case "call_survey": {
      const rawOptions = Array.isArray(payload.options) ? (payload.options as unknown[]) : [];
      const options = rawOptions
        .map((o) => {
          const rec = (o ?? {}) as Record<string, unknown>;
          const digit = str(rec.digit);
          const label = str(rec.label);
          return digit && label ? { digit, label } : null;
        })
        .filter((o): o is { digit: string; label: string } => o !== null);
      return {
        kind: "in-call",
        view: { kind: "survey", question: str(payload.question) ?? "Choose an option", options },
      };
    }
    case "call_survey_result":
      return { kind: "in-call", view: { kind: "waiting" } };
    case "call_connected_conference":
      return { kind: "in-call", view: { kind: "connected", name: str(payload.name) ?? null } };
    case "call_target_hangup":
      return { kind: "in-call", view: { kind: "target-gone" } };
    case "call_disconnected": {
      // The target leg ending mid-call shows target-gone; the caller leg's own
      // end arrives through the Voice SDK's disconnect, not this stream.
      if (str(payload.leg) === "target" && screen.kind === "in-call") {
        return { kind: "in-call", view: { kind: "target-gone" } };
      }
      return screen;
    }
    default:
      return screen;
  }
}
